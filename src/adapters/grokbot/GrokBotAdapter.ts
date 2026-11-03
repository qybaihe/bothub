import { createId } from '@shared/id'
import { GrokConnectClient, GrokConnectError } from './connectClient'
import { resolveGrokApproval } from './approvals'
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
  return {
    id: String(raw['id'] ?? raw['agent_id'] ?? ''),
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

function extractReplyText(entries: unknown, afterMessageId?: string): string {
  if (!entries || typeof entries !== 'object') return ''
  const root = entries as Record<string, unknown>
  const list = (Array.isArray(root['entries']) ? root['entries'] : Array.isArray(root['items']) ? root['items'] : []) as Record<
    string,
    unknown
  >[]
  // Prefer newest assistant/text-like entry after the user message.
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i]!
    const id = String(e['id'] ?? e['message_id'] ?? e['messageId'] ?? '')
    if (afterMessageId && id === afterMessageId) continue
    const kind = String(e['kind'] ?? e['type'] ?? '')
    const text =
      (typeof e['text'] === 'string' && e['text']) ||
      (typeof (e['message'] as { text?: string } | undefined)?.text === 'string'
        ? (e['message'] as { text: string }).text
        : '') ||
      (typeof e['content'] === 'string' ? e['content'] : '')
    if (!text.trim()) continue
    if (/send-message|user/i.test(kind) && !/assistant|message|bot/i.test(kind)) continue
    return text.trim()
  }
  return ''
}

/**
 * Grok Bot platform adapter (ConnectRPC → api2.cursor.sh).
 *
 * Login/token acquisition is intentionally incomplete: call `setAuth` after the
 * user finishes authenticator.cursor.sh (2FA) and a token is available. We do
 * not read Grok Bot.app sand-secrets / Keychain.
 */
export class GrokBotAdapter implements PlatformAdapter {
  readonly id = 'grok' as const
  readonly name = 'Grok Bot'

  private readonly accounts = new Map<string, PlatformAccount>()
  private readonly statuses = new Map<string, ConnectionStatus>()
  private readonly listeners = new Set<AdapterListener>()
  private readonly agentsByAccount = new Map<string, GrokAgentSummary[]>()
  private readonly pendingApprovals = new Map<string, MuseApproval[]>()
  /** BotHub botId / conversationId → primary Grok agent id for send. */
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

  /** Inject a bearer token after interactive login (dev / manual paste). */
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

  private clientFor(accountId: string): GrokConnectClient {
    const auth = getGrokAuth(accountId)
    if (!auth?.accessToken) {
      throw new AdapterError('not-connected', 'Sign in to Grok Bot first (authenticator / paste token).')
    }
    return new GrokConnectClient({
      auth,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })
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
    // Renderer cannot open BrowserWindow; expose intent via status detail.
    // Main-process grok openLogin IPC is wired separately when available.
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
    const client = this.clientFor(accountId)
    const payload = await client.listAgents()
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
    const auth = getGrokAuth(message.accountId)
    if (!auth?.accessToken) throw new AdapterError('not-connected', 'Sign in to Grok Bot first.')

    let agents = this.agentsByAccount.get(message.accountId)
    if (!agents?.length) agents = await this.refreshAgents(message.accountId)
    const agentId =
      this.agentForConversation.get(message.conversationId) ??
      agents[0]?.id
    if (!agentId) throw new AdapterError('unknown-account', 'No Grok Bot agents on this account.')

    const client = this.clientFor(message.accountId)
    const messageId = createId('tNu')
    const sessionId = auth.accountSlot ?? message.accountId

    this.setStatus(message.accountId, 'busy')
    this.emit({
      type: 'typing',
      conversationId: message.conversationId,
      accountId: message.accountId,
      isTyping: true
    })

    try {
      await client.sendUserMessage({
        agentId,
        messageId,
        text: message.text,
        sessionId,
        machineId: auth.machineId
      })
      // Poll transcript for an assistant reply (Watch stream not wired yet).
      let reply = ''
      for (let i = 0; i < 20; i++) {
        await sleep(800)
        try {
          const hist = await client.listTranscriptEntries({ agentId, sessionId, limit: 40 })
          reply = extractReplyText(hist, messageId)
          if (reply) break
        } catch {
          /* keep polling */
        }
      }

      this.emit({
        type: 'typing',
        conversationId: message.conversationId,
        accountId: message.accountId,
        isTyping: false
      })

      if (reply) {
        const incoming: IncomingMessage = {
          id: createId('msg'),
          conversationId: message.conversationId,
          accountId: message.accountId,
          text: reply,
          createdAt: Date.now()
        }
        this.emit({ type: 'message', message: incoming })
      }

      this.setStatus(message.accountId, 'online')
      return { messageId, acceptedAt: Date.now() }
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

  async listApprovals(accountId: string): Promise<MuseApproval[]> {
    return this.pendingApprovals.get(accountId) ?? []
  }

  async decideApproval(accountId: string, approvalId: string, decision: ApprovalDecision): Promise<void> {
    const client = this.clientFor(accountId)
    const pending = this.pendingApprovals.get(accountId) ?? []
    const card = pending.find((a) => a.id === approvalId)
    const kind =
      (card?.approvalType as 'auto-review' | 'local-tool' | 'connector' | undefined) ?? 'auto-review'
    const agentId =
      (card?.raw && typeof card.raw === 'object' && typeof (card.raw as { agent_id?: string }).agent_id === 'string'
        ? (card.raw as { agent_id: string }).agent_id
        : this.agentsByAccount.get(accountId)?.[0]?.id) ?? ''
    if (!agentId) throw new AdapterError('unknown-account', 'No agent for approval.')
    await resolveGrokApproval(client, kind, {
      agentId,
      requestId: approvalId,
      decision,
      sessionId: getGrokAuth(accountId)?.accountSlot ?? accountId
    })
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
