import { statusAfterSendFailure } from '../sendFailure'
import { createId } from '@shared/id'
import type { HarkMainEvent, HarkRpcRequest, HarkRpcResponse } from '@shared/ipc'
import { getBotHubBridge } from '../meta-muse/electronBridge'
import {
  AdapterError,
  type AdapterEvent,
  type AdapterListener,
  type ConnectionStatus,
  type IncomingMessage,
  type OutgoingMessage,
  type PlatformAccount,
  type PlatformAdapter,
  type SendReceipt,
  type Unsubscribe
} from '../types'

async function invokeHarkRpc(request: HarkRpcRequest): Promise<unknown> {
  const bridge = getBotHubBridge()?.hark
  if (!bridge?.rpc) {
    throw new AdapterError('not-connected', 'Hark IPC unavailable (Electron main required)')
  }
  const res = (await bridge.rpc(request)) as HarkRpcResponse
  if (!res.ok) {
    throw new AdapterError(
      res.status === 401 ? 'not-connected' : 'network',
      res.message || `Hark RPC failed (${res.status})`
    )
  }
  return res.data
}

/**
 * Hark platform adapter — Google better-auth login in a partition window,
 * then main-process REST for list / send / poll.
 */
export class HarkAdapter implements PlatformAdapter {
  readonly id = 'hark' as const
  readonly name = 'Hark'

  private readonly accounts = new Map<string, PlatformAccount>()
  private readonly statuses = new Map<string, ConnectionStatus>()
  private readonly listeners = new Set<AdapterListener>()
  private readonly mainConversationId = new Map<string, string>()
  private bridgeUnsub: Unsubscribe | null = null

  constructor() {
    this.bindBridgeEvents()
  }

  private bindBridgeEvents(): void {
    const b = getBotHubBridge()
    if (!b?.hark || this.bridgeUnsub) return
    this.bridgeUnsub = b.hark.onEvent((event) => this.handleMainEvent(event))
  }

  private handleMainEvent(event: HarkMainEvent): void {
    if (event.type === 'activity') {
      this.emit({
        type: 'activity',
        accountId: event.accountId,
        activity: {
          code: event.activityCode,
          text: event.activityText ?? null,
          emoji: event.activityEmoji ?? null,
          agentId: null,
          subagents: 0,
          busy: event.busy
        }
      })
      return
    }
    if (event.type === 'stream') {
      const convId = event.conversationId ?? event.accountId
      if (!event.done) {
        this.emit({
          type: 'typing',
          conversationId: convId,
          accountId: event.accountId,
          isTyping: true
        })
        if (event.text || event.tools?.length || event.media?.length || event.richWidgets?.length) {
          this.emit({
            type: 'message_delta',
            messageId: event.messageId,
            conversationId: convId,
            accountId: event.accountId,
            text: event.text,
            tools: event.tools,
            media: event.media,
            richWidgets: event.richWidgets
          })
        }
      } else {
        this.emit({
          type: 'typing',
          conversationId: convId,
          accountId: event.accountId,
          isTyping: false
        })
        this.emit({
          type: 'activity',
          accountId: event.accountId,
          activity: {
            code: 'idle',
            text: null,
            emoji: null,
            agentId: null,
            subagents: 0,
            busy: false
          }
        })
        this.setStatus(event.accountId, 'online')
        if (event.text || event.tools?.length || event.media?.length || event.richWidgets?.length) {
          this.emit({
            type: 'message',
            message: {
              id: event.messageId,
              conversationId: convId,
              accountId: event.accountId,
              text: event.text,
              createdAt: Date.now(),
              tools: event.tools,
              media: event.media,
              richWidgets: event.richWidgets
            }
          })
        }
      }
      return
    }
    if (event.type !== 'login') return
    if (event.signedIn) {
      this.emit({
        type: 'login',
        accountId: event.accountId,
        signedIn: true,
        handle: event.handle,
        displayName: event.displayName
      })
      const existing = this.accounts.get(event.accountId)
      this.accounts.set(event.accountId, {
        id: event.accountId,
        platformId: 'hark',
        displayName: event.displayName ?? existing?.displayName ?? 'Hark',
        handle: event.handle ?? existing?.handle ?? event.accountId
      })
      this.setStatus(event.accountId, 'online')
      return
    }
    this.emit({
      type: 'login',
      accountId: event.accountId,
      signedIn: false,
      windowClosed: event.windowClosed
    })
    this.setStatus(event.accountId, 'offline')
  }

