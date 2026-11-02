import { createId } from '@shared/id'
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

/**
 * In-memory Meta Muse adapter.
 *
 * Simulates a real platform: known accounts with persistent statuses,
 * connect/disconnect latency, a typing indicator, and delayed replies that
 * briefly mark the account "busy". Swap for a protocol-backed adapter later.
 */

export interface MockAccountFixture extends PlatformAccount {
  initialStatus: ConnectionStatus
}

/** Sessions the mock platform already "knows" (as if signed in before). */
export const META_MUSE_MOCK_ACCOUNTS: readonly MockAccountFixture[] = [
  { id: 'mm-alex', platformId: 'meta-muse', displayName: 'Alex Rivera', handle: 'alex@musestudio.io', initialStatus: 'online' },
  { id: 'mm-studio', platformId: 'meta-muse', displayName: 'Muse Studio', handle: 'team@musestudio.io', initialStatus: 'offline' },
  { id: 'mm-growth', platformId: 'meta-muse', displayName: 'Growth Team', handle: 'growth@musestudio.io', initialStatus: 'busy' },
  { id: 'mm-lab', platformId: 'meta-muse', displayName: 'Research Lab', handle: 'lab@musestudio.io', initialStatus: 'online' },
  { id: 'mm-sam', platformId: 'meta-muse', displayName: 'Sam Chen', handle: 'sam.chen@musestudio.io', initialStatus: 'online' },
  { id: 'mm-archive', platformId: 'meta-muse', displayName: 'Archive', handle: 'archive@musestudio.io', initialStatus: 'error' },
  { id: 'mm-personal', platformId: 'meta-muse', displayName: 'Alex (personal)', handle: 'alex.rivera@mail.com', initialStatus: 'offline' }
]

export interface MetaMuseMockOptions {
  accounts?: readonly MockAccountFixture[]
  /** Multiplies every simulated delay. Use 0 in tests for instant replies. */
  latencyScale?: number
}

const REPLY_TEMPLATES: ReadonlyArray<(topic: string) => string> = [
  (topic) =>
    `Got it. Here's a first pass on “${topic}”:\n\n1. Pin down the goal and who it's for.\n2. List what we already know and what's missing.\n3. Draft quickly, then tighten.\n\nWant me to expand any of these?`,
  (topic) =>
    `Happy to help with “${topic}”. I'd start with the smallest version that proves the idea, then iterate from real feedback. Should I sketch that out?`,
  (topic) =>
    `Noted. I can summarize, rewrite, or brainstorm around “${topic}”. Which would be most useful right now?`,
  (topic) =>
    `A few angles on “${topic}”:\n\n• What changes if we halve the scope?\n• Who is the first person this helps?\n• What would make it obviously better than today?\n\nPick one and I'll go deeper.`
]

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function summarizeTopic(text: string): string {
  const firstLine = text.trim().split('\n')[0] ?? ''
  return firstLine.length > 48 ? `${firstLine.slice(0, 45).trimEnd()}…` : firstLine
}

function composeReply(message: OutgoingMessage): string {
  const text = message.text.trim()
  const parts: string[] = []

  if (/^(hi|hey|hello|yo)\b/i.test(text)) {
    parts.push("Hi! I'm your Muse assistant. What are we working on today?")
  } else if (text.length > 0) {
    const template = REPLY_TEMPLATES[hashString(text) % REPLY_TEMPLATES.length]!
    parts.push(template(summarizeTopic(text)))
  }

  const files = message.attachments ?? []
  if (files.length > 0) {
    const names = files.map((f) => f.name).join(', ')
    parts.push(
      `I see ${files.length === 1 ? 'an attachment' : `${files.length} attachments`}: ${names}. (Mock adapter: files are not uploaded yet.)`
    )
  }

  return parts.join('\n\n') || 'Received.'
}

/** Adjust a counter in a map, never below zero; returns the new value. */
function bump(counters: Map<string, number>, key: string, delta: number): number {
  const next = Math.max(0, (counters.get(key) ?? 0) + delta)
  if (next === 0) counters.delete(key)
  else counters.set(key, next)
  return next
}

