import { statusAfterSendFailure } from '../sendFailure'
import { createId } from '@shared/id'
import type { GrokRpcRequest, GrokRpcResponse } from '@shared/ipc'
import { GrokConnectError } from './connectClient'
import { grokApprovalRpcRequest } from './approvals'
import { clearGrokAuth, getGrokAuth, setGrokAuth } from './tokenStore'
import type { GrokAgentSummary, GrokAuthSession } from './types'
import {
  AdapterError,
  type AdapterEvent,
  type AdapterListener,
  type ApprovalDecision,
  type ConnectionStatus,
  type IncomingMessage,
  type MuseApproval,
  type OutgoingMessage,
  type PlatformAccount,
  type PlatformAdapter,
  type SendReceipt,
  type Unsubscribe
} from '../types'

function mapAgent(raw: Record<string, unknown>): GrokAgentSummary {
  // Prefer UUID agentId for Send/Transcript RPCs (numeric id is display-only).
  return {
    id: String(raw['agentId'] ?? raw['agent_id'] ?? raw['legacyAgentId'] ?? raw['id'] ?? ''),
    name: String(raw['name'] ?? raw['title'] ?? 'Grok Bot'),
    description: typeof raw['description'] === 'string' ? raw['description'] : undefined,
    harness: typeof raw['harness'] === 'string' ? raw['harness'] : undefined,
    visibility: typeof raw['visibility'] === 'string' ? raw['visibility'] : undefined,
    avatarShape: typeof raw['avatarShape'] === 'string' ? raw['avatarShape'] : undefined,
    avatarColor: typeof raw['avatarColor'] === 'string' ? raw['avatarColor'] : undefined,
    isGroup: Boolean(raw['isGroup'] ?? raw['is_group']),
    unreadCount: typeof raw['unreadCount'] === 'number' ? raw['unreadCount'] : undefined,
    lastMessageId: typeof raw['lastMessageId'] === 'string' ? raw['lastMessageId'] : undefined,
    awaitingUserResponse: Boolean(raw['awaitingUserResponse'] ?? raw['awaiting_user_response'])
  }
}

function extractAgents(payload: unknown): GrokAgentSummary[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>
  const list =
    (Array.isArray(root['agents']) && root['agents']) ||
    (Array.isArray(root['rows']) && root['rows']) ||
    (Array.isArray(root['agent']) && root['agent']) ||
    []
  return (list as Record<string, unknown>[]).map(mapAgent).filter((a) => a.id)
}

function decodeEntryBody(raw: Record<string, unknown>): Record<string, unknown> {
  const body = raw['body']
  if (typeof body === 'string' && body.length > 0) {
    try {
      const json = atob(body)
      const parsed = JSON.parse(json) as Record<string, unknown>
      return { ...raw, ...parsed }
    } catch {
      return raw
    }
  }
  return raw
}

function entryText(e: Record<string, unknown>): string {
  const msg = e['message'] as Record<string, unknown> | undefined
  const widget = msg?.['widget'] as Record<string, unknown> | undefined
  const text =
    (typeof e['text'] === 'string' && e['text']) ||
    (typeof e['content'] === 'string' && e['content']) ||
    (typeof msg?.['text'] === 'string' && (msg['text'] as string)) ||
    (typeof msg?.['content'] === 'string' && (msg['content'] as string)) ||
    (typeof widget?.['prompt'] === 'string' && (widget['prompt'] as string)) ||
    (typeof widget?.['title'] === 'string' && (widget['title'] as string)) ||
    ''
  return typeof text === 'string' ? text.trim() : ''
}

