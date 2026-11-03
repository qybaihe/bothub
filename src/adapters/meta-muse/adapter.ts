import { createId } from '@shared/id'
import type { MuseMainEvent } from '@shared/ipc'
import { getBotHubBridge } from './electronBridge'
import {
  AdapterError,
  type AdapterEvent,
  type AdapterListener,
  type ApprovalDecision,
  type ConnectionStatus,
  type IncomingMessage,
  type MuseApproval,
  type MuseConnector,
  type OutgoingMessage,
  type PlatformAccount,
  type PlatformAdapter,
  type SendReceipt,
  type Unsubscribe
} from '../types'

/**
 * Real Meta Muse adapter.
 *
 * Drives https://muse.ai inside an Electron WebContentsView (one persist
 * partition per account) and calls the page gateway `sendRequest` when the
 * hook finds it; otherwise falls back to DOM automation for chat.stream.
 *
 * In plain browser (`npm run dev:web`) there is no bridge — methods throw
 * `unsupported` so the UI can fall back to mock via BOTHUB_USE_MOCK_MUSE.
 */

function mapApproval(raw: Record<string, unknown>): MuseApproval {
  const display = (raw['display'] as Record<string, unknown> | undefined) ?? {}
  const payload = raw['payload'] as Record<string, unknown> | undefined
  const title = String(
    display['title'] ??
      raw['action_description'] ??
      raw['action_label'] ??
      raw['title'] ??
      raw['approval_type'] ??
      'Pending approval'
  )
  const detail =
    (typeof display['subtitle'] === 'string' && display['subtitle']) ||
    (typeof raw['approval_phrase'] === 'string' ? raw['approval_phrase'] : undefined) ||
    undefined
  return {
    id: String(raw['id'] ?? raw['approval_id'] ?? ''),
    status: String(raw['status'] ?? 'pending'),
    title,
    detail,
    approvalType:
      typeof raw['approval_type'] === 'string'
        ? raw['approval_type']
        : typeof payload?.['type'] === 'string'
          ? String(payload['type'])
          : typeof raw['host'] === 'string'
            ? String(raw['host'])
            : undefined,
    raw
  }
}

function mapConnector(raw: unknown, index: number): MuseConnector {
  const r = (raw ?? {}) as Record<string, unknown>
  const state = typeof r['state'] === 'string' ? r['state'].toLowerCase() : ''
  const connected = Boolean(
    r['connected'] ??
      r['is_connected'] ??
      (r['status'] === 'connected' || state === 'connected' || state === 'active')
  )
  return {
    id: String(r['id'] ?? r['connector_id'] ?? `connector-${index}`),
    name: String(r['name'] ?? r['title'] ?? r['id'] ?? `Connector ${index + 1}`),
    connected,
    description: typeof r['description'] === 'string' ? r['description'] : undefined,
    raw
  }
}

export class MuseAdapter implements PlatformAdapter {
  readonly id = 'meta-muse' as const
  readonly name = 'Meta Muse'

  private readonly accounts = new Map<string, PlatformAccount>()
  private readonly statuses = new Map<string, ConnectionStatus>()
  private readonly listeners = new Set<AdapterListener>()
  private readonly pendingApprovals = new Map<string, MuseApproval[]>()
  private bridgeUnsub: Unsubscribe | null = null

  constructor() {
    this.bindBridgeEvents()
  }

  private bridge() {
    const b = getBotHubBridge()
    if (!b?.muse) throw new AdapterError('unsupported', 'Muse needs the Electron app (npm run dev).')
    return b.muse
  }

  private bindBridgeEvents(): void {
    const b = getBotHubBridge()
    if (!b?.muse || this.bridgeUnsub) return
    this.bridgeUnsub = b.muse.onEvent((event) => this.handleMainEvent(event))
  }

