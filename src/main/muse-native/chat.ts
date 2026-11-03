/**
 * Muse chat over the native gateway.
 *
 * Wire behaviour (verified against the live gateway):
 * - `chat.stream` only returns the ack `{message_id, session_id, channel, …}` and ends.
 * - All chat traffic arrives on a long-lived `chat.subscribe` stream as
 *   `{type:"event", event:"<name>", seq, ts_ms, payload:{…}}`.
 * - `delta.message_start` → `delta.text_append` (payload.text) → `delta.message_done`
 *   (payload.status="completed", payload.transcript.messages[].content[].text).
 * - Text deltas are only sent when the client advertises `delta_stream`.
 */
import { EventEmitter } from 'node:events'
import type { MuseNativeGateway, SubscriptionHandle } from './gateway'

/** Client capabilities the web client advertises (`delta_stream` enables text deltas). */
export const MUSE_CHAT_CAPABILITIES = [
  'hotel_results',
  'chat_cancel',
  'delta_stream',
  'custom_reactions',
  'custom_reactions_facebook_thumbs_up_v1'
]

export interface MuseChatEvent {
  name: string
  seq: number
  payload: Record<string, unknown>
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

/** Final assistant text from a delta.message_done transcript. */
export function transcriptText(payload: Record<string, unknown>): string {
  const t = obj(payload['transcript'])
  const msgs = Array.isArray(t['messages']) ? (t['messages'] as unknown[]) : []
  const out: string[] = []
  for (const m of msgs) {
    const mm = obj(m)
    if (mm['role'] && mm['role'] !== 'assistant') continue
    const content = Array.isArray(mm['content']) ? (mm['content'] as unknown[]) : []
    for (const c of content) {
      const cc = obj(c)
      if (cc['type'] === 'text' && typeof cc['text'] === 'string') out.push(cc['text'] as string)
    }
  }
  return out.join('\n\n')
}

/**
 * One `chat.subscribe` per connection; re-subscribes after every reconnect.
 * Emits `event` (MuseChatEvent).
 */
export class MuseChatChannel extends EventEmitter {
  private handle: SubscriptionHandle | null = null
  private opening: Promise<void> | null = null
  private stopped = false

  constructor(private readonly gw: MuseNativeGateway) {
    super()
    this.setMaxListeners(50)
    gw.on('phase', (p: string) => {
      if (p === 'ready' && !this.stopped && !this.handle) void this.ensure().catch(() => undefined)
    })
  }

  async ensure(): Promise<void> {
    if (this.handle) return
    if (this.opening) return this.opening
    this.opening = (async () => {
      const h = await this.gw.subscribe('chat.subscribe', { capabilities: MUSE_CHAT_CAPABILITIES }, (e) => {
        if (e['type'] !== 'event') return
        const name = str(e['event']) || str(e['event_name'])
        if (!name) return
        this.emit('event', { name, seq: Number(e['seq'] ?? 0), payload: obj(e['payload']) } satisfies MuseChatEvent)
      })
      await h.ack
      this.handle = h
      h.done.then(
        () => this.onEnded(h),
        () => this.onEnded(h)
      )
    })().finally(() => {
      this.opening = null
    })
    return this.opening
  }

  private onEnded(h: SubscriptionHandle): void {
    if (this.handle !== h) return
    this.handle = null
    this.emit('ended')
    // If the socket is still up the server closed only the subscription: reopen.
    if (!this.stopped && this.gw.isReady()) void this.ensure().catch(() => undefined)
  }

  stop(): void {
    this.stopped = true
    this.handle?.cancel()
    this.handle = null
  }
}

export interface ChatStreamUpdate {
  /** Muse assistant message id (stable for one bubble). */
  messageId: string
  /** Full text so far. */
  text: string
  done: boolean
}

export interface ChatStreamResult {
  ack: Record<string, unknown>
  sessionId?: string
  assistantMessageIds: string[]
  text: string
  eventCounts: Record<string, number>
}

/**
 * Send one user turn and stream the assistant reply(ies) until the agent goes
 * back to idle (or `idleMs` after the last completed message).
 */
export async function streamChat(
  gw: MuseNativeGateway,
  channel: MuseChatChannel,
  input: { text: string; nodeId: string; sessionId?: string; capabilities?: string[] },
  onUpdate: (u: ChatStreamUpdate) => void,
  opts: { timeoutMs?: number; idleMs?: number; recoverMs?: number; signal?: AbortSignal } = {}
): Promise<ChatStreamResult> {
  await gw.connect()
  await channel.ensure()

  const counts: Record<string, number> = {}
  const texts = new Map<string, string>()
  const order: string[] = []
  const doneIds = new Set<string>()
  let sessionId = input.sessionId ?? ''
  let started = false
  let settle!: () => void
  let fail!: (e: Error) => void
  const finished = new Promise<void>((a, b) => {
    settle = a
    fail = b
  })
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const armIdle = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(settle, opts.idleMs ?? 4000)
  }

