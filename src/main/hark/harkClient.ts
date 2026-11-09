/**
 * Hark Go REST + Real-time Sync (`/api/sync/conversation` SSE + `/api/sync/poll` fallback)
 * bound to an Electron session partition.
 *
 * Reverse-engineered from Hark.app (0.1.21) & frontend chunks `DD3Rh-3z.js`,
 * `j8yWSo31.js`, and `worker-Ce4znvdx.js`.
 * Never logs cookie values or tokens.
 */

import { randomUUID } from 'node:crypto'
import { session as electronSession, type Session } from 'electron'
import { partitionForAccount } from '../webContentsViewManager'
import { HarkWatchRegistry } from './watchRegistry'

export const HARK_ORIGIN = 'https://app.hark.com'
export const HARK_API_BASE = `${HARK_ORIGIN}/api`
export const HARK_LOGIN_URL = `${HARK_ORIGIN}/login`
export const HARK_CLIENT_VERSION = '0.1.21'
export const HARK_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Hark/0.1.21 Chrome/134.0.6998.88 Electron/35.1.2 Safari/537.36'

export class HarkApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, bodyText: string) {
    let parsed: unknown = bodyText
    try {
      parsed = JSON.parse(bodyText)
    } catch {
      /* keep text */
    }
    const message =
      typeof parsed === 'object' &&
      parsed &&
      typeof (parsed as { message?: unknown }).message === 'string'
        ? (parsed as { message: string }).message
        : typeof parsed === 'object' &&
            parsed &&
            typeof (parsed as { error?: unknown }).error === 'string'
          ? (parsed as { error: string }).error
          : `Hark API error ${status}`
    super(message)
    this.name = 'HarkApiError'
    this.status = status
    this.body = parsed
  }
}

export type HarkSessionUser = {
  id?: string
  email?: string | null
  name?: string | null
  image?: string | null
}

export type HarkAuthSession = {
  user?: HarkSessionUser | null
  session?: { id?: string; token?: string; expiresAt?: string } | null
} | null

function localeHeader(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en'
  } catch {
    return 'en'
  }
}

export function timezoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function sessionForAccount(accountId: string): Session {
  return electronSession.fromPartition(partitionForAccount(accountId))
}

function harkClientHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: 'application/json',
    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    Origin: HARK_ORIGIN,
    Referer: `${HARK_ORIGIN}/`,
    'User-Agent': HARK_USER_AGENT,
    'X-Hark-Locale': localeHeader(),
    'X-Hark-Timezone': timezoneName(),
    'X-Hark-Client-Version': HARK_CLIENT_VERSION,
    'Sec-Ch-Ua': '"Chromium";v="134", "Not:A-Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    ...(extra ?? {})
  }
}

const HARK_REQUEST_TIMEOUT_MS = 30_000

async function harkFetch(
  ses: Session,
  path: string,
  init: {
    method?: string
    query?: Record<string, string | undefined>
    body?: unknown
    signal?: AbortSignal
  } = {}
): Promise<unknown> {
  const url = new URL(path.startsWith('http') ? path : `${HARK_API_BASE}${path}`)
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value != null && value !== '') url.searchParams.set(key, value)
    }
  }

  const headers = harkClientHeaders(
    init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined
  )
  const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET')
  const maxAttempts = method === 'GET' ? 3 : 2
  let lastErr: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 350 * attempt))
    }
    // Every attempt gets its own deadline; a stalled request used to leave
    // the bubble on "Sending" and the account `pending` until restart.
    const deadline = AbortSignal.timeout(HARK_REQUEST_TIMEOUT_MS)
    const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline
    try {
      const response = await ses.fetch(url.toString(), {
        method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal
      })

      const text = await response.text()
      if (!response.ok) {
        const err = new HarkApiError(response.status, text || response.statusText)
        if (
          (response.status === 429 ||
            response.status === 502 ||
            response.status === 503 ||
            response.status === 504) &&
          attempt + 1 < maxAttempts
        ) {
          lastErr = err
          continue
        }
        throw err
      }
      if (!text) return null
      try {
        return JSON.parse(text) as unknown
      } catch {
        return text
      }
    } catch (err) {
      lastErr = err
      if (init.signal?.aborted || err instanceof HarkApiError) throw err
      // A write that timed out may already have landed: don't send it twice.
      if (deadline.aborted && method !== 'GET') throw new Error(`Hark ${method} ${url.pathname} timed out`)
      if (attempt + 1 >= maxAttempts) throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Hark request failed')
}

export async function callHarkApi(
  accountId: string,
  opts: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
    path: string
    query?: Record<string, string | undefined>
    body?: unknown
  }
): Promise<unknown> {
  const cleanPath = opts.path.startsWith('/') ? opts.path : `/${opts.path}`
  return harkFetch(sessionForAccount(accountId), cleanPath, {
    method: opts.method,
    query: opts.query,
    body: opts.body
  })
}

export async function getAuthSession(accountId: string): Promise<HarkAuthSession> {
  const ses = sessionForAccount(accountId)
  const data = await harkFetch(ses, '/auth/get-session')
  if (data == null) return null
  if (typeof data !== 'object') return null
  return data as HarkAuthSession
}

export function extractHandle(session: HarkAuthSession): {
  handle?: string
  displayName?: string
  userId?: string
} {
  const user = session && typeof session === 'object' ? session.user : null
  if (!user || typeof user !== 'object') return {}
  const email = typeof user.email === 'string' ? user.email : undefined
  const name = typeof user.name === 'string' ? user.name : undefined
  const userId = typeof user.id === 'string' ? user.id : undefined
  return { handle: email ?? name, displayName: name ?? email, userId }
}

/** Cookie names that indicate a signed-in Hark better-auth session. */
export function looksLikeSessionCookie(name: string): boolean {
  if (name === '__Secure-hark.state' || name === '__Secure-hark.region_flow') return false
  if (name.startsWith('__Secure-hark.')) return true
  if (/^better-auth\.session/i.test(name)) return true
  if (/hark.*session/i.test(name) && !/state|region/i.test(name)) return true
  return false
}

export async function listSessionCookieNames(accountId: string): Promise<string[]> {
  const ses = sessionForAccount(accountId)
  const cookies = await ses.cookies.get({})
  const names = new Set<string>()
  for (const c of cookies) {
    if (looksLikeSessionCookie(c.name)) names.add(c.name)
  }
  return [...names]
}