function extractReplyText(entries: unknown, afterMessageId?: string): string {
  if (!entries || typeof entries !== 'object') return ''
  const root = entries as Record<string, unknown>
  const list = (
    Array.isArray(root['entries']) ? root['entries'] : Array.isArray(root['items']) ? root['items'] : []
  ) as Record<string, unknown>[]
  for (let i = list.length - 1; i >= 0; i--) {
    const e = decodeEntryBody(list[i]!)
    const id = String(e['id'] ?? e['message_id'] ?? e['messageId'] ?? e['clientNonce'] ?? '')
    if (afterMessageId && (id === afterMessageId || String(e['clientNonce'] ?? '') === afterMessageId)) continue
    const role = String(e['role'] ?? '')
    const kind = String(e['kind'] ?? e['entryKind'] ?? e['type'] ?? '')
    if (/^user$/i.test(role) || /^user-attachment$/i.test(kind) || /^event$/i.test(kind)) continue
    const text = entryText(e)
    if (!text) continue
    if (/assistant|bot|message/i.test(role) || /assistant|message|send-message|bot/i.test(kind) || role === '') {
      return text
    }
  }
  return ''
}

function maxUpdatedSeq(entries: unknown): string {
  if (!entries || typeof entries !== 'object') return '0'
  const root = entries as Record<string, unknown>
  const list = (Array.isArray(root['entries']) ? root['entries'] : []) as Record<string, unknown>[]
  let max = 0n
  for (const e of list) {
    for (const key of ['updatedSeq', 'updated_seq', 'seq', 'currentUpdatedSeq'] as const) {
      const v = e[key]
      if (v == null) continue
      try {
        const n = BigInt(String(v))
        if (n > max) max = n
      } catch {
        /* ignore */
      }
    }
  }
  const top = root['updatedSeq'] ?? root['updated_seq']
  if (top != null) {
    try {
      const n = BigInt(String(top))
      if (n > max) max = n
    } catch {
      /* ignore */
    }
  }
  return max.toString()
}

async function invokeGrokRpc(request: GrokRpcRequest): Promise<unknown> {
  const bridge = typeof window !== 'undefined' ? window.electron?.grok : undefined
  if (!bridge?.rpc) {
    throw new AdapterError('not-connected', 'Grok IPC unavailable (Electron main required)')
  }
  const res = (await bridge.rpc(request)) as GrokRpcResponse
  if (!res.ok) {
    throw new GrokConnectError(res.status, res.body ?? res.message, res.code)
  }
  return res.data
}

/**
 * Grok Bot platform adapter.
 * ConnectRPC unary (List/Send/Transcript/approvals) runs in Electron main via IPC
 * so the renderer never hits api2.cursor.sh CORS.
 */
export class GrokBotAdapter implements PlatformAdapter {
  readonly id = 'grok' as const
  readonly name = 'Grok Bot'

  private readonly accounts = new Map<string, PlatformAccount>()
  private readonly statuses = new Map<string, ConnectionStatus>()
  private readonly listeners = new Set<AdapterListener>()
  private readonly agentsByAccount = new Map<string, GrokAgentSummary[]>()
  private readonly pendingApprovals = new Map<string, MuseApproval[]>()
  private readonly agentForConversation = new Map<string, string>()