  const mine = (p: Record<string, unknown>): boolean => {
    const s = str(p['session_id'])
    if (sessionId) return s === sessionId
    const ctx = obj(p['chat_context'])
    return str(ctx['device_id']) === input.nodeId
  }

  const onEvent = (e: MuseChatEvent): void => {
    if (gapTimer) {
      clearTimeout(gapTimer)
      gapTimer = null
    }
    const p = e.payload
    if (!e.name.startsWith('delta.') && e.name !== 'message.user' && e.name !== 'agent.status' && e.name !== 'message.assistant') return
    if (!mine(p)) return
    counts[e.name] = (counts[e.name] ?? 0) + 1
    const id = str(p['message_id'])
    switch (e.name) {
      case 'message.user':
        started = true
        if (!sessionId) sessionId = str(p['session_id'])
        break
      case 'delta.message_start':
        if (!started || !id) break
        if (!texts.has(id)) {
          texts.set(id, '')
          order.push(id)
        }
        if (idleTimer) clearTimeout(idleTimer)
        onUpdate({ messageId: id, text: texts.get(id) ?? '', done: false })
        break
      case 'delta.text_append': {
        if (!started || !id) break
        if (!texts.has(id)) {
          texts.set(id, '')
          order.push(id)
        }
        const next = texts.get(id)! + str(p['text'])
        texts.set(id, next)
        onUpdate({ messageId: id, text: next, done: false })
        break
      }
      case 'delta.message_done':
      case 'message.assistant': {
        if (!started || !id || !texts.has(id) || doneIds.has(id)) break
        const status = str(p['status'])
        if (status && status !== 'completed' && status !== 'complete' && status !== 'done') {
          if (status === 'failed' || status === 'error' || status === 'cancelled') {
            doneIds.add(id)
            onUpdate({ messageId: id, text: texts.get(id) ?? '', done: true })
            armIdle()
          }
          break
        }
        const final = mergeMonotonic(texts.get(id) ?? '', transcriptText(p) || str(p['content']) || '')
        texts.set(id, final)
        doneIds.add(id)
        onUpdate({ messageId: id, text: final, done: true })
        armIdle()
        break
      }
      case 'agent.status':
        if (started && doneIds.size > 0 && doneIds.size === order.length && str(p['activity_code']) === 'online') settle()
        break
      default:
        break
    }
  }