/**
 * Import Hark session cookies from a standard Cookie header string,
 * JSON cookie array, or raw `__Secure-hark.session_token` value.
 */
export async function importHarkCredentials(accountId: string, rawInput: string): Promise<boolean> {
  const trimmed = rawInput.trim().replace(/^Cookie:\s*/i, '')
  if (!trimmed) return false
  const ses = sessionForAccount(accountId)
  const exp = Math.floor(Date.now() / 1000) + 86400 * 30
  const pairs: Array<{ name: string; value: string; domain?: string; path?: string }> = []

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      const list = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of list) {
        if (!item || typeof item !== 'object') continue
        const rec = item as Record<string, unknown>
        if (typeof rec.name === 'string' && typeof rec.value === 'string') {
          pairs.push({
            name: rec.name,
            value: rec.value,
            domain: typeof rec.domain === 'string' ? rec.domain : 'app.hark.com',
            path: typeof rec.path === 'string' ? rec.path : '/'
          })
        } else if (typeof rec.token === 'string' && rec.token.trim()) {
          pairs.push({ name: '__Secure-hark.session_token', value: rec.token.trim() })
          pairs.push({ name: '__Secure-better-auth.session_token', value: rec.token.trim() })
        }
      }
    } catch {
      /* fall through to key=value parsing */
    }
  }

  if (pairs.length === 0) {
    if (trimmed.includes('=')) {
      for (const segment of trimmed.split(/[;\n]+/)) {
        const idx = segment.indexOf('=')
        if (idx <= 0) continue
        const name = segment.slice(0, idx).trim()
        const value = segment.slice(idx + 1).trim()
        if (name && value) pairs.push({ name, value })
      }
    } else {
      pairs.push({ name: '__Secure-hark.session_token', value: trimmed })
      pairs.push({ name: '__Secure-better-auth.session_token', value: trimmed })
    }
  }

  if (pairs.length === 0) return false
  for (const c of pairs) {
    try {
      await ses.cookies.set({
        url: HARK_ORIGIN + (c.path?.startsWith('/') ? c.path : '/'),
        domain: c.domain || 'app.hark.com',
        name: c.name,
        value: c.value,
        path: c.path || '/',
        secure: true,
        httpOnly: true,
        expirationDate: exp
      })
    } catch {
      /* ignore individual cookie errors */
    }
  }
  await ses.cookies.flushStore().catch(() => undefined)
  return true
}

export async function clearHarkAccount(accountId: string): Promise<void> {
  cancelHarkWatch(accountId)
  const ses = sessionForAccount(accountId)
  await ses
    .clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage']
    })
    .catch(() => undefined)
  await ses.cookies.flushStore().catch(() => undefined)
}

/**
 * Fetch the full conversation transcript via `/api/sync/poll?first=1`
 * (since `/conversations/main` only returns `{ conversationId }` metadata).
 */
export async function fetchConversationSnapshotSummary(
  accountId: string,
  conversationId: string
): Promise<HarkConversationSnapshotSummary> {
  const ses = sessionForAccount(accountId)
  const managerId = randomUUID()
  const syncState = new HarkConversationSyncState()
  try {
    const pollRes = (await harkFetch(ses, '/sync/poll', {
      method: 'GET',
      query: {
        conversationId,
        v: '2',
        manager: managerId,
        mode: 'in_tab',
        dial: 'initial',
        first: '1'
      }
    })) as { frames?: string[] } | null
    if (pollRes && Array.isArray(pollRes.frames)) {
      for (const frame of pollRes.frames) {
        syncState.applyFrame(frame)
      }
    }
  } catch {
    /* ignore */
  }
  return {
    conversationId,
    messages: syncState.orderedMessages(),
    panels: syncState.extractPanels(),
    asks: syncState.extractAsks(),
    artifacts: syncState.extractArtifacts(),
    activeActivity: syncState.activeActivity,
    narration: syncState.narration
  }
}

export async function fetchConversationSnapshotMessages(
  accountId: string,
  conversationId: string
): Promise<HarkChatMessage[]> {
  const snap = await fetchConversationSnapshotSummary(accountId, conversationId)
  return snap.messages
}

export async function getProfile(accountId: string): Promise<unknown> {
  return harkFetch(sessionForAccount(accountId), '/profile')
}

export async function listConversations(accountId: string): Promise<unknown> {
  return harkFetch(sessionForAccount(accountId), '/conversations')
}

export async function getMainConversation(
  accountId: string,
  timezone = timezoneName()
): Promise<unknown> {
  return harkFetch(sessionForAccount(accountId), '/conversations/main', {
    query: { timezone }
  })
}

export async function getConversationStatuses(accountId: string): Promise<unknown> {
  return harkFetch(sessionForAccount(accountId), '/conversations/status')
}

export interface HarkUploadedAttachment {
  attachment_id: string
  name: string
  media_type: string
  size: number
  path: string
  s3_key: string
  kind: 'file'
  text?: string
}

/**
 * 3-step file upload from `DD3Rh-3z.js`:
 * 1. `POST /api/files/upload/${conversationId}/presign` `{ filename, content_type, size }`
 * 2. `PUT <upload_url>` raw bytes
 * 3. `POST /api/files/${conversationId}/${attachment_id}/finalize` `{ s3_key, path }`
 */
export async function uploadHarkAttachment(
  accountId: string,
  conversationId: string,
  file: { name: string; mimeType: string; dataBase64: string }
): Promise<HarkUploadedAttachment> {
  const ses = sessionForAccount(accountId)
  const bytes = Buffer.from(file.dataBase64, 'base64')
  const contentType = file.mimeType || 'application/octet-stream'

  const presign = (await harkFetch(ses, `/files/upload/${encodeURIComponent(conversationId)}/presign`, {
    method: 'POST',
    body: {
      filename: file.name,
      content_type: contentType,
      size: bytes.byteLength
    }
  })) as Record<string, unknown>

  const uploadUrl = String(presign?.['upload_url'] ?? '')
  const attachmentId = String(presign?.['attachment_id'] ?? '')
  const s3Key = String(presign?.['s3_key'] ?? '')
  const path = String(presign?.['path'] ?? file.name)
  if (!uploadUrl || !attachmentId || !s3Key) {
    throw new Error('Hark presign returned incomplete metadata')
  }

  const putRes = await ses.fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': String(presign?.['content_type'] ?? contentType) },
    body: new Uint8Array(bytes)
  })
  if (!putRes.ok) {
    throw new Error(`Hark S3 upload failed (${putRes.status})`)
  }

  const finalized = (await harkFetch(
    ses,
    `/files/${encodeURIComponent(conversationId)}/${encodeURIComponent(attachmentId)}/finalize`,
    {
      method: 'POST',
      body: { s3_key: s3Key, path }
    }
  )) as Record<string, unknown>

  const finalPath = String(finalized?.['path'] ?? path)
  return {
    attachment_id: String(finalized?.['attachment_id'] ?? attachmentId),
    name: String(finalized?.['name'] ?? file.name),
    media_type: String(finalized?.['media_type'] ?? contentType),
    size: Number(finalized?.['size'] ?? bytes.byteLength),
    path: finalPath,
    s3_key: String(finalized?.['s3_key'] ?? s3Key),
    kind: 'file',
    text: `Path: ${finalPath}`
  }
}

