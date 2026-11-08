import { createId } from '@shared/id'
import type { DotMainEvent, DotRpcRequest, DotRpcResponse } from '@shared/ipc'
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

async function invokeDotRpc(request: DotRpcRequest): Promise<unknown> {
  const bridge = getBotHubBridge()?.dot
  if (!bridge?.rpc) {
    throw new AdapterError('not-connected', 'Dot IPC unavailable (Electron main required)')
  }
  const res = (await bridge.rpc(request)) as DotRpcResponse
  if (!res.ok) {
    throw new AdapterError(
      res.status === 401 ? 'not-connected' : 'network',
      res.message || `Dot RPC failed (${res.status})`
    )
  }
  return res.data
}

/**
 * OpenAI Dot (`chatgpt.com/dots`) platform adapter:
 * - Calpico Room REST + Celsius Real-time WebSocket (`wss://ws.chatgpt.com/p20/ws/user/...`)
 * - Native `gpt-6-astra` / `gpt-6.1-sol` App-Server WebSocket (`wss://codex-cloud-backend.chatgpt.com/`)
 * - Supports interactive ChatGPT browser login and `access_token` (AT) / `refresh_token` (RT) / JSON import.
 */
export class DotAdapter implements PlatformAdapter {
  readonly id = 'dot' as const
  readonly name = 'Dot'

  private readonly accounts = new Map<string, PlatformAccount>()
  private readonly statuses = new Map<string, ConnectionStatus>()
  private readonly listeners = new Set<AdapterListener>()
  private readonly activeDotIds = new Map<string, string>()
  private readonly activeRoomIds = new Map<string, string>()
  private bridgeUnsub: Unsubscribe | null = null

  constructor() {
    this.bindBridgeEvents()
  }

  private bindBridgeEvents(): void {
    const b = getBotHubBridge()
    if (!b?.dot || this.bridgeUnsub) return
    this.bridgeUnsub = b.dot.onEvent((event) => this.handleMainEvent(event))
  }

