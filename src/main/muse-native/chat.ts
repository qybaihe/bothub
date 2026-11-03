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
 * - Long turns emit multiple assistant message_ids; settle only when agent
 *   activity leaves the busy set (or hard timeout), never 4s after first done.
 */
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { MuseNativeGateway, SubscriptionHandle } from './gateway'

/** Client capabilities the web client advertises (`delta_stream` enables text deltas). */
export const MUSE_CHAT_CAPABILITIES = [
  'hotel_results',
  'chat_cancel',
  'delta_stream',
  'custom_reactions',
  'custom_reactions_facebook_thumbs_up_v1'
]

/** Busy activity_code set from muse.ai client (tC/tT). */
export const MUSE_BUSY_ACTIVITY = new Set([
  'responding',
  'composing',
  'making_something',
  'working',
  'waiting_for_subagents',
  'compacting'
])

export function isMuseBusyActivity(code: string): boolean {
  return MUSE_BUSY_ACTIVITY.has(code) || code === 'needs_approval'
}

/** Non-busy / settled codes (online/idle or anything outside the busy set). */
export function isMuseIdleActivity(code: string): boolean {
  if (!code) return true
  if (code === 'online' || code === 'idle') return true
  if (code === 'guided_onboarding') return false
  return !isMuseBusyActivity(code)
}

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

export interface MuseToolCall {
  id: string
  name: string
  toolType?: string
  status: 'running' | 'completed' | 'errored'
  summary?: string
}

export interface MuseMediaPart {
  kind: 'image' | 'file'
  path: string
  name?: string
  imageId?: string
  mimeType?: string
}


/** Read-only rich widgets (no commerce actions). */
export type MuseRichWidget =
  | {
      kind: 'shopping_results' | 'shopping_results_v2'
      widgetId: string
      products: Array<{
        name: string
        url?: string
        imageUrl?: string
        price?: string
        retailer?: string
      }>
    }
  | {
      kind: 'shopping_cart'
      widgetId: string
      retailerName?: string
      subtotal?: string
      items: Array<{ id: string; name: string; quantity: number; imageUrl?: string; linePrice?: string }>
    }
  | {
      kind: 'local_map'
      widgetId: string
      html?: string
      places: Array<{ id: string; name: string; latitude: number; longitude: number; category?: string }>
    }
  | {
      kind: 'marketplace_map'
      widgetId: string
      listings: Array<{
        id: string
        name: string
        url?: string
        price?: string
        imageUrl?: string
        latitude?: number
        longitude?: number
      }>
    }
  | { kind: 'html'; widgetId: string; html: string; downloadable?: boolean }
  | { kind: 'slides'; widgetId: string; label: string; path?: string; slug: string }
  | {
      kind: 'image_options'
      widgetId: string
      images: Array<{ path: string; imageId?: string }>
      multiSelect?: boolean
      selectedPath?: string | null
      selectedIndices?: number[]
      baseVersion: number
    }

export interface MuseOptionWidget {
  kind: 'option'
  widgetId: string
  options: string[]
  buttonStyle: 'dotted_lines' | 'center_aligned_filled'
  customInputPlaceholder?: string
  selectedText?: string | null
  baseVersion: number
}

export interface MuseAgentActivity {
  code: string
  text: string | null
  emoji: string | null
  agentId: string | null
  subagents: number
  busy: boolean
  cta: { command?: string; label?: string } | null
}

export function parseAgentStatus(payload: Record<string, unknown>): MuseAgentActivity {
  const code = str(payload['activity_code'])
  const ctaRaw = obj(payload['cta'])
  const cta =
    code === 'out_of_credits'
      ? {
          command: str(ctaRaw['command']) || undefined,
          label: str(ctaRaw['label']) || undefined
        }
      : null
  return {
    code,
    text: str(payload['activity_text']) || null,
    emoji: str(payload['activity_emoji']) || null,
    agentId: str(payload['agent_id']) || null,
    subagents: Number(payload['count'] ?? 0) || 0,
    busy: isMuseBusyActivity(code),
    cta
  }
}