export async function downloadHarkArtifact(
  accountId: string,
  opts: { url?: string; fileId?: string; name?: string }
): Promise<{
  dataBase64: string
  mimeType: string
  filename: string
  text?: string
}> {
  const ses = sessionForAccount(accountId)
  let targetUrl = opts.url?.trim() || ''

  if (!targetUrl && opts.fileId) {
    const key = opts.fileId.replace(/^(harkatt|harkfile):\/\//i, '').trim()
    if (/^https?:\/\//i.test(key)) {
      targetUrl = key
    } else {
      try {
        const presigned = (await harkFetch(ses, '/images/presign', {
          method: 'POST',
          body: { keys: [key] }
        })) as Record<string, unknown>
        const urls = (presigned?.['urls'] ?? presigned?.['data'] ?? presigned) as Record<string, unknown> | undefined
        const resolved = urls && typeof urls[key] === 'string' ? (urls[key] as string) : ''
        if (resolved) targetUrl = resolved
      } catch {
        /* fall through */
      }
      if (!targetUrl && key.startsWith('/')) {
        targetUrl = `${HARK_API_BASE}${key}`
      }
    }
  }

  if (!targetUrl) {
    throw new Error('Hark artifact URL or S3 key could not be resolved')
  }

  const res = await ses.fetch(targetUrl)
  if (!res.ok) {
    throw new Error(`Hark artifact download failed (${res.status})`)
  }
  const ab = await res.arrayBuffer()
  const buf = Buffer.from(ab)
  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'
  const filename = opts.name || targetUrl.split('?')[0]?.split('/').pop() || 'artifact'
  const isText = /^(text\/|application\/(json|javascript|xml|x-yaml|csv|sql))/i.test(contentType) ||
    /\.(md|markdown|txt|json|csv|html|htm|py|ts|tsx|js|sh|yaml|yml|sql)$/i.test(filename)

  return {
    dataBase64: buf.toString('base64'),
    mimeType: contentType,
    filename,
    ...(isText ? { text: buf.toString('utf8') } : {})
  }
}

/**
 * Exact `wl.messages.sendMessage.mutate` payload from `DD3Rh-3z.js` (@97725):
 * `POST /api/messages/send?cid=<conversationId>`
 * `{ timezone, conversationId, message, idempotencyKey, responseMessageId, attachments? }`
 */
export async function sendMessage(
  accountId: string,
  conversationId: string,
  text: string,
  timezone = timezoneName(),
  attachments?: HarkUploadedAttachment[]
): Promise<{
  result: unknown
  idempotencyKey: string
  responseMessageId: string
}> {
  const ses = sessionForAccount(accountId)
  const idempotencyKey = randomUUID()
  const responseMessageId = randomUUID()
  const body: Record<string, unknown> = {
    timezone,
    conversationId,
    message: text,
    idempotencyKey,
    responseMessageId,
    ...(attachments && attachments.length > 0 ? { attachments } : {})
  }
  const result = await harkFetch(ses, '/messages/send', {
    method: 'POST',
    query: { cid: conversationId },
    body
  })
  return { result, idempotencyKey, responseMessageId }
}

export type HarkChatMessage = {
  id: string
  role: string
  content: string
  isStreaming?: boolean
  jobStatus?: string
  error?: string
  thought?: string
  narration?: string
  createdAt?: string | number | null
  toolCalls?: Array<{
    dispatchId: string
    name: string
    status: string
    url?: string
    screenshotKey?: string
    screenshotUrl?: string
    command?: string
    result?: string
  }>
  actions?: Array<{
    kind: string
    connector?: string
    label: string
    scopes?: string
  }>
  artifacts?: Array<{
    name?: string
    path: string
    s3Key?: string
    downloadUrl?: string
    mimeType?: string
    sizeBytes?: number
  }>
}

export interface HarkActivityPanel {
  dispatchId: string
  kind: string
  status: string
  title?: string
  url?: string
  liveViewUrl?: string
  screenshotKey?: string
  screenshotUrl?: string
  command?: string
}

export interface HarkPendingAsk {
  id: string
  dispatchId?: string
  requestId?: string
  displayHint?: string
  prompt?: string
  domain?: string
  status: string
  raw: Record<string, unknown>
}

export interface HarkConversationSnapshotSummary {
  conversationId: string
  messages: HarkChatMessage[]
  panels: HarkActivityPanel[]
  asks: HarkPendingAsk[]
  artifacts: Array<{
    name: string
    path: string
    s3Key?: string
    downloadUrl?: string
    mimeType?: string
    sizeBytes?: number
  }>
  activeActivity?: string | null
  narration?: string | null
}

/**
 * Real-time conversation state reducer (`worker-Ce4znvdx.js`).
 * Consumes `snapshot` and `patches` (`entry_add` / `message_add`, `message_update`,
 * `tool_add`, `tool_update`, `narration_update`, `active_activity_set`).
 */
export class HarkConversationSyncState {
  readonly messages = new Map<string, HarkChatMessage>()
  readonly windows = new Map<string, Record<string, unknown>>()
  readonly asks = new Map<string, Record<string, unknown>>()
  readonly order: string[] = []
  activeActivity: string | null = null
  narration: string | null = null

  applyFrame(rawFrame: string): boolean {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawFrame) as Record<string, unknown>
    } catch {
      return false
    }
    const type = parsed['type']
    if (type !== 'snapshot' && type !== 'patches') return false

    if (type === 'snapshot') {
      const data = (parsed['data'] ?? {}) as Record<string, unknown>
      this.messages.clear()
      this.windows.clear()
      this.asks.clear()
      this.order.length = 0
      this.activeActivity = typeof data['activeActivity'] === 'string' ? data['activeActivity'] : null
      this.narration = typeof data['narration'] === 'string' ? data['narration'] : null

      if (data['windows'] && typeof data['windows'] === 'object') {
        for (const [wid, wval] of Object.entries(data['windows'] as Record<string, unknown>)) {
          if (wval && typeof wval === 'object') {
            this.windows.set(wid, wval as Record<string, unknown>)
          }
        }
      }
      if (data['asks'] && typeof data['asks'] === 'object') {
        for (const [aid, aval] of Object.entries(data['asks'] as Record<string, unknown>)) {
          if (aval && typeof aval === 'object') {
            this.asks.set(aid, aval as Record<string, unknown>)
          }
        }
      }

      if (parsed['shape'] === 'records' && data['messages'] && typeof data['messages'] === 'object' && !Array.isArray(data['messages'])) {
        const msgMap = data['messages'] as Record<string, Record<string, unknown>>
        const log = Array.isArray(data['log']) ? (data['log'] as Array<Record<string, unknown>>) : []
        for (const entry of log) {
          const id = String(entry['id'] ?? '')
          if (!id) continue
          const m = msgMap[id]
          if (m) {
            this.messages.set(id, normalizeSyncMessage(id, m))
            this.order.push(id)
          }
        }
        for (const [id, m] of Object.entries(msgMap)) {
          if (!this.messages.has(id)) {
            this.messages.set(id, normalizeSyncMessage(id, m))
            this.order.push(id)
          }
        }
      } else {
        const list = extractMessages(data)
        for (const m of list) {
          this.messages.set(m.id, m)
          this.order.push(m.id)
        }
      }
      return true
    }

    // type === 'patches'
    const patches = Array.isArray(parsed['data']) ? (parsed['data'] as Array<Record<string, unknown>>) : []
    let changed = false
    for (const p of patches) {
      const op = String(p['op'] ?? '')
      if (op === 'entry_add' || op === 'message_add') {
        const entryKind = String(p['entry'] ?? 'message')
        const id = String(p['id'] ?? p['messageId'] ?? '')
        const val = (p['value'] ?? {}) as Record<string, unknown>
        if (!id) continue
        if (entryKind === 'window') {
          this.windows.set(id, val)
          changed = true
          continue
        }
        if (entryKind === 'ask') {
          this.asks.set(id, val)
          changed = true
          continue
        }
        this.messages.set(id, normalizeSyncMessage(id, val))
        if (!this.order.includes(id)) this.order.push(id)
        changed = true
      } else if (op === 'window_update') {
        const id = String(p['id'] ?? '')
        const fields = (p['fields'] ?? {}) as Record<string, unknown>
        const prev = this.windows.get(id) ?? {}
        if (id) {
          this.windows.set(id, { ...prev, ...fields })
          changed = true
        }
      } else if (op === 'ask_update') {
        const id = String(p['id'] ?? '')
        const fields = (p['fields'] ?? {}) as Record<string, unknown>
        const prev = this.asks.get(id) ?? {}
        if (id) {
          this.asks.set(id, { ...prev, ...fields })
          changed = true
        }
      } else if (op === 'panel_add' || op === 'panel_update') {
        const id = String(p['id'] ?? p['messageId'] ?? '')
        const w = this.windows.get(id)
        if (w) {
          const panels = Array.isArray(w['panels']) ? [...(w['panels'] as Record<string, unknown>[])] : []
          if (op === 'panel_add' && p['value'] && typeof p['value'] === 'object') {
            panels.push(p['value'] as Record<string, unknown>)
          } else if (op === 'panel_update') {
            const did = String(p['dispatchId'] ?? '')
            const fields = (p['fields'] ?? {}) as Record<string, unknown>
            const idx = panels.findIndex((pn) => String(pn['dispatchId'] ?? '') === did)
            if (idx >= 0) panels[idx] = { ...panels[idx]!, ...fields }
          }
          this.windows.set(id, { ...w, panels })
          changed = true
        }
      } else if (op === 'message_update') {
        const id = String(p['id'] ?? p['messageId'] ?? '')
        const fields = (p['fields'] ?? {}) as Record<string, unknown>
        const existing = this.messages.get(id)
        if (existing) {
          const patched = normalizeSyncMessage(id, fields)
          const nextContent =
            (typeof fields['content'] === 'string' && fields['content']) ||
            (typeof fields['text'] === 'string' && fields['text']) ||
            (fields['presentation'] ? patched.content : undefined)
          const terminalJob =
            typeof fields['jobStatus'] === 'string' &&
            /^(completed|cancelled|failed|interrupted|cost_capped)$/i.test(fields['jobStatus'])
          const nextStreaming =
            typeof fields['isStreaming'] === 'boolean'
              ? fields['isStreaming']
              : terminalJob
                ? false
                : existing.isStreaming
          const updated: HarkChatMessage = {
            ...existing,
            ...(nextContent !== undefined && (nextContent || !existing.content)
              ? { content: nextContent }
              : {}),
            ...(nextStreaming !== undefined ? { isStreaming: nextStreaming } : {}),
            ...(typeof fields['jobStatus'] === 'string' ? { jobStatus: fields['jobStatus'] } : {}),
            ...(typeof fields['error'] === 'string' ? { error: fields['error'] } : {}),
            ...(typeof fields['thought'] === 'string' ? { thought: fields['thought'] } : {}),
            ...(typeof fields['narration'] === 'string' ? { narration: fields['narration'] } : {}),
            ...(patched.actions?.length ? { actions: patched.actions } : {}),
            ...(patched.artifacts?.length
              ? {
                  artifacts: [
                    ...(existing.artifacts ?? []),
                    ...patched.artifacts.filter(
                      (a) => !(existing.artifacts ?? []).some((e) => (e.s3Key || e.path) === (a.s3Key || a.path))
                    )
                  ]
                }
              : {}),
            ...(patched.toolCalls?.length ? { toolCalls: patched.toolCalls } : {})
          }
          if (nextStreaming === false) {
            delete updated.thought
            delete updated.narration
          }
          this.messages.set(id, updated)
          changed = true
        } else if (id) {
          this.messages.set(id, normalizeSyncMessage(id, fields))
          if (!this.order.includes(id)) this.order.push(id)
          changed = true
        }
      } else if (op === 'tool_add') {
        const id = String(p['id'] ?? p['messageId'] ?? '')
        const val = (p['value'] ?? {}) as Record<string, unknown>
        const existing = this.messages.get(id)
        if (existing) {
          const dispatchId = String(val['dispatchId'] ?? val['dispatch_id'] ?? '')
          const name = String(val['toolName'] ?? val['tool_name'] ?? val['type'] ?? 'tool')
          const status = String(val['status'] ?? 'running')
          const input = (val['input'] ?? {}) as Record<string, unknown>
          const progressMeta = ((val['progress'] as Record<string, unknown> | undefined)?.['metadata'] ?? {}) as Record<string, unknown>
          const prevTools = existing.toolCalls ?? []
          if (dispatchId && !prevTools.some((t) => t.dispatchId === dispatchId)) {
            this.messages.set(id, {
              ...existing,
              toolCalls: [
                ...prevTools,
                {
                  dispatchId,
                  name,
                  status,
                  url: String(input['url'] ?? progressMeta['url'] ?? '') || undefined,
                  screenshotKey: String(val['screenshotKey'] ?? progressMeta['screenshot_key'] ?? '') || undefined,
                  screenshotUrl: String(val['screenshotUrl'] ?? progressMeta['screenshot_url'] ?? '') || undefined,
                  command: String(input['command'] ?? progressMeta['command'] ?? '') || undefined
                }
              ]
            })
            changed = true
          }
        }
      } else if (op === 'tool_update') {
        const id = String(p['id'] ?? p['messageId'] ?? '')
        const dispatchId = String(p['dispatchId'] ?? '')
        const fields = (p['fields'] ?? {}) as Record<string, unknown>
        const existing = this.messages.get(id)
        if (existing?.toolCalls) {
          this.messages.set(id, {
            ...existing,
            toolCalls: existing.toolCalls.map((tc) =>
              tc.dispatchId === dispatchId
                ? {
                    ...tc,
                    status: String(fields['status'] ?? tc.status),
                    screenshotKey: String(fields['screenshotKey'] ?? tc.screenshotKey ?? '') || undefined,
                    screenshotUrl: String(fields['screenshotUrl'] ?? tc.screenshotUrl ?? '') || undefined
                  }
                : tc
            )
          })
          changed = true
        }
      } else if (op === 'narration_update') {
        this.narration = typeof p['value'] === 'string' ? p['value'] : null
        changed = true
      } else if (op === 'active_activity_set') {
        const v = p['value']
        this.activeActivity =
          typeof v === 'string'
            ? v
            : v && typeof v === 'object'
              ? String((v as Record<string, unknown>)['label'] ?? (v as Record<string, unknown>)['type'] ?? '')
              : null
        changed = true
      }
    }
    return changed
  }

  orderedMessages(): HarkChatMessage[] {
    return this.order.map((id) => this.messages.get(id)!).filter(Boolean)
  }

  extractPanels(): HarkActivityPanel[] {
    const out: HarkActivityPanel[] = []
    const pushPanel = (raw: Record<string, unknown>) => {
      const dispatchId = String(raw['dispatchId'] ?? raw['id'] ?? `panel_${out.length}`)
      if (out.some((x) => x.dispatchId === dispatchId)) return
      const screenshot = (raw['screenshot'] ?? {}) as Record<string, unknown>
      out.push({
        dispatchId,
        kind: String(raw['kind'] ?? raw['type'] ?? 'browser'),
        status: String(raw['status'] ?? 'active'),
        title: String(raw['title'] ?? raw['label'] ?? raw['objective'] ?? '') || undefined,
        url: String(raw['url'] ?? '') || undefined,
        liveViewUrl: String(raw['liveViewUrl'] ?? '') || undefined,
        screenshotKey: String(screenshot['key'] ?? raw['screenshotKey'] ?? '') || undefined,
        screenshotUrl: String(screenshot['downloadUrl'] ?? raw['previewUrl'] ?? '') || undefined,
        command: String(raw['command'] ?? '') || undefined
      })
    }
    for (const w of this.windows.values()) {
      const panels = Array.isArray(w['panels']) ? (w['panels'] as Record<string, unknown>[]) : []
      for (const p of panels) if (p && typeof p === 'object') pushPanel(p)
    }
    for (const m of this.messages.values()) {
      for (const tc of m.toolCalls ?? []) {
        if (tc.screenshotKey || tc.screenshotUrl || tc.url || tc.command || /browser|computer|shell|coding/i.test(tc.name)) {
          out.push({
            dispatchId: tc.dispatchId,
            kind: tc.name,
            status: tc.status,
            url: tc.url,
            screenshotKey: tc.screenshotKey,
            screenshotUrl: tc.screenshotUrl,
            command: tc.command
          })
        }
      }
    }
    return out
  }

  extractAsks(): HarkPendingAsk[] {
    const out: HarkPendingAsk[] = []
    for (const [id, raw] of this.asks.entries()) {
      const req = (raw['request'] ?? raw['userInputRequest'] ?? raw) as Record<string, unknown>
      const status = String(raw['status'] ?? 'pending')
      out.push({
        id,
        dispatchId: String(raw['dispatchId'] ?? '') || undefined,
        requestId: String(req['requestId'] ?? id) || undefined,
        displayHint: String(req['displayHint'] ?? '') || undefined,
        prompt: String(req['prompt'] ?? req['title'] ?? req['message'] ?? '') || undefined,
        domain: String(req['domain'] ?? '') || undefined,
        status,
        raw
      })
    }
    return out
  }

  extractArtifacts(): HarkConversationSnapshotSummary['artifacts'] {
    const out: HarkConversationSnapshotSummary['artifacts'] = []
    const seen = new Set<string>()
    for (const m of this.messages.values()) {
      for (const a of m.artifacts ?? []) {
        const key = a.s3Key || a.path
        if (!key || seen.has(key)) continue
        seen.add(key)
        out.push({
          name: a.name || a.path.split('/').pop() || a.path,
          path: a.path,
          s3Key: a.s3Key,
          downloadUrl: a.downloadUrl,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes
        })
      }
    }
    return out
  }
}