  // The gateway can drop mid-reply. The server keeps generating; after the
  // reconnect + re-subscribe, deltas resume and message_done carries the full
  // transcript, so wait for recovery instead of failing straight away.
  // Deltas emitted while the socket was down are not replayed, so once the
  // gateway is back, backfill the in-flight reply from chat.history.
  let gapTimer: ReturnType<typeof setTimeout> | null = null
  let backfilling = false
  let closed = false
  const backfill = async (): Promise<void> => {
    if (backfilling) return
    backfilling = true
    try {
      while (!closed && sessionId && order.some((id) => !doneIds.has(id))) {
        await new Promise((r) => setTimeout(r, 2000))
        if (closed || !gw.isReady()) continue
        let hist: unknown
        try {
          hist = await gw.request('chat.history', { session_id: sessionId, limit: 20 })
        } catch {
          continue
        }
        const rows = historyAssistants(hist)
        if (gapTimer) {
          clearTimeout(gapTimer)
          gapTimer = null
        }
        for (const id of order) {
          if (doneIds.has(id)) continue
          const row = rows.find((r) => r.id === id) ?? (order.length === 1 ? rows[rows.length - 1] : undefined)
          if (!row || !row.text) continue
          const merged = mergeMonotonic(texts.get(id) ?? '', row.text)
          if (merged !== texts.get(id)) {
            texts.set(id, merged)
            onUpdate({ messageId: id, text: merged, done: false })
          }
          if (row.completed) {
            doneIds.add(id)
            onUpdate({ messageId: id, text: merged, done: true })
          }
        }
        if (order.length && order.every((id) => doneIds.has(id))) settle()
      }
    } finally {
      backfilling = false
    }
  }
  const onPhase = (p: string): void => {
    if (p === 'ready' && gapTimer) void backfill()
  }
  gw.on('phase', onPhase)
  const onEnded = (): void => {
    if (gapTimer) return
    gapTimer = setTimeout(() => fail(new Error('Muse gateway did not recover mid-reply')), opts.recoverMs ?? 60_000)
  }
  channel.on('event', onEvent)
  channel.on('ended', onEnded)
  const onAbort = (): void => {
    void gw.request('chat.cancel', sessionId ? { session_id: sessionId } : {}).catch(() => undefined)
    settle()
  }
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(settle, opts.timeoutMs ?? 300_000)
  let ack: Record<string, unknown> = {}
  try {
    const params: Record<string, unknown> = {
      items: [{ type: 'text', text: input.text }],
      node_id: input.nodeId,
      capabilities: input.capabilities ?? MUSE_CHAT_CAPABILITIES
    }
    if (input.sessionId) params['session_id'] = input.sessionId
    const h = await gw.subscribe('chat.stream', params, () => undefined)
    ack = await h.ack
    const r = obj(ack['result'])
    const ackSession = str(ack['session_id']) || str(r['session_id'])
    if (!sessionId && ackSession) sessionId = ackSession
    await h.done.catch(() => undefined)
    await finished
  } finally {
    closed = true
    gw.off('phase', onPhase)
    clearTimeout(timer)
    if (gapTimer) clearTimeout(gapTimer)
    if (idleTimer) clearTimeout(idleTimer)
    channel.off('event', onEvent)
    channel.off('ended', onEnded)
    opts.signal?.removeEventListener('abort', onAbort)
  }
  for (const id of order) if (!doneIds.has(id)) onUpdate({ messageId: id, text: texts.get(id) ?? '', done: true })
  return {
    ack,
    sessionId: sessionId || undefined,
    assistantMessageIds: order,
    text: order.map((id) => texts.get(id) ?? '').filter(Boolean).join('\n\n'),
    eventCounts: counts
  }
}

/**
 * Never shrink a streaming bubble: keep `prev` unless `next` is a longer
 * version of it (superset/continuation). Used for reconnect + backfill.
 */
export function mergeMonotonic(prev: string, next: string): string {
  if (!next) return prev
  if (!prev) return next
  if (next.length <= prev.length) return prev
  if (next.startsWith(prev)) return next
  // Longer but diverging (e.g. whitespace/markdown normalisation) — still a
  // fuller copy of the reply, so take it; shorter copies are never taken.
  return next
}

interface HistoryRow {
  id: string
  text: string
  completed: boolean
}

/** Assistant rows from chat.history (`{ok,result:{events|chat_events|messages}}`), oldest first. */
export function historyAssistants(raw: unknown): HistoryRow[] {
  let r = obj(raw)
  if (r['ok'] !== undefined && r['result'] !== undefined) r = obj(r['result'])
  const list = (r['chat_events'] ?? r['events'] ?? r['messages'] ?? r['items'] ?? (Array.isArray(raw) ? raw : [])) as unknown
  if (!Array.isArray(list)) return []
  const rows: Array<HistoryRow & { at: number }> = []
  for (const item of list) {
    const e = obj(item)
    const p = obj(e['payload'])
    const name = str(e['event_name']) || str(e['event']) || str(e['type'])
    const role = str(e['role']) || str(p['role'])
    if (!/assistant/.test(name) && role !== 'assistant') continue
    const text = transcriptText(p) || transcriptText(e) || str(e['display_text']) || str(p['display_text']) || str(e['text']) || str(p['content']) || str(e['content'])
    const status = (str(p['status']) || str(e['status'])).toLowerCase()
    rows.push({
      id: str(e['message_id']) || str(p['message_id']) || str(e['id']),
      text,
      completed: status === 'completed' || status === 'complete' || status === 'done' || status === 'finished',
      at: Number(e['occurred_at_ms'] ?? e['created_at_ms'] ?? 0) || 0
    })
  }
  rows.sort((a, b) => a.at - b.at)
  return rows
}