/** Parse option widgets from a message / presentation payload. */
export function parseOptionWidgets(payload: Record<string, unknown>): MuseOptionWidget[] {
  const bags: unknown[] = []
  for (const key of ['widgets', 'presentations', 'presentation']) {
    const v = payload[key]
    if (Array.isArray(v)) bags.push(...v)
    else if (v && typeof v === 'object') bags.push(v)
  }
  const nested = obj(payload['transcript'])
  for (const key of ['widgets', 'presentations']) {
    const v = nested[key]
    if (Array.isArray(v)) bags.push(...v)
  }
  const out: MuseOptionWidget[] = []
  for (const item of bags) {
    const w = obj(item)
    const kind = str(w['kind']) || str(w['type'])
    if (kind !== 'option') continue
    const data = obj(w['data'])
    const optsRaw = Array.isArray(data['options'])
      ? (data['options'] as unknown[])
      : Array.isArray(w['options'])
        ? (w['options'] as unknown[])
        : []
    const options: string[] = []
    for (const o of optsRaw) {
      const s = typeof o === 'string' ? o.trim() : str(obj(o)['text'] || obj(o)['label']).trim()
      if (s && !options.includes(s)) options.push(s)
    }
    if (!options.length) continue
    const style = str(data['button_style'] || w['button_style'])
    const custom = obj(data['custom_input'] || w['custom_input'] || data['customInput'])
    const state = obj(w['state'])
    const stateData = obj(state['data'])
    out.push({
      kind: 'option',
      widgetId: str(w['widget_id'] || w['widgetId'] || w['id']),
      options,
      buttonStyle: style === 'center_aligned_filled' ? 'center_aligned_filled' : 'dotted_lines',
      customInputPlaceholder: str(custom['placeholder']) || undefined,
      selectedText: (str(stateData['selectedText']) || str(state['selectedText']) || null) as string | null,
      baseVersion: Number(state['version'] ?? w['version'] ?? 0) || 0
    })
  }
  return out
}


function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function coord(v: unknown): { latitude: number; longitude: number } | null {
  const o = asObj(v)
  if (!o) return null
  const latitude = o['latitude']
  const longitude = o['longitude']
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}