function formatPresentationMarkdown(presRaw: unknown): string {
  if (!presRaw || typeof presRaw !== 'object') return ''
  const pres = presRaw as Record<string, unknown>
  const kind = String(pres['kind'] ?? '')

  if (kind === 'summary' && pres['summary'] && typeof pres['summary'] === 'object') {
    const s = pres['summary'] as Record<string, unknown>
    const title = typeof s['title'] === 'string' && s['title'].trim() ? `### ${s['title'].trim()}\n\n` : ''
    const md = typeof s['markdown'] === 'string' ? s['markdown'].trim() : ''
    return md ? `${title}${md}` : ''
  }

  if (
    (kind === 'document' || kind === 'markdown' || kind === 'article' || kind === 'report') &&
    (pres[kind] || pres['document'] || pres['markdown'])
  ) {
    const d = (pres[kind] ?? pres['document'] ?? pres) as Record<string, unknown>
    const title = typeof d['title'] === 'string' && d['title'].trim() ? `# ${d['title'].trim()}\n\n` : ''
    const md =
      typeof d['markdown'] === 'string'
        ? d['markdown'].trim()
        : typeof d['content'] === 'string'
          ? d['content'].trim()
          : typeof d['body'] === 'string'
            ? d['body'].trim()
            : ''
    return md ? `${title}${md}` : ''
  }

  if (kind === 'code' && pres['code'] && typeof pres['code'] === 'object') {
    const c = pres['code'] as Record<string, unknown>
    const lang = typeof c['language'] === 'string' ? c['language'].trim() : ''
    const src = typeof c['source'] === 'string' ? c['source'] : ''
    return src ? `\`\`\`${lang}\n${src}\n\`\`\`` : ''
  }

  if (kind === 'text_template' && pres['text_template'] && typeof pres['text_template'] === 'object') {
    const t = pres['text_template'] as Record<string, unknown>
    const title = typeof t['title'] === 'string' && t['title'].trim() ? `**${t['title'].trim()}**\n\n` : ''
    const body = typeof t['body'] === 'string' ? t['body'].trim() : ''
    return body ? `${title}${body}` : ''
  }

  if (kind === 'links' && Array.isArray(pres['links'])) {
    const lines: string[] = []
    for (const item of pres['links'] as Array<Record<string, unknown>>) {
      if (!item || typeof item !== 'object') continue
      const url = typeof item['url'] === 'string' ? item['url'].trim() : ''
      if (!url) continue
      const label =
        (typeof item['title'] === 'string' && item['title'].trim()) ||
        (typeof item['label'] === 'string' && item['label'].trim()) ||
        url
      lines.push(`- [${label}](${url})`)
    }
    return lines.join('\n')
  }

  if (kind === 'table' && pres['table'] && typeof pres['table'] === 'object') {
    const tbl = pres['table'] as Record<string, unknown>
    const cols = Array.isArray(tbl['columns']) ? (tbl['columns'] as unknown[]).map((c) => String(c ?? '')) : []
    const rows = Array.isArray(tbl['rows']) ? (tbl['rows'] as unknown[][]) : []
    if (cols.length > 0) {
      const title = typeof tbl['title'] === 'string' && tbl['title'].trim() ? `### ${tbl['title'].trim()}\n\n` : ''
      const header = `| ${cols.join(' | ')} |`
      const sep = `| ${cols.map(() => '---').join(' | ')} |`
      const body = rows
        .map((r) => `| ${(Array.isArray(r) ? r : []).map((cell) => String(cell ?? '').replace(/\|/g, '\\|')).join(' | ')} |`)
        .join('\n')
      return `${title}${header}\n${sep}${body ? `\n${body}` : ''}`
    }
  }

  return ''
}