  private handleMainEvent(event: MuseMainEvent): void {
    switch (event.type) {
      case 'status': {
        const s = event.status
        const status: ConnectionStatus = !s.signedIn
          ? 'offline'
          : s.pendingApprovals > 0
            ? 'attention'
            : s.ready
              ? 'online'
              : 'busy'
        this.setStatus(s.accountId, status, s.hook === 'none' ? 'Waiting for muse.ai gateway…' : undefined)
        break
      }
      case 'login': {
        this.emit({
          type: 'login',
          accountId: event.accountId,
          signedIn: event.signedIn,
          handle: event.handle,
          displayName: event.displayName
        })
        this.setStatus(event.accountId, event.signedIn ? 'online' : 'offline')
        break
      }
      case 'approvals': {
        const pending = (event.pending as Record<string, unknown>[]).map(mapApproval).filter((a) => a.id)
        this.pendingApprovals.set(event.accountId, pending)
        this.emit({ type: 'approvals', accountId: event.accountId, pending })
        if (pending.length > 0) this.setStatus(event.accountId, 'attention')
        break
      }
      case 'stream': {
        if (!event.done) {
          this.emit({
            type: 'typing',
            conversationId: event.conversationId ?? event.accountId,
            accountId: event.accountId,
            isTyping: true
          })
          if (event.text) {
            this.emit({
              type: 'message_delta',
              messageId: event.messageId,
              conversationId: event.conversationId ?? event.accountId,
              accountId: event.accountId,
              text: event.text
            })
          }
          this.setStatus(event.accountId, 'busy')
        } else {
          this.emit({
            type: 'typing',
            conversationId: event.conversationId ?? event.accountId,
            accountId: event.accountId,
            isTyping: false
          })
          const message: IncomingMessage = {
            id: event.messageId,
            conversationId: event.conversationId ?? event.accountId,
            accountId: event.accountId,
            text: event.text,
            createdAt: Date.now()
          }
          this.emit({ type: 'message', message })
          const pending = this.pendingApprovals.get(event.accountId) ?? []
          this.setStatus(event.accountId, pending.length ? 'attention' : 'online')
        }
        break
      }
    }
  }

  async listAccounts(): Promise<PlatformAccount[]> {
    return [...this.accounts.values()]
  }

  /** Register a BotHub-side account (after user starts login). */
  upsertAccount(account: PlatformAccount): void {
    this.accounts.set(account.id, account)
    if (!this.statuses.has(account.id)) this.statuses.set(account.id, 'offline')
  }

  async ensureSession(accountId: string, botId = 'muse'): Promise<void> {
    this.bindBridgeEvents()
    if (!this.accounts.has(accountId)) {
      this.upsertAccount({
        id: accountId,
        platformId: 'meta-muse',
        displayName: 'Muse account',
        handle: accountId
      })
    }
    const status = await this.bridge().ensure({ botId, accountId })
    this.setStatus(
      accountId,
      status.signedIn ? (status.pendingApprovals > 0 ? 'attention' : 'online') : 'offline'
    )
  }

  async connect(accountId: string): Promise<ConnectionStatus> {
    await this.ensureSession(accountId)
    return this.getStatus(accountId)
  }

  async disconnect(accountId: string): Promise<void> {
    this.setStatus(accountId, 'offline')
  }