  private emit(event: AdapterEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[hark] listener failed', error)
      }
    }
  }

  private setStatus(accountId: string, status: ConnectionStatus, detail?: string): void {
    this.statuses.set(accountId, status)
    this.emit({ type: 'status', accountId, status, detail })
  }

  private upsert(accountId: string, patch?: Partial<PlatformAccount>): void {
    const prev = this.accounts.get(accountId)
    this.accounts.set(accountId, {
      id: accountId,
      platformId: 'hark',
      displayName: patch?.displayName ?? prev?.displayName ?? 'Hark',
      handle: patch?.handle ?? prev?.handle ?? accountId,
      avatarUrl: patch?.avatarUrl ?? prev?.avatarUrl
    })
    if (!this.statuses.has(accountId)) this.statuses.set(accountId, 'offline')
  }

  async listAccounts(): Promise<PlatformAccount[]> {
    return [...this.accounts.values()]
  }

  async connect(accountId: string): Promise<ConnectionStatus> {
    this.bindBridgeEvents()
    this.upsert(accountId)
    const bridge = getBotHubBridge()?.hark
    if (!bridge) {
      this.setStatus(accountId, 'offline', '需要 Electron')
      return 'offline'
    }
    try {
      const status = await bridge.authStatus(accountId)
      if (!status.signedIn) {
        this.setStatus(accountId, 'offline', '未登录 Hark')
        return 'offline'
      }
      this.upsert(accountId, { displayName: status.displayName, handle: status.handle })
      await this.refreshMainConversation(accountId)
      this.setStatus(accountId, 'online')
      return 'online'
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.setStatus(accountId, 'error', detail)
      return 'error'
    }
  }

  async disconnect(accountId: string): Promise<void> {
    this.setStatus(accountId, 'offline')
  }

  async openLogin(accountId: string, _botId?: string): Promise<ConnectionStatus> {
    this.bindBridgeEvents()
    this.upsert(accountId)
    const bridge = getBotHubBridge()?.hark
    if (!bridge?.openLogin) {
      throw new AdapterError('unsupported', 'Hark login needs the Electron app')
    }
    this.setStatus(accountId, 'busy', '在弹出的窗口里完成 Google 登录')
    try {
      const status = await bridge.openLogin({ accountId })
      if (status.signedIn) {
        this.upsert(accountId, { displayName: status.displayName, handle: status.handle })
        this.setStatus(accountId, 'online')
        return 'online'
      }
      return this.getStatus(accountId)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.setStatus(accountId, 'error', detail)
      return 'error'
    }
  }

  async cancelLogin(accountId: string): Promise<void> {
    const bridge = getBotHubBridge()?.hark
    await bridge?.cancelLogin?.(accountId)
    this.accounts.delete(accountId)
    this.statuses.delete(accountId)
    this.mainConversationId.delete(accountId)
  }

  private async refreshMainConversation(accountId: string): Promise<string | undefined> {
    const data = (await invokeHarkRpc({
      accountId,
      op: 'mainConversation',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })) as { conversationId?: string }
    if (data?.conversationId) {
      this.mainConversationId.set(accountId, data.conversationId)
      return data.conversationId
    }
    // Fall back to list
    const listed = await invokeHarkRpc({ accountId, op: 'listConversations' })
    const id = pickFirstConversationId(listed)
    if (id) this.mainConversationId.set(accountId, id)
    return id
  }

  async sendMessage(message: OutgoingMessage): Promise<SendReceipt> {
    this.bindBridgeEvents()
    let conversationId =
      this.mainConversationId.get(message.accountId) ??
      (await this.refreshMainConversation(message.accountId))
    if (!conversationId) {
      throw new AdapterError('network', 'No Hark conversation id (main/list empty)')
    }

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    this.setStatus(message.accountId, 'busy')
    this.emit({
      type: 'typing',
      conversationId: message.conversationId,
      accountId: message.accountId,
      isTyping: true
    })

    let accepted = false
    try {
      const before = (await invokeHarkRpc({
        accountId: message.accountId,
        op: 'mainConversation',
        timezone: timeZone
      })) as { messages?: Array<{ id: string }> }
      const beforeMsgs = Array.isArray(before?.messages) ? before.messages : []
      const afterIds = beforeMsgs.map((m) => m.id)

      const sent = (await invokeHarkRpc({
        accountId: message.accountId,
        op: 'sendMessage',
        conversationId,
        text: message.text,
        timezone: timeZone,
        attachments: message.attachments
          ?.filter((a) => Boolean(a.dataBase64))
          .map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            dataBase64: a.dataBase64!
          }))
      })) as {
        responseMessageId?: string
        idempotencyKey?: string
      }

      accepted = true
      if (sent?.idempotencyKey) afterIds.push(sent.idempotencyKey)

      const polled = (await invokeHarkRpc({
        accountId: message.accountId,
        op: 'pollReply',
        conversationId,
        botId: message.conversationId,
        responseMessageId: sent?.responseMessageId,
        timezone: timeZone,
        afterMessageCount: beforeMsgs.length,
        afterMessageIds: afterIds,
        timeoutMs: 90_000
      })) as {
        reply?: {
          id: string
          content: string
          role: string
          tools?: import('../types').MuseToolCall[]
          richWidgets?: import('../types').MuseRichWidget[]
        } | null
      }

      this.emit({
        type: 'typing',
        conversationId: message.conversationId,
        accountId: message.accountId,
        isTyping: false
      })
      this.emit({
        type: 'activity',
        accountId: message.accountId,
        activity: {
          code: 'idle',
          text: null,
          emoji: null,
          agentId: null,
          subagents: 0,
          busy: false
        }
      })

      const replyText = polled?.reply?.content?.trim() ?? ''
      const replyTools = polled?.reply?.tools
      const replyRich = polled?.reply?.richWidgets
      if (replyText || replyTools?.length || replyRich?.length) {
        const rawReplyId = polled?.reply?.id
        const normalizedReplyId = rawReplyId
          ? rawReplyId.startsWith('hark_')
            ? rawReplyId
            : `hark_${rawReplyId}`
          : createId('msg')
        const incoming: IncomingMessage & {
          tools?: import('../types').MuseToolCall[]
          richWidgets?: import('../types').MuseRichWidget[]
        } = {
          id: normalizedReplyId,
          conversationId: message.conversationId,
          accountId: message.accountId,
          text: replyText,
          createdAt: Date.now(),
          ...(replyTools?.length ? { tools: replyTools } : {}),
          ...(replyRich?.length ? { richWidgets: replyRich } : {})
        }
        this.emit({ type: 'message', message: incoming })
      }

      this.setStatus(message.accountId, 'online')
      return {
        messageId: createId('msg'),
        acceptedAt: Date.now(),
        sessionId: conversationId,
        ...(replyText || replyTools?.length || replyRich?.length ? {} : { noReply: true })
      }
    } catch (error) {
      this.emit({
        type: 'typing',
        conversationId: message.conversationId,
        accountId: message.accountId,
        isTyping: false
      })
      this.emit({
        type: 'activity',
        accountId: message.accountId,
        activity: {
          code: 'idle',
          text: null,
          emoji: null,
          agentId: null,
          subagents: 0,
          busy: false
        }
      })
      const detail = error instanceof Error ? error.message : String(error)
      // A send that timed out may have landed (harkFetch never retries writes):
      // report it as unanswered so the user does not blindly double-send.
      const writeTimedOut = /Hark (POST|PUT|PATCH) \S+ timed out/.test(detail)
      if (accepted || writeTimedOut) {
        // The message is (or may be) on Hark already; only the answer is missing.
        this.setStatus(message.accountId, 'online')
        throw new AdapterError('no-reply', `Hark 已收到消息，但读取回复失败：${detail}`)
      }
      const next = statusAfterSendFailure(error)
      this.setStatus(message.accountId, next, next === 'error' ? detail : undefined)
      throw error instanceof AdapterError ? error : new AdapterError('network', detail)
    }
  }

  subscribe(listener: AdapterListener): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onMessage(listener: (message: IncomingMessage) => void): Unsubscribe {
    return this.subscribe((event) => {
      if (event.type === 'message') listener(event.message)
    })
  }

  getStatus(accountId: string): ConnectionStatus {
    return this.statuses.get(accountId) ?? 'offline'
  }
}

function pickFirstConversationId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const root = payload as Record<string, unknown>
  const list =
    (Array.isArray(root['conversations']) && root['conversations']) ||
    (Array.isArray(root['items']) && root['items']) ||
    (Array.isArray(payload) ? payload : null)
  if (!Array.isArray(list) || list.length === 0) return undefined
  const first = list[0] as Record<string, unknown>
  const id = first?.['id'] ?? first?.['conversationId']
  return typeof id === 'string' ? id : undefined
}

export function createHarkAdapter(): HarkAdapter {
  return new HarkAdapter()
}