function normalizeSyncMessage(id: string, raw: Record<string, unknown>): HarkChatMessage {
  const rawContent =
    (typeof raw['content'] === 'string' && raw['content']) ||
    (typeof raw['text'] === 'string' && raw['text']) ||
    (typeof raw['message'] === 'string' && raw['message']) ||
    ''
  const presMarkdown = formatPresentationMarkdown(raw['presentation'])
  const content = rawContent.trim() ? rawContent : presMarkdown || rawContent

  const actionsRaw = Array.isArray(raw['actions']) ? (raw['actions'] as Record<string, unknown>[]) : []
  const actions = actionsRaw
    .map((a) => ({
      kind: String(a['kind'] ?? ''),
      connector: typeof a['connector'] === 'string' ? a['connector'] : undefined,
      label: String(a['label'] ?? a['connector'] ?? 'Connect'),
      scopes: typeof a['scopes'] === 'string' ? a['scopes'] : undefined
    }))
    .filter((a) => a.kind)

  const toolCallsRaw = Array.isArray(raw['toolCalls']) ? (raw['toolCalls'] as Record<string, unknown>[]) : []
  const toolCalls: NonNullable<HarkChatMessage['toolCalls']> = []
  const artifacts: NonNullable<HarkChatMessage['artifacts']> = []

  for (const tc of toolCallsRaw) {
    if (!tc || typeof tc !== 'object') continue
    const dispatchId = String(tc['dispatchId'] ?? tc['dispatch_id'] ?? '')
    const name = String(tc['toolName'] ?? tc['tool_name'] ?? tc['type'] ?? 'tool')
    const status = String(tc['status'] ?? 'completed')
    const input = (tc['input'] ?? {}) as Record<string, unknown>
    const progressMeta = ((tc['progress'] as Record<string, unknown> | undefined)?.['metadata'] ?? {}) as Record<
      string,
      unknown
    >
    toolCalls.push({
      dispatchId: dispatchId || `tc_${toolCalls.length}`,
      name,
      status,
      url: String(input['url'] ?? progressMeta['url'] ?? '') || undefined,
      screenshotKey: String(tc['screenshotKey'] ?? progressMeta['screenshot_key'] ?? '') || undefined,
      screenshotUrl: String(tc['screenshotUrl'] ?? progressMeta['screenshot_url'] ?? '') || undefined,
      command: String(input['command'] ?? progressMeta['command'] ?? '') || undefined,
      result: typeof tc['result'] === 'string' ? tc['result'].slice(0, 500) : undefined
    })

    const artKeys = Array.isArray(tc['artifactKeys']) ? (tc['artifactKeys'] as Record<string, unknown>[]) : []
    for (const ak of artKeys) {
      if (!ak || typeof ak !== 'object') continue
      const path = String(ak['path'] ?? '')
      if (!path) continue
      artifacts.push({
        name: path.split('/').pop() || path,
        path,
        s3Key: typeof ak['s3_key'] === 'string' ? ak['s3_key'] : undefined,
        downloadUrl: typeof ak['download_url'] === 'string' ? ak['download_url'] : undefined
      })
    }
  }

  // Also include message-level attachments / imageStack
  const attsRaw = Array.isArray(raw['attachments']) ? (raw['attachments'] as Record<string, unknown>[]) : []
  for (const att of attsRaw) {
    if (!att || typeof att !== 'object') continue
    const path = String(att['path'] ?? att['name'] ?? '')
    const s3Key = typeof att['s3Key'] === 'string' ? att['s3Key'] : typeof att['s3_key'] === 'string' ? att['s3_key'] : undefined
    if (!path && !s3Key) continue
    artifacts.push({
      name: String(att['name'] ?? path.split('/').pop() ?? 'file'),
      path: path || s3Key!,
      s3Key,
      downloadUrl: typeof att['downloadUrl'] === 'string' ? att['downloadUrl'] : typeof att['previewUrl'] === 'string' ? att['previewUrl'] : undefined,
      mimeType: typeof att['mediaType'] === 'string' ? att['mediaType'] : typeof att['media_type'] === 'string' ? att['media_type'] : undefined,
      sizeBytes: typeof att['size'] === 'number' ? att['size'] : undefined
    })
  }

  const aawRaw = Array.isArray(raw['agentActivityWindow']) ? (raw['agentActivityWindow'] as Record<string, unknown>[]) : []
  for (const p of aawRaw) {
    if (!p || typeof p !== 'object') continue
    const screenshot = (p['screenshot'] ?? {}) as Record<string, unknown>
    toolCalls.push({
      dispatchId: String(p['dispatchId'] ?? `aaw_${toolCalls.length}`),
      name: String(p['kind'] ?? 'browser'),
      status: String(p['status'] ?? 'completed'),
      url: typeof p['url'] === 'string' ? p['url'] : typeof p['liveViewUrl'] === 'string' ? p['liveViewUrl'] : undefined,
      screenshotKey: typeof screenshot['key'] === 'string' ? screenshot['key'] : undefined,
      screenshotUrl: typeof screenshot['downloadUrl'] === 'string' ? screenshot['downloadUrl'] : undefined,
      command: typeof p['command'] === 'string' ? p['command'] : undefined
    })
  }

  const jobStatus = typeof raw['jobStatus'] === 'string' ? raw['jobStatus'] : undefined
  const errorText = typeof raw['error'] === 'string' ? raw['error'] : undefined

  return {
    id,
    role: String(raw['role'] ?? raw['author'] ?? 'assistant'),
    content: content || (errorText ? `⚠️ ${errorText}` : ''),
    isStreaming: typeof raw['isStreaming'] === 'boolean' ? raw['isStreaming'] : undefined,
    ...(jobStatus ? { jobStatus } : {}),
    ...(errorText ? { error: errorText } : {}),
    thought: typeof raw['thought'] === 'string' ? raw['thought'] : undefined,
    narration: typeof raw['narration'] === 'string' ? raw['narration'] : undefined,
    createdAt: (raw['timestamp'] ?? raw['createdAt'] ?? raw['created_at'] ?? raw['createdAtMs'] ?? null) as
      | string
      | number
      | null,
    ...(toolCalls.length ? { toolCalls } : {}),
    ...(actions.length ? { actions } : {}),
    ...(artifacts.length ? { artifacts } : {})
  }
}