/** Parse shopping / maps / html / slides widgets for read-only display. */
export function parseRichWidgets(payload: Record<string, unknown>): MuseRichWidget[] {
  const bags: unknown[] = []
  for (const key of ['widgets', 'presentations', 'presentation']) {
    const v = payload[key]
    if (Array.isArray(v)) bags.push(...v)
    else if (v && typeof v === 'object') bags.push(v)
  }
  const nested = asObj(payload['data'])
  if (nested) {
    for (const key of ['widgets', 'presentations']) {
      const v = nested[key]
      if (Array.isArray(v)) bags.push(...v)
    }
  }
  const out: MuseRichWidget[] = []
  for (const raw of bags) {
    const w = asObj(raw)
    if (!w) continue
    const kind = str(w['kind'] || w['widget_kind'] || w['widgetKind'])
    const widgetId = str(w['widget_id'] || w['widgetId'] || w['presentation_id'] || w['id'] || `${kind}-${out.length}`)
    const data = asObj(w['data']) || w
    if (kind === 'shopping_results' || kind === 'shopping_results_v2') {
      const productsRaw = data['products']
      const products: Array<{
        name: string
        url?: string
        imageUrl?: string
        price?: string
        retailer?: string
      }> = []
      if (Array.isArray(productsRaw)) {
        for (const row of productsRaw) {
          const o = asObj(row)
          if (!o) continue
          const name = str(o['product_name'] || o['productName'] || o['name'])
          if (!name) continue
          products.push({
            name,
            url: str(o['url']) || undefined,
            imageUrl: str(o['image_url'] || o['imageUrl']) || undefined,
            price: str(o['price'] || o['line_price'] || o['linePrice']) || undefined,
            retailer: str(o['retailer_name'] || o['retailerName'] || o['provider']) || undefined
          })
        }
      }
      if (products.length) out.push({ kind, widgetId, products: products.slice(0, 24) })
      continue
    }
    if (kind === 'shopping_cart') {
      const itemsRaw = data['items']
      const items: Array<{ id: string; name: string; quantity: number; imageUrl?: string; linePrice?: string }> = []
      if (Array.isArray(itemsRaw)) {
        for (const row of itemsRaw) {
          const o = asObj(row)
          if (!o) continue
          const id = str(o['id'])
          const name = str(o['name'])
          const quantity = o['quantity']
          if (!id || !name || typeof quantity !== 'number' || !(quantity > 0)) continue
          items.push({
            id,
            name,
            quantity,
            imageUrl: str(o['image_url'] || o['imageUrl']) || undefined,
            linePrice: str(o['line_price'] || o['linePrice']) || undefined
          })
        }
      }
      if (items.length) {
        out.push({
          kind: 'shopping_cart',
          widgetId,
          items: items.slice(0, 40),
          retailerName: str(data['retailer_name'] || data['retailerName']) || undefined,
          subtotal: str(data['subtotal']) || undefined
        })
      }
      continue
    }
    if (kind === 'local_map') {
      const html = str(data['html']) || undefined
      const places: Array<{ id: string; name: string; latitude: number; longitude: number; category?: string }> = []
      const typed = asObj(data['typed_data'] || data['typedData'] || data['scene'])
      const elements = typed && Array.isArray(typed['elements']) ? typed['elements'] : data['elements']
      if (Array.isArray(elements)) {
        for (const row of elements) {
          const o = asObj(row)
          if (!o) continue
          const c = coord(o['coordinate'])
          const name = str(o['name'])
          const id = str(o['id'] || o['place_id'] || o['placeId'] || name)
          if (!c || !name) continue
          places.push({
            id,
            name,
            latitude: c.latitude,
            longitude: c.longitude,
            category: str(o['category']) || undefined
          })
        }
      }
      if (html || places.length) out.push({ kind: 'local_map', widgetId, html, places: places.slice(0, 40) })
      continue
    }
    if (kind === 'marketplace_map') {
      const listings: Array<{
        id: string
        name: string
        url?: string
        price?: string
        imageUrl?: string
        latitude?: number
        longitude?: number
      }> = []
      const typed = asObj(data['typed_data'] || data['typedData'])
      const elements = typed && Array.isArray(typed['elements']) ? typed['elements'] : data['elements']
      if (Array.isArray(elements)) {
        for (const row of elements.slice(0, 24)) {
          const o = asObj(row)
          if (!o) continue
          const id = str(o['id'] || o['listing_id'] || o['listingId'])
          const name = str(o['name'])
          if (!id || !name) continue
          const c = o['coordinate'] != null ? coord(o['coordinate']) : null
          listings.push({
            id,
            name,
            url: str(o['url']) || undefined,
            price: str(o['price'] || o['sale_price'] || o['salePrice']) || undefined,
            imageUrl: str(o['image_url'] || o['imageUrl']) || undefined,
            latitude: c?.latitude,
            longitude: c?.longitude
          })
        }
      }
      if (listings.length) out.push({ kind: 'marketplace_map', widgetId, listings })
      continue
    }
    if (kind === 'html') {
      const html = str(data['html'])
      if (html.trim()) {
        out.push({
          kind: 'html',
          widgetId,
          html: html.slice(0, 200_000),
          downloadable: data['downloadable'] === true
        })
      }
      continue
    }
    if (kind === 'slides') {
      const deck = asObj(data['deck']) || data
      const label = str(deck['label'] || data['label'] || data['display_text'] || 'Slides')
      const slug = str(data['slug'])
      const path = str(deck['path'] || data['path']) || undefined
      if (slug) out.push({ kind: 'slides', widgetId, label, slug, path })
      continue
    }
    if (kind === 'image_options') {
      const imagesRaw = data['images']
      const images: Array<{ path: string; imageId?: string }> = []
      if (Array.isArray(imagesRaw)) {
        for (const row of imagesRaw) {
          const o = asObj(row)
          if (!o) continue
          const path = str(o['path']).trim()
          if (!path) continue
          const imageId = str(o['image_id'] || o['imageId']) || undefined
          images.push(imageId ? { path, imageId } : { path })
        }
      }
      if (!images.length) continue
      const state = asObj(w['state']) || {}
      const stateData = asObj(state['data']) || {}
      const selectedPath = str(stateData['selectedPath'] || state['selectedPath']) || null
      const selectedIndices = Array.isArray(stateData['selectedIndices'])
        ? (stateData['selectedIndices'] as unknown[]).filter((n): n is number => typeof n === 'number')
        : Array.isArray(state['selectedIndices'])
          ? (state['selectedIndices'] as unknown[]).filter((n): n is number => typeof n === 'number')
          : []
      out.push({
        kind: 'image_options',
        widgetId,
        images: images.slice(0, 12),
        multiSelect: data['multi_select'] === true || data['multiSelect'] === true,
        selectedPath,
        selectedIndices,
        baseVersion: Number(state['version'] ?? w['version'] ?? 0) || 0
      })
      continue
    }

  }
  return out
}