  private handleMainEvent(event: DotMainEvent): void {
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
      if (!event.busy) {
        this.emit({
          type: 'typing',
          conversationId: event.accountId,
          accountId: event.accountId,
          isTyping: false
        })
        this.setStatus(event.accountId, 'online')
      }
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
        if (event.text || event.tools?.length || event.richWidgets?.length) {
          this.emit({
            type: 'message_delta',
            messageId: event.messageId,
            conversationId: convId,
            accountId: event.accountId,
            text: event.text,
            tools: event.tools,
            richWidgets: event.richWidgets
          })
        }
      } else {
        const keepBusy = Boolean(event.stillBusy)
        if (!keepBusy) {
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
        }
        if (
          event.text ||
          event.tools?.length ||
          event.richWidgets?.length ||
          event.media?.length
        ) {
          this.emit({
            type: 'message',
            message: {
              id: event.messageId,
              conversationId: convId,
              accountId: event.accountId,
              text: event.text,
              createdAt: Date.now(),
              tools: event.tools,
              richWidgets: event.richWidgets,
              media: event.media
            }
          })
        }
      }
      return
    }

    if (event.type === 'login') {
      if (event.signedIn) {
        this.emit({
          type: 'login',
          accountId: event.accountId,
          signedIn: true,
          handle: event.handle,
          displayName: event.displayName
        })
        this.upsert(event.accountId, {
          displayName: event.displayName,
          handle: event.handle
        })
        this.setStatus(event.accountId, 'online')
      } else {
        this.emit({
          type: 'login',
          accountId: event.accountId,
          signedIn: false,
          windowClosed: event.windowClosed
        })
        this.setStatus(event.accountId, 'offline')
      }
    }
  }

  private emit(event: AdapterEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[dot] listener failed', error)
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
      platformId: 'dot',
      displayName: patch?.displayName ?? prev?.displayName ?? 'Dot',
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
    const bridge = getBotHubBridge()?.dot
    if (!bridge) {
      this.setStatus(accountId, 'offline', '需要 Electron')
      return 'offline'
    }
    try {
      const status = await bridge.authStatus(accountId)
      if (!status.signedIn) {
        this.setStatus(accountId, 'offline', '未导入 Codex/Dot 凭据或未登录')
        return 'offline'
      }
      this.upsert(accountId, {
        displayName: status.displayName,
        handle: status.handle
      })
      const listed = (await invokeDotRpc({
        accountId,
        op: 'listDots',
        ensureDefault: true
      })) as {
        activeDot?: { id: string; messagingRoomId: string }
      }
      if (listed?.activeDot?.id) {
        this.activeDotIds.set(accountId, listed.activeDot.id)
      }
      if (listed?.activeDot?.messagingRoomId) {
        this.activeRoomIds.set(accountId, listed.activeDot.messagingRoomId)
      }
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
    const bridge = getBotHubBridge()?.dot
    if (!bridge?.openLogin) {
      throw new AdapterError('unsupported', 'Dot login needs the Electron app')
    }
    this.setStatus(accountId, 'busy', '在弹窗完成 ChatGPT 登录，或导入 AT / RT 凭据')
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
    const bridge = getBotHubBridge()?.dot
    await bridge?.cancelLogin?.(accountId)
    this.accounts.delete(accountId)
    this.statuses.delete(accountId)
    this.activeDotIds.delete(accountId)
    this.activeRoomIds.delete(accountId)
  }

  async sendMessage(message: OutgoingMessage): Promise<SendReceipt> {
    this.bindBridgeEvents()
    this.setStatus(message.accountId, 'busy')
    this.emit({
      type: 'typing',
      conversationId: message.conversationId,
      accountId: message.accountId,
      isTyping: true
    })

    try {
      const res = (await invokeDotRpc({
        accountId: message.accountId,
        op: 'sendMessage',
        botId: message.conversationId,
        dotId: this.activeDotIds.get(message.accountId),
        roomId: message.sessionId || this.activeRoomIds.get(message.accountId),
        text: message.text,
        attachments: message.attachments
          ?.filter((a) => Boolean(a.dataBase64))
          .map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            dataBase64: a.dataBase64!
          }))
      })) as {
        roomId?: string
        threadId?: string
        replies?: Array<{
          id: string
          text?: string
          content?: string
          media?: import('@shared/ipc').MuseMediaPartView[]
        }>
        reply?: {
          id: string
          text?: string
          content?: string
          tools?: import('../types').MuseToolCall[]
          media?: import('@shared/ipc').MuseMediaPartView[]
        } | null
      }

      if (res?.roomId) {
        this.activeRoomIds.set(message.accountId, res.roomId)
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

      if (Array.isArray(res?.replies) && res.replies.length > 0) {
        for (const r of res.replies) {
          const rText = (r.text ?? r.content ?? '').trim()
          const rMedia = r.media
          if (rText || rMedia?.length) {
            const rId = r.id.startsWith('dot_') ? r.id : `dot_${r.id}`
            this.emit({
              type: 'message',
              message: {
                id: rId,
                conversationId: message.conversationId,
                accountId: message.accountId,
                text: rText,
                createdAt: Date.now(),
                ...(rMedia?.length ? { media: rMedia } : {})
              }
            })
          }
        }
      } else {
        const replyText = (res?.reply?.text ?? res?.reply?.content ?? '').trim()
        const replyTools = res?.reply?.tools
        const replyMedia = res?.reply?.media
        if (replyText || replyTools?.length || replyMedia?.length) {
          const incoming: IncomingMessage & {
            tools?: import('../types').MuseToolCall[]
            media?: import('@shared/ipc').MuseMediaPartView[]
          } = {
            id: res?.reply?.id || createId('msg'),
            conversationId: message.conversationId,
            accountId: message.accountId,
            text: replyText,
            createdAt: Date.now(),
            ...(replyTools?.length ? { tools: replyTools } : {}),
            ...(replyMedia?.length ? { media: replyMedia } : {})
          }
          this.emit({ type: 'message', message: incoming })
        }
      }

      this.setStatus(message.accountId, 'online')
      return {
        messageId: createId('msg'),
        acceptedAt: Date.now(),
        sessionId: res?.roomId || res?.threadId || message.sessionId
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
      this.setStatus(message.accountId, 'error', detail)
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

export function createDotAdapter(): DotAdapter {
  return new DotAdapter()
}