  async sendMessage(message: OutgoingMessage): Promise<SendReceipt> {
    const status = this.getStatus(message.accountId)
    if (status === 'offline' || status === 'error') {
      throw new AdapterError('not-connected', 'Sign in to muse.ai first (open the web session).')
    }

    this.bindBridgeEvents()
    this.setStatus(message.accountId, 'busy')
    this.emit({
      type: 'typing',
      conversationId: message.conversationId,
      accountId: message.accountId,
      isTyping: true
    })

    try {
      const result = (await this.bridge().rpc({
        accountId: message.accountId,
        method: 'chat.stream',
        params: {
          items: [{ type: 'text', text: message.text }],
          node_id: message.accountId,
          capabilities: {}
        }
      })) as unknown

      const receipt: SendReceipt = { messageId: createId('mm_out'), acceptedAt: Date.now() }
      const text = extractText(result)
      if (!text) {
        throw new AdapterError(
          'timeout',
          'Muse accepted the message but no assistant reply arrived in time. Try again or open the web session.'
        )
      }

      // If main also emits stream events, we may double-post; prefer immediate message for RPC return.
      this.emit({
        type: 'typing',
        conversationId: message.conversationId,
        accountId: message.accountId,
        isTyping: false
      })
      this.emit({
        type: 'message',
        message: {
          id: createId('mm_in'),
          conversationId: message.conversationId,
          accountId: message.accountId,
          text,
          createdAt: Date.now(),
          replyTo: receipt.messageId
        }
      })
      const pending = this.pendingApprovals.get(message.accountId) ?? []
      this.setStatus(message.accountId, pending.length ? 'attention' : 'online')
      return receipt
    } catch (error) {
      this.emit({
        type: 'typing',
        conversationId: message.conversationId,
        accountId: message.accountId,
        isTyping: false
      })
      this.setStatus(message.accountId, 'error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async listApprovals(accountId: string): Promise<MuseApproval[]> {
    const status = this.getStatus(accountId)
    if (status === 'offline' || status === 'error') return []
    let raw: unknown
    try {
      raw = await this.bridge().rpc({ accountId, method: 'egress.approvals', params: {} })
    } catch (error) {
      console.warn('[muse] listApprovals', error)
      return this.pendingApprovals.get(accountId) ?? []
    }
    const obj = (raw ?? {}) as Record<string, unknown>
    const list = (obj['pending'] as unknown[]) || (obj['pending_approvals'] as unknown[]) || []
    const pending = (Array.isArray(list) ? list : []).map((item) => mapApproval((item ?? {}) as Record<string, unknown>))
    this.pendingApprovals.set(accountId, pending)
    this.emit({ type: 'approvals', accountId, pending })
    if (pending.length) this.setStatus(accountId, 'attention')
    return pending
  }

  async decideApproval(accountId: string, approvalId: string, decision: ApprovalDecision): Promise<void> {
    await this.bridge().rpc({
      accountId,
      method: 'egress.approval.decide',
      params: {
        approval_id: approvalId,
        decision,
        reason: null,
        expires_at_ms: null,
        notification_channel: 'ui',
        expected_message_revision: null
      }
    })
    await this.listApprovals(accountId)
  }

  async listConnectors(accountId: string): Promise<MuseConnector[]> {
    const status = this.getStatus(accountId)
    if (status === 'offline' || status === 'error') return []
    let raw: unknown
    try {
      raw = await this.bridge().rpc({ accountId, method: 'connectors.list', params: {} })
    } catch (error) {
      console.warn('[muse] listConnectors', error)
      return []
    }
    if (Array.isArray(raw)) return raw.map(mapConnector)
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>
      const list = (obj['connectors'] as unknown[]) || (obj['items'] as unknown[]) || []
      if (Array.isArray(list)) return list.map(mapConnector)
    }
    return []
  }

  subscribe(listener: AdapterListener): Unsubscribe {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  onMessage(listener: (message: IncomingMessage) => void): Unsubscribe {
    return this.subscribe((event) => {
      if (event.type === 'message') listener(event.message)
    })
  }

  getStatus(accountId: string): ConnectionStatus {
    return this.statuses.get(accountId) ?? 'offline'
  }

  private setStatus(accountId: string, status: ConnectionStatus, detail?: string): void {
    if (this.statuses.get(accountId) === status && detail === undefined) return
    this.statuses.set(accountId, status)
    this.emit({ type: 'status', accountId, status, detail })
  }

  private emit(event: AdapterEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[muse adapter] listener failed', error)
      }
    }
  }
}

function extractText(result: unknown): string {
  if (result == null) return ''
  if (typeof result === 'string') return result
  if (typeof result !== 'object') return String(result)
  const r = result as Record<string, unknown>
  for (const key of ['text', 'display_text', 'message', 'content', 'reply']) {
    if (typeof r[key] === 'string' && (r[key] as string).trim()) return r[key] as string
  }
  if (r['ok'] === true && r['mode'] === 'dom') {
    if (typeof r['reply'] === 'string' && (r['reply'] as string).trim()) return r['reply'] as string
    return 'Message submitted in the muse.ai page (DOM fallback). Watch the web session for the streaming reply.'
  }
  // Ack-only shape means the session manager could not collect an assistant reply yet.
  if (typeof r['message_id'] === 'string' && typeof r['session_id'] === 'string') {
    return ''
  }
  return ''
}

export function createMuseAdapter(): MuseAdapter {
  return new MuseAdapter()
}