export function parseToolCall(
  eventName: string,
  payload: Record<string, unknown>,
  messageId: string,
  displayText?: string
): MuseToolCall | null {
  const started = eventName === 'tool_call.started' || eventName === 'delta.tool_start'
  const name = str(payload['name']) || 'tool_call'
  const toolType = str(payload['tool_type']) || undefined
  const id = str(payload['tool_id']) || messageId || name
  let status: MuseToolCall['status'] = started ? 'running' : 'completed'
  if (!started) {
    const result = obj(payload['result'])
    if (result['success'] === false) status = 'errored'
  }
  const summary =
    (displayText && displayText.trim()) ||
    str(payload['summary']) ||
    undefined
  return { id, name, toolType, status, summary }
}

export function parseMediaParts(payload: Record<string, unknown>): MuseMediaPart[] {
  const out: MuseMediaPart[] = []
  const seen = new Set<string>()
  const push = (kind: 'image' | 'file', path: string, extra?: Partial<MuseMediaPart>) => {
    const p = path.trim()
    if (!p || seen.has(p)) return
    seen.add(p)
    const name = extra?.name || p.split('/').pop() || p
    out.push({ kind, path: p, name, imageId: extra?.imageId, mimeType: extra?.mimeType })
  }
  const walkContent = (items: unknown) => {
    if (!Array.isArray(items)) return
    for (const raw of items) {
      const c = obj(raw)
      const typ = str(c['type']).toLowerCase()
      if (typ === 'image') {
        const path = str(c['path']) || str(c['url'])
        if (path) push('image', path, { imageId: str(c['image_id'] || c['imageId']) || undefined, mimeType: str(c['mime_type']) || undefined })
      } else if (typ === 'images' && Array.isArray(c['images'])) {
        for (const im of c['images'] as unknown[]) {
          const i = obj(im)
          const path = str(i['path']) || str(i['url'])
          if (path) push('image', path, { imageId: str(i['image_id'] || i['imageId']) || undefined })
        }
      } else if (typ === 'file' || typ === 'file_ref' || typ === 'audio' || typ === 'video') {
        const path = str(c['path']) || str(c['filename']) || str(c['url'])
        if (path) {
          const mime =
            str(c['mime_type'] || c['mimeType']) ||
            (typ === 'audio' ? 'audio/*' : typ === 'video' ? 'video/*' : '') ||
            undefined
          push('file', path, {
            name: str(c['filename'] || c['label']) || undefined,
            mimeType: mime || undefined
          })
        }
      }
    }
  }
  walkContent(payload['content'])
  const transcript = obj(payload['transcript'])
  const messages = transcript['messages']
  if (Array.isArray(messages)) {
    for (const msg of messages) {
      walkContent(obj(msg)['content'])
    }
  }
  // resources[] on the envelope sometimes carries media URIs
  const resources = payload['resources']
  if (Array.isArray(resources)) {
    for (const r of resources) {
      const o = obj(r)
      const path = str(o['path']) || str(o['uri']) || str(o['url'])
      if (!path) continue
      const mt = str(o['mime_type'] || o['mimeType'] || o['media_type']).toLowerCase()
      const kind: 'image' | 'file' = mt.startsWith('image') || str(o['file_type']) === 'image' ? 'image' : 'file'
      push(kind, path, { mimeType: mt || undefined, name: str(o['name']) || undefined })
    }
  }
  // tool result metadata file_paths
  const result = obj(payload['result'])
  const meta = obj(result['metadata'])
  const filePaths = meta['file_paths']
  if (Array.isArray(filePaths)) {
    const ft = str(meta['file_type']) || 'file'
    for (const fp of filePaths) {
      if (typeof fp === 'string' && fp.trim()) {
        push(ft === 'image' ? 'image' : 'file', fp)
      }
    }
  }
  return out
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

function assistantTextFromPayload(p: Record<string, unknown>): string {
  return (
    transcriptText(p) ||
    str(p['display_text']) ||
    str(p['content']) ||
    str(p['text']) ||
    ''
  )
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
        // Tolerate top-level fields when payload is thin.
        const payload = { ...obj(e), ...obj(e['payload']) }
        delete payload['type']
        delete payload['event']
        delete payload['event_name']
        delete payload['seq']
        delete payload['ts_ms']
        delete payload['payload']
        this.emit('event', { name, seq: Number(e['seq'] ?? 0), payload } satisfies MuseChatEvent)
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
  /** Option chips (Kai/Juno) when present on the message. */
  widgets?: MuseOptionWidget[]
  richWidgets?: MuseRichWidget[]
  tools?: MuseToolCall[]
  media?: MuseMediaPart[]
}

export interface ChatStreamResult {
  ack: Record<string, unknown>
  sessionId?: string
  assistantMessageIds: string[]
  text: string
  eventCounts: Record<string, number>
  widgetsByMessageId: Record<string, MuseOptionWidget[]>
  richWidgetsByMessageId: Record<string, MuseRichWidget[]>
}

export interface MuseChatItem {
  type: 'text' | 'image' | 'file' | 'file_ref'
  text?: string
  mime_type?: string
  data_base64?: string
  filename?: string
  path?: string
}

export interface StreamChatInput {
  text: string
  nodeId: string
  sessionId?: string
  capabilities?: string[]
  /** Extra chat.stream items (images/files) after the text item. */
  items?: MuseChatItem[]
  /** Origin metadata for option-widget taps. */
  messageOrigin?: Record<string, unknown>
}

/** Build chat.stream `items` from text + optional attachment items. */
export function buildChatStreamItems(text: string, extra?: MuseChatItem[]): MuseChatItem[] {
  const items: MuseChatItem[] = []
  const trimmed = text.trim()
  if (trimmed) items.push({ type: 'text', text: trimmed })
  if (extra?.length) {
    for (const it of extra) {
      if (!it || !it.type) continue
      items.push(it)
    }
  }
  if (!items.length) items.push({ type: 'text', text: text || '' })
  return items
}

/**
 * Send one user turn and stream the assistant reply(ies) until the agent leaves
 * the busy activity set (debounced) or the hard timeout fires.
 *
 * Does **not** end ~4s after the first `message_done` — long jobs emit a second
 * (or Nth) bubble with a new `message_id` after tools finish.
 */
export async function streamChat(
  gw: MuseNativeGateway,
  channel: MuseChatChannel,
  input: StreamChatInput,
  onUpdate: (u: ChatStreamUpdate) => void,
  opts: { timeoutMs?: number; settleMs?: number; recoverMs?: number; signal?: AbortSignal } = {}
): Promise<ChatStreamResult> {
  await gw.connect()
  await channel.ensure()

  const settleMs = opts.settleMs ?? 1500
  const counts: Record<string, number> = {}
  const texts = new Map<string, string>()
  const widgets = new Map<string, MuseOptionWidget[]>()
  const richWidgets = new Map<string, MuseRichWidget[]>()
  const tools = new Map<string, MuseToolCall[]>()
  const media = new Map<string, MuseMediaPart[]>()
  const order: string[] = []
  const doneIds = new Set<string>()
  let sessionId = input.sessionId ?? ''
  let started = false
  let lastActivity = ''
  let settle!: () => void
  let fail!: (e: Error) => void
  const finished = new Promise<void>((a, b) => {
    settle = a
    fail = b
  })
  let settleTimer: ReturnType<typeof setTimeout> | null = null

  const clearSettle = (): void => {
    if (settleTimer) {
      clearTimeout(settleTimer)
      settleTimer = null
    }
  }

  /** Arm settle only when activity is non-busy and we have at least one bubble. */
  const armSettleIfIdle = (): void => {
    clearSettle()
    if (!started) return
    if (lastActivity && !isMuseIdleActivity(lastActivity)) return
    if (order.length === 0 && doneIds.size === 0) return
    settleTimer = setTimeout(() => {
      settleTimer = null
      settle()
    }, settleMs)
  }

  const ensureBubble = (id: string): void => {
    if (!id) return
    if (!texts.has(id)) {
      texts.set(id, '')
      order.push(id)
    }
  }

  const pushUpdate = (id: string, done: boolean): void => {
    onUpdate({
      messageId: id,
      text: texts.get(id) ?? '',
      done,
      widgets: widgets.get(id),
      richWidgets: richWidgets.get(id),
      tools: tools.get(id),
      media: media.get(id)
    })
  }

  const mine = (p: Record<string, unknown>): boolean => {
    const s = str(p['session_id'])
    if (sessionId) return !s || s === sessionId
    const ctx = obj(p['chat_context'])
    return !str(ctx['device_id']) || str(ctx['device_id']) === input.nodeId
  }

  const applyMedia = (id: string, p: Record<string, unknown>): void => {
    const parsed = parseMediaParts(p)
    if (!parsed.length) return
    const prev = media.get(id) ?? []
    const seen = new Set(prev.map((x) => x.path))
    const merged = [...prev]
    for (const part of parsed) {
      if (seen.has(part.path)) continue
      seen.add(part.path)
      merged.push(part)
    }
    media.set(id, merged)
  }

  const upsertTool = (id: string, tool: MuseToolCall): void => {
    const prev = tools.get(id) ?? []
    const idx = prev.findIndex((t) => t.id === tool.id || t.name === tool.name)
    if (idx >= 0) {
      const next = [...prev]
      next[idx] = { ...prev[idx]!, ...tool, id: prev[idx]!.id }
      tools.set(id, next)
    } else {
      tools.set(id, [...prev, tool])
    }
  }

  const applyWidgets = (id: string, p: Record<string, unknown>): void => {
    const parsed = parseOptionWidgets(p)
    const rich = parseRichWidgets(p)
    if (!parsed.length && !rich.length) return
    ensureBubble(id || order[order.length - 1] || '')
    const target = id || order[order.length - 1]
    if (!target) return
    if (parsed.length) widgets.set(target, parsed)
    if (rich.length) richWidgets.set(target, rich)
    pushUpdate(target, doneIds.has(target))
  }

  const completeBubble = (id: string, p: Record<string, unknown>): void => {
    if (!id) return
    ensureBubble(id)
    if (doneIds.has(id)) {
      applyWidgets(id, p)
      return
    }
    const status = str(p['status'])
    if (status && status !== 'completed' && status !== 'complete' && status !== 'done' && status !== 'finished') {
      if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'interrupted') {
        doneIds.add(id)
        applyWidgets(id, p)
        pushUpdate(id, true)
        armSettleIfIdle()
      }
      return
    }
    const final = mergeMonotonic(texts.get(id) ?? '', assistantTextFromPayload(p))
    texts.set(id, final)
    doneIds.add(id)
    applyWidgets(id, p)
    applyMedia(id, p)
    pushUpdate(id, true)
    armSettleIfIdle()
  }

  const onEvent = (e: MuseChatEvent): void => {
    if (gapTimer) {
      clearTimeout(gapTimer)
      gapTimer = null
    }
    const p = e.payload
    const watched =
      e.name.startsWith('delta.') ||
      e.name === 'message.user' ||
      e.name === 'agent.status' ||
      e.name === 'message.assistant' ||
      e.name === 'tool_call.started' ||
      e.name === 'tool_call.completed'
    if (!watched) return
    if (e.name !== 'agent.status' && !mine(p)) return
    counts[e.name] = (counts[e.name] ?? 0) + 1
    const id = str(p['message_id'])
    switch (e.name) {
      case 'message.user':
        started = true
        if (!sessionId) sessionId = str(p['session_id'])
        clearSettle()
        break
      case 'delta.message_start':
        if (!started) break
        if (!id) break
        ensureBubble(id)
        clearSettle()
        pushUpdate(id, false)
        break
      case 'delta.text_append': {
        if (!started || !id) break
        ensureBubble(id)
        const next = texts.get(id)! + str(p['text'])
        texts.set(id, next)
        pushUpdate(id, false)
        break
      }
      case 'delta.presentation':
        if (!started) break
        applyWidgets(id, p)
        if (id) applyMedia(id, p)
        // Presentation-carrier with no text still needs a bubble.
        if (id) {
          ensureBubble(id)
          if (!texts.get(id)) {
            const t = assistantTextFromPayload(p)
            if (t) texts.set(id, t)
          }
          pushUpdate(id, doneIds.has(id))
        }
        break
      case 'delta.message_done':
      case 'message.assistant': {
        if (!started) break
        if (!id) break
        completeBubble(id, p)
        break
      }
      case 'delta.tool_start':
      case 'delta.tool_done':
      case 'tool_call.started':
      case 'tool_call.completed': {
        if (!started || !id) break
        ensureBubble(id)
        const tool = parseToolCall(e.name, p, str(p['tool_id']) || id)
        if (tool) upsertTool(id, tool)
        applyMedia(id, p)
        clearSettle()
        pushUpdate(id, doneIds.has(id))
        break
      }
      case 'agent.status': {
        const act = parseAgentStatus(p)
        lastActivity = act.code
        if (act.busy) {
          clearSettle()
        } else if (started && (doneIds.size > 0 || order.length > 0)) {
          armSettleIfIdle()
        }
        break
      }
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

  const applyHistoryRows = (rows: HistoryRow[], afterUser = false): void => {
    let take = rows
    if (afterUser) {
      // Prefer rows not already completed in this turn; still accept brand-new ids.
      take = rows
    }
    for (const row of take) {
      if (!row.id) continue
      ensureBubble(row.id)
      const merged = mergeMonotonic(texts.get(row.id) ?? '', row.text)
      if (merged !== texts.get(row.id)) {
        texts.set(row.id, merged)
        pushUpdate(row.id, false)
      }
      if (row.widgets?.length) {
        widgets.set(row.id, row.widgets)
      }
      if (row.completed && !doneIds.has(row.id)) {
        doneIds.add(row.id)
        pushUpdate(row.id, true)
      } else if (row.widgets?.length) {
        pushUpdate(row.id, doneIds.has(row.id))
      }
    }
  }

  const backfill = async (): Promise<void> => {
    if (backfilling) return
    backfilling = true
    try {
      while (!closed && sessionId && (order.some((id) => !doneIds.has(id)) || (lastActivity && !isMuseIdleActivity(lastActivity)))) {
        await new Promise((r) => setTimeout(r, 2000))
        if (closed || !gw.isReady()) continue
        let hist: unknown
        try {
          hist = await gw.request('chat.history', { session_id: sessionId, limit: 50 })
        } catch {
          continue
        }
        const rows = historyAssistants(hist)
        if (gapTimer) {
          clearTimeout(gapTimer)
          gapTimer = null
        }
        applyHistoryRows(rows)
        if (order.length && order.every((id) => doneIds.has(id)) && isMuseIdleActivity(lastActivity)) {
          settle()
          return
        }
      }
    } finally {
      backfilling = false
    }
  }

  const reconcileFinal = async (): Promise<void> => {
    if (!sessionId || !gw.isReady()) return
    try {
      const hist = await gw.request('chat.history', { session_id: sessionId, limit: 50 })
      applyHistoryRows(historyAssistants(hist), true)
    } catch {
      /* best-effort */
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
  const timer = setTimeout(settle, opts.timeoutMs ?? 600_000)
  let ack: Record<string, unknown> = {}
  try {
    const params: Record<string, unknown> = {
      items: buildChatStreamItems(input.text, input.items),
      node_id: input.nodeId,
      capabilities: input.capabilities ?? MUSE_CHAT_CAPABILITIES
    }
    if (input.sessionId) params['session_id'] = input.sessionId
    if (input.messageOrigin) params['message_origin'] = input.messageOrigin
    const h = await gw.subscribe('chat.stream', params, () => undefined)
    ack = await h.ack
    const r = obj(ack['result'])
    const ackSession = str(ack['session_id']) || str(r['session_id'])
    if (!sessionId && ackSession) sessionId = ackSession
    started = true
    await h.done.catch(() => undefined)
    await finished
    await reconcileFinal()
  } finally {
    closed = true
    gw.off('phase', onPhase)
    clearTimeout(timer)
    clearSettle()
    if (gapTimer) clearTimeout(gapTimer)
    channel.off('event', onEvent)
    channel.off('ended', onEnded)
    opts.signal?.removeEventListener('abort', onAbort)
  }
  for (const id of order) if (!doneIds.has(id)) pushUpdate(id, true)
  const widgetsByMessageId: Record<string, MuseOptionWidget[]> = {}
  for (const [id, list] of widgets) widgetsByMessageId[id] = list
  const richWidgetsByMessageId: Record<string, MuseRichWidget[]> = {}
  for (const [id, list] of richWidgets) richWidgetsByMessageId[id] = list
  return {
    ack,
    sessionId: sessionId || undefined,
    assistantMessageIds: order,
    text: order.map((id) => texts.get(id) ?? '').filter(Boolean).join('\n\n'),
    eventCounts: counts,
    widgetsByMessageId,
    richWidgetsByMessageId
  }
}

/**
 * Persist option selection then send the chosen label as a user turn.
 */
export async function selectOptionWidget(
  gw: MuseNativeGateway,
  channel: MuseChatChannel,
  input: {
    nodeId: string
    sessionId?: string
    hostMessageId: string
    widget: MuseOptionWidget
    selectedText: string
    optionIndex: number
  },
  onUpdate: (u: ChatStreamUpdate) => void,
  opts?: { timeoutMs?: number; settleMs?: number; signal?: AbortSignal }
): Promise<ChatStreamResult> {
  const mutationId = randomUUID()
  try {
    await gw.request('widgets.state.set', {
      widget_id: input.widget.widgetId,
      base_version: input.widget.baseVersion,
      mutation_id: mutationId,
      state: { selectedText: input.selectedText }
    })
  } catch {
    // Best-effort; still send the chat turn.
  }
  return streamChat(
    gw,
    channel,
    {
      text: input.selectedText,
      nodeId: input.nodeId,
      sessionId: input.sessionId,
      messageOrigin: {
        kind: 'options_widget',
        widget_id: input.widget.widgetId,
        message_id: input.hostMessageId,
        option_index: input.optionIndex,
        interaction_id: randomUUID()
      }
    },
    onUpdate,
    opts
  )
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
  widgets?: MuseOptionWidget[]
  richWidgets?: MuseRichWidget[]
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
    const isPresentation = /presentation/i.test(name)
    if (!/assistant/.test(name) && role !== 'assistant' && !isPresentation) continue
    const mergedPayload = { ...e, ...p }
    const text =
      transcriptText(p) ||
      transcriptText(e) ||
      str(e['display_text']) ||
      str(p['display_text']) ||
      str(e['text']) ||
      str(p['content']) ||
      str(e['content'])
    const status = (str(p['status']) || str(e['status'])).toLowerCase()
    const w = parseOptionWidgets(mergedPayload)
    const rw = parseRichWidgets(mergedPayload)
    rows.push({
      id: str(e['message_id']) || str(p['message_id']) || str(e['id']),
      text,
      completed: status === 'completed' || status === 'complete' || status === 'done' || status === 'finished' || (!status && Boolean(text || w.length)),
      widgets: w.length ? w : undefined, richWidgets: rw.length ? rw : undefined,
      at: Number(e['occurred_at_ms'] ?? e['created_at_ms'] ?? e['ts_ms'] ?? 0) || 0
    })
  }
  rows.sort((a, b) => a.at - b.at)
  return rows
}