export function isHarkReplyDone(msg: HarkChatMessage): boolean {
  if (msg.isStreaming === true) {
    if (msg.jobStatus && /^(completed|cancelled|failed|interrupted|cost_capped)$/i.test(msg.jobStatus)) {
      return true
    }
    return false
  }
  const hasPayload =
    Boolean(msg.content.trim()) ||
    Boolean(msg.actions && msg.actions.length > 0) ||
    Boolean(msg.artifacts && msg.artifacts.length > 0) ||
    Boolean(msg.error) ||
    Boolean(
      msg.toolCalls &&
        msg.toolCalls.length > 0 &&
        msg.toolCalls.every((tc) => !/^(running|pending|active|started|waiting_for_input|awaiting_input)$/i.test(tc.status))
    )
  return hasPayload
}

const activeHarkWatches = new HarkWatchRegistry()

/** Stop every reply watch of the account (stop-tool, pause, sign-out). */
export function cancelHarkWatch(accountId: string): void {
  activeHarkWatches.cancelAll(accountId)
}

/**
 * Stream `/api/sync/conversation` SSE (or fallback `/api/sync/poll`) until the
 * assistant reply for `responseMessageId` (or any new assistant message) completes!
 */
export async function watchHarkConversationSync(
  accountId: string,
  conversationId: string,
  opts: {
    responseMessageId?: string
    afterMessageIds?: Set<string>
    timeoutMs?: number
    onUpdate?: (msg: HarkChatMessage, state: HarkConversationSyncState) => void
  } = {}
): Promise<{ reply: HarkChatMessage | null; messages: HarkChatMessage[] }> {
  const ses = sessionForAccount(accountId)
  const managerId = randomUUID()
  const timeoutMs = opts.timeoutMs ?? 90_000
  const deadline = Date.now() + timeoutMs
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  const syncState = new HarkConversationSyncState()
  const afterIds = opts.afterMessageIds ?? new Set<string>()
  let lastReply: HarkChatMessage | null = null
  let finished = false

  // Do not cancel an earlier send's watch: that cut its reply short.
  const abortWatch = () => {
    finished = true
    ac.abort()
  }
  const watchToken = activeHarkWatches.add(accountId, abortWatch, opts.responseMessageId)

  const hasPayloadOrActivity = (m?: HarkChatMessage): m is HarkChatMessage =>
    Boolean(
      m &&
        (m.content.trim() ||
          m.isStreaming ||
          m.thought ||
          m.narration ||
          m.toolCalls?.length ||
          m.actions?.length ||
          m.artifacts?.length ||
          m.error)
    )

  const checkState = (): boolean => {
    if (finished) return true
    const all = syncState.orderedMessages()
    const target = opts.responseMessageId ? syncState.messages.get(opts.responseMessageId) : undefined
    const claimed = activeHarkWatches.claimedByOthers(accountId, watchToken)
    const candidate =
      (hasPayloadOrActivity(target) ? target : undefined) ??
      [...all]
        .reverse()
        .find(
          (m) =>
            /assistant|bot|hark/i.test(m.role) &&
            !afterIds.has(m.id) &&
            !claimed.has(m.id) &&
            hasPayloadOrActivity(m)
        )

    if (candidate) {
      lastReply = candidate
      opts.onUpdate?.(candidate, syncState)
      if (isHarkReplyDone(candidate)) {
        finished = true
        ac.abort()
        return true
      }
    } else if (syncState.narration || syncState.activeActivity) {
      const dummyId = opts.responseMessageId || 'hark_thinking'
      opts.onUpdate?.(
        {
          id: dummyId,
          role: 'assistant',
          content: '',
          isStreaming: true
        },
        syncState
      )
    }
    return false
  }

  const runPollLoop = async (): Promise<void> => {
    let cursor: string | undefined
    let floor: string | undefined
    let first = true
    const pollMgr = randomUUID()
    while (Date.now() < deadline && !ac.signal.aborted && !finished) {
      try {
        const pollRes = (await harkFetch(ses, '/sync/poll', {
          method: 'GET',
          query: {
            conversationId,
            v: '2',
            manager: pollMgr,
            mode: 'in_tab',
            dial: 'initial',
            ...(first ? { first: '1' } : {}),
            ...(cursor ? { cursor } : {}),
            ...(floor ? { floor } : {})
          },
          signal: ac.signal
        })) as { frames?: string[]; cursor?: string; floor?: string } | null
        if (pollRes && Array.isArray(pollRes.frames)) {
          first = false
          if (pollRes.cursor) cursor = pollRes.cursor
          if (pollRes.floor) floor = pollRes.floor
          for (const frame of pollRes.frames) {
            if (syncState.applyFrame(frame) && checkState()) {
              return
            }
          }
        }
      } catch {
        /* ignore transient poll error */
      }
      if (finished || ac.signal.aborted) return
      await new Promise((r) => setTimeout(r, 1200))
    }
  }

  const runSseStream = async (): Promise<void> => {
    let dialMode = 'initial'
    while (Date.now() < deadline && !ac.signal.aborted && !finished) {
      try {
        const sseUrl = new URL(`${HARK_API_BASE}/sync/conversation`)
        sseUrl.searchParams.set('conversationId', conversationId)
        sseUrl.searchParams.set('v', '2')
        sseUrl.searchParams.set('manager', managerId)
        sseUrl.searchParams.set('mode', 'in_tab')
        sseUrl.searchParams.set('ids', '1')
        sseUrl.searchParams.set('beat', '5')
        sseUrl.searchParams.set('dial', dialMode)
        dialMode = 'reconnect'

        const res = await ses.fetch(sseUrl.toString(), {
          method: 'GET',
          headers: harkClientHeaders({
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache'
          }),
          signal: ac.signal
        })

        if (res.ok && res.body && res.headers.get('content-type')?.includes('text/event-stream')) {
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buf = ''
          let dataLines: string[] = []
          let eventType = 'message'

          try {
            while (Date.now() < deadline && !ac.signal.aborted && !finished) {
              const { done, value } = await reader.read()
              if (done) break
              buf += decoder.decode(value, { stream: true })
              let nl: number
              while ((nl = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, nl).replace(/\r$/, '')
                buf = buf.slice(nl + 1)
                if (line === '') {
                  if (dataLines.length > 0) {
                    const payload = dataLines.join('\n')
                    dataLines = []
                    if (eventType === 'message' && syncState.applyFrame(payload)) {
                      if (checkState()) {
                        return
                      }
                    }
                    eventType = 'message'
                  }
                } else if (line.startsWith('event:')) {
                  eventType = line.slice(6).trim()
                } else if (line.startsWith('data:')) {
                  dataLines.push(line.slice(5).trimStart())
                }
              }
            }
          } finally {
            try {
              reader.releaseLock()
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* aborted or transient disconnect — retry below if still active */
      }
      if (finished || ac.signal.aborted) return
      await new Promise((r) => setTimeout(r, 1200))
    }
  }

  try {
    await Promise.race([runSseStream(), runPollLoop()])
  } finally {
    finished = true
    ac.abort()
    clearTimeout(timer)
    activeHarkWatches.remove(accountId, watchToken)
  }

  return { reply: lastReply, messages: syncState.orderedMessages() }
}

export function conversationIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const root = payload as Record<string, unknown>
  for (const key of ['id', 'conversationId', 'conversation_id'] as const) {
    const v = root[key]
    if (typeof v === 'string' && v) return v
  }
  const conv = root['conversation']
  if (conv && typeof conv === 'object') {
    const id = (conv as { id?: unknown }).id
    if (typeof id === 'string' && id) return id
  }
  const main = root['main']
  if (main && typeof main === 'object') {
    const id = (main as { id?: unknown }).id
    if (typeof id === 'string' && id) return id
  }
  return undefined
}

export function extractMessages(payload: unknown): HarkChatMessage[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>
  let list: unknown[] = []
  if (Array.isArray(root['messages'])) list = root['messages'] as unknown[]
  else if (Array.isArray(root['items'])) list = root['items'] as unknown[]
  else if (root['conversation'] && typeof root['conversation'] === 'object') {
    const msgs = (root['conversation'] as { messages?: unknown }).messages
    if (Array.isArray(msgs)) list = msgs
  }
  const out: HarkChatMessage[] = []
  for (const item of list) {
    const raw = (item ?? {}) as Record<string, unknown>
    const content =
      (typeof raw['content'] === 'string' && raw['content']) ||
      (typeof raw['text'] === 'string' && raw['text']) ||
      (typeof raw['message'] === 'string' && raw['message']) ||
      ''
    out.push({
      id: String(raw['id'] ?? raw['messageId'] ?? raw['message_id'] ?? `${out.length}`),
      role: String(raw['role'] ?? raw['author'] ?? ''),
      content,
      isStreaming: typeof raw['isStreaming'] === 'boolean' ? raw['isStreaming'] : undefined,
      createdAt: (raw['timestamp'] ?? raw['createdAt'] ?? raw['created_at'] ?? raw['createdAtMs'] ?? null) as
        | string
        | number
        | null
    })
  }
  return out
}