  private emit(event: AdapterEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[grok] listener failed', error)
      }
    }
  }

  private setStatus(accountId: string, status: ConnectionStatus, detail?: string): void {
    this.statuses.set(accountId, status)
    this.emit({ type: 'status', accountId, status, detail })
  }

  private requireAuth(accountId: string) {
    const auth = getGrokAuth(accountId)
    if (!auth?.accessToken) {
      throw new AdapterError('not-connected', 'Sign in to Grok Bot first (authenticator / paste token).')
    }
    return auth
  }

  setAuth(session: GrokAuthSession): void {
    setGrokAuth(session)
    if (!this.accounts.has(session.accountId)) {
      this.accounts.set(session.accountId, {
        id: session.accountId,
        platformId: 'grok',
        displayName: session.accountSlot ?? 'Grok account',
        handle: session.accountSlot ?? session.accountId
      })
    }
    this.setStatus(session.accountId, 'online')
  }

  clearAuth(accountId: string): void {
    clearGrokAuth(accountId)
    this.setStatus(accountId, 'offline', 'Signed out')
  }

  async listAccounts(): Promise<PlatformAccount[]> {
    return [...this.accounts.values()]
  }

  upsertAccount(account: PlatformAccount): void {
    this.accounts.set(account.id, account)
    if (!this.statuses.has(account.id)) this.statuses.set(account.id, 'offline')
  }

  async connect(accountId: string): Promise<ConnectionStatus> {
    if (!this.accounts.has(accountId)) {
      this.upsertAccount({
        id: accountId,
        platformId: 'grok',
        displayName: 'Grok account',
        handle: accountId
      })
    }
    // Hydrate renderer token store from main safeStorage after restart.
    if (!getGrokAuth(accountId)?.accessToken) {
      try {
        const bridge = typeof window !== 'undefined' ? window.electron : undefined
        const session = await bridge?.grok?.getSession?.(accountId)
        if (session?.signedIn && session.accessToken) {
          this.setAuth({
            accountId,
            accessToken: session.accessToken,
            accountSlot: session.accountSlot,
            teamId: session.teamId,
            machineId: session.machineId
          })
        }
      } catch {
        /* ignore hydrate errors */
      }
    }
    if (!getGrokAuth(accountId)?.accessToken) {
      this.setStatus(accountId, 'offline', '需要 Grok / Cursor 登录拿到 accessToken')
      return 'offline'
    }
    try {
      const agents = await this.refreshAgents(accountId)
      this.setStatus(accountId, agents.length ? 'online' : 'busy', agents.length ? undefined : '已登录，但名单为空')
      return this.getStatus(accountId)
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
    if (!this.accounts.has(accountId)) {
      this.upsertAccount({
        id: accountId,
        platformId: 'grok',
        displayName: 'Grok account',
        handle: accountId
      })
    }
    this.setStatus(accountId, 'busy', '在浏览器完成 Cursor / Grok 登录后粘贴 accessToken（2FA 待接）')
    try {
      const bridge = typeof window !== 'undefined' ? window.electron : undefined
      if (bridge?.grok?.openLogin) {
        await bridge.grok.openLogin({ accountId })
      } else if (typeof window !== 'undefined') {
        window.open('https://authenticator.cursor.sh', '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      this.setStatus(accountId, 'error', error instanceof Error ? error.message : String(error))
      return 'error'
    }
    return this.getStatus(accountId)
  }

  async refreshAgents(accountId: string): Promise<GrokAgentSummary[]> {
    this.requireAuth(accountId)
    const payload = await invokeGrokRpc({
      accountId,
      op: 'listAgents',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })
    const agents = extractAgents(payload)
    this.agentsByAccount.set(accountId, agents)
    return agents
  }

  listCachedAgents(accountId: string): GrokAgentSummary[] {
    return this.agentsByAccount.get(accountId) ?? []
  }

  bindConversationAgent(conversationId: string, agentId: string): void {
    this.agentForConversation.set(conversationId, agentId)
  }

  async sendMessage(message: OutgoingMessage): Promise<SendReceipt> {
    const auth = this.requireAuth(message.accountId)

    let agents = this.agentsByAccount.get(message.accountId)
    if (!agents?.length) agents = await this.refreshAgents(message.accountId)
    const agentId = this.agentForConversation.get(message.conversationId) ?? agents[0]?.id
    if (!agentId) throw new AdapterError('unknown-account', 'No Grok Bot agents on this account.')

    const messageId = createId('tNu')
    const sessionId = message.sessionId ?? ''
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

    this.setStatus(message.accountId, 'busy')
    this.emit({
      type: 'typing',
      conversationId: message.conversationId,
      accountId: message.accountId,
      isTyping: true
    })

    try {
      // Snapshot seq before send so Watch only sees newer rows.
      let afterSeq = '0'
      try {
        const hist = await invokeGrokRpc({
          accountId: message.accountId,
          timeZone,
          op: 'listTranscriptEntries',
          agentId,
          sessionId,
          limit: 5
        })
        afterSeq = maxUpdatedSeq(hist)
      } catch {
        /* start from 0 */
      }

      await invokeGrokRpc({
        accountId: message.accountId,
        timeZone,
        op: 'sendUserMessage',
        agentId,
        messageId,
        text: message.text,
        sessionId,
        machineId: auth.machineId
      })

      let reply = ''
      let replyMessageId = ''
      let replyWidgets: IncomingMessage['widgets']
      let replyTools: IncomingMessage['tools']
      let replyMedia: IncomingMessage['media']
      try {
        const watched = await invokeGrokRpc({
          accountId: message.accountId,
          timeZone,
          op: 'watchUntilReply',
          agentId,
          conversationId: message.conversationId,
          sessionId,
          afterUpdatedSeq: afterSeq,
          afterMessageId: messageId,
          // Upper bound only; the watch ends after a quiet period once replies land.
          timeoutMs: 600_000
        })
        if (watched && typeof watched === 'object') {
          const w = watched as Record<string, unknown>
          if (typeof w['text'] === 'string') reply = w['text']
          else reply = extractReplyText(watched, messageId)
          if (typeof w['messageId'] === 'string') replyMessageId = w['messageId']
          if (Array.isArray(w['widgets'])) replyWidgets = w['widgets'] as IncomingMessage['widgets']
          if (Array.isArray(w['tools'])) replyTools = w['tools'] as IncomingMessage['tools']
          if (Array.isArray(w['media'])) replyMedia = w['media'] as IncomingMessage['media']
        }
      } catch {
        // Fallback: brief list poll if Watch unavailable.
        for (let i = 0; i < 15; i++) {
          await sleep(1000)
          try {
            const hist = await invokeGrokRpc({
              accountId: message.accountId,
              timeZone,
              op: 'listTranscriptEntries',
              agentId,
              sessionId,
              limit: 40
            })
            reply = extractReplyText(hist, messageId)
            if (reply) break
          } catch {
            /* keep polling */
          }
        }
      }

      this.emit({
        type: 'typing',
        conversationId: message.conversationId,
        accountId: message.accountId,
        isTyping: false
      })

      if (reply || replyWidgets?.length || replyMedia?.length) {
        const incoming: IncomingMessage = {
          id: replyMessageId || createId('msg'),
          conversationId: message.conversationId,
          accountId: message.accountId,
          text: reply,
          createdAt: Date.now(),
          ...(replyWidgets ? { widgets: replyWidgets } : {}),
          ...(replyTools ? { tools: replyTools } : {}),
          ...(replyMedia ? { media: replyMedia } : {})
        }
        this.emit({ type: 'message', message: incoming })
      }

      this.setStatus(message.accountId, 'online')
      const gotReply = Boolean(reply || replyWidgets?.length || replyMedia?.length)
      return { messageId, acceptedAt: Date.now(), ...(gotReply ? {} : { noReply: true }) }
    } catch (error) {
      this.emit({
        type: 'typing',
        conversationId: message.conversationId,
        accountId: message.accountId,
        isTyping: false
      })
      const detail =
        error instanceof GrokConnectError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error)
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

  async listApprovals(accountId: string): Promise<MuseApproval[]> {
    return this.pendingApprovals.get(accountId) ?? []
  }

  async decideApproval(accountId: string, approvalId: string, decision: ApprovalDecision): Promise<void> {
    this.requireAuth(accountId)
    const pending = this.pendingApprovals.get(accountId) ?? []
    const card = pending.find((a) => a.id === approvalId)
    const kind =
      (card?.approvalType as 'auto-review' | 'local-tool' | 'connector' | undefined) ?? 'auto-review'
    const agentId =
      (card?.raw && typeof card.raw === 'object' && typeof (card.raw as { agent_id?: string }).agent_id === 'string'
        ? (card.raw as { agent_id: string }).agent_id
        : this.agentsByAccount.get(accountId)?.[0]?.id) ?? ''
    if (!agentId) throw new AdapterError('unknown-account', 'No agent for approval.')
    await invokeGrokRpc(
      grokApprovalRpcRequest(accountId, kind, {
        agentId,
        requestId: approvalId,
        decision,
        sessionId: ''
      })
    )
    this.pendingApprovals.set(
      accountId,
      pending.filter((a) => a.id !== approvalId)
    )
    this.emit({ type: 'approvals', accountId, pending: this.pendingApprovals.get(accountId) ?? [] })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createGrokBotAdapter(): GrokBotAdapter {
  return new GrokBotAdapter()
}