export class MetaMuseMockAdapter implements PlatformAdapter {
  readonly id = 'meta-muse' as const
  readonly name = 'Meta Muse'

  private readonly accounts = new Map<string, PlatformAccount>()
  private readonly statuses = new Map<string, ConnectionStatus>()
  /** In-flight replies per account (drives the "busy" status). */
  private readonly pendingReplies = new Map<string, number>()
  /** In-flight replies per conversation+account (drives the typing indicator). */
  private readonly pendingTyping = new Map<string, number>()
  private readonly listeners = new Set<AdapterListener>()
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private readonly latencyScale: number

  constructor(options: MetaMuseMockOptions = {}) {
    this.latencyScale = options.latencyScale ?? 1
    for (const { initialStatus, ...account } of options.accounts ?? META_MUSE_MOCK_ACCOUNTS) {
      this.accounts.set(account.id, account)
      this.statuses.set(account.id, initialStatus)
    }
  }

  async listAccounts(): Promise<PlatformAccount[]> {
    await this.delay(250)
    return [...this.accounts.values()]
  }

  async connect(accountId: string): Promise<ConnectionStatus> {
    await this.delay(500 + Math.random() * 500)
    // Unknown ids are treated as freshly signed-in sessions.
    this.setStatus(accountId, 'online')
    return 'online'
  }

  async disconnect(accountId: string): Promise<void> {
    await this.delay(200)
    this.setStatus(accountId, 'offline')
  }

  async sendMessage(message: OutgoingMessage): Promise<SendReceipt> {
    const status = this.getStatus(message.accountId)
    if (status === 'offline' || status === 'error') {
      throw new AdapterError('not-connected', 'This account is not connected.')
    }

    await this.delay(120 + Math.random() * 160)
    const receipt: SendReceipt = { messageId: createId('mm_out'), acceptedAt: Date.now() }
    this.scheduleReply(message, receipt.messageId)
    return receipt
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

  /** Cancel all simulated timers and drop listeners. */
  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    this.listeners.clear()
  }

  private scheduleReply(message: OutgoingMessage, replyTo: string): void {
    const { accountId, conversationId } = message
    const thinkMs = 900 + Math.min(message.text.length * 12, 1400) + Math.random() * 600
    const typingKey = `${conversationId}:${accountId}`

    bump(this.pendingReplies, accountId, 1)
    this.setStatus(accountId, 'busy')

    this.later(250, () => {
      if (bump(this.pendingTyping, typingKey, 1) === 1) {
        this.emit({ type: 'typing', conversationId, accountId, isTyping: true })
      }
    })

    this.later(thinkMs, () => {
      const stillPending = bump(this.pendingReplies, accountId, -1)
      if (bump(this.pendingTyping, typingKey, -1) === 0) {
        this.emit({ type: 'typing', conversationId, accountId, isTyping: false })
      }

      // Drop the reply if the account was disconnected while "thinking".
      const status = this.getStatus(accountId)
      if (status === 'offline' || status === 'error') return

      this.emit({
        type: 'message',
        message: {
          id: createId('mm_in'),
          conversationId,
          accountId,
          text: composeReply(message),
          createdAt: Date.now(),
          replyTo
        }
      })
      if (stillPending === 0 && status === 'busy') this.setStatus(accountId, 'online')
    })
  }

  private setStatus(accountId: string, status: ConnectionStatus): void {
    if (this.statuses.get(accountId) === status) return
    this.statuses.set(accountId, status)
    this.emit({ type: 'status', accountId, status })
  }

  private emit(event: AdapterEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[meta-muse mock] listener failed', error)
      }
    }
  }

  private later(ms: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      fn()
    }, ms * this.latencyScale)
    this.timers.add(timer)
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.later(ms, resolve))
  }
}

export function createMetaMuseMockAdapter(options?: MetaMuseMockOptions): MetaMuseMockAdapter {
  return new MetaMuseMockAdapter(options)
}
