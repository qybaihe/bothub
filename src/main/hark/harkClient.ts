/**
 * Hark Go REST client bound to an Electron session partition.
 *
 * Uses session.fetch so cookies stay in the partition jar (credentials:include).
 * Never logs cookie values or tokens.
 */

import { session as electronSession, type Session } from 'electron'
import { partitionForAccount } from '../webContentsViewManager'

export const HARK_ORIGIN = 'https://app.hark.com'
export const HARK_API_BASE = `${HARK_ORIGIN}/api`
export const HARK_LOGIN_URL = `${HARK_ORIGIN}/login`

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

  const headers: Record<string, string> = {
    'X-Hark-Locale': localeHeader(),
    Accept: 'application/json'
  }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await ses.fetch(url.toString(), {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal
  })

  const text = await response.text()
  if (!response.ok) throw new HarkApiError(response.status, text || response.statusText)
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
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
} {
  const user = session && typeof session === 'object' ? session.user : null
  if (!user || typeof user !== 'object') return {}
  const email = typeof user.email === 'string' ? user.email : undefined
  const name = typeof user.name === 'string' ? user.name : undefined
  return { handle: email ?? name, displayName: name ?? email }
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

/**
 * Send a chat message. Body text field name is confirmed against live netlog;
 * try `text` then common aliases if the API returns a validation error.
 */
export async function sendMessage(
  accountId: string,
  conversationId: string,
  text: string,
  timezone = timezoneName()
): Promise<{ result: unknown; bodyKeys: string[] }> {
  const ses = sessionForAccount(accountId)
  const base = { timezone, conversationId }
  const candidates: Array<Record<string, unknown>> = [
    { ...base, text },
    { ...base, content: text },
    { ...base, message: text },
    { ...base, userMessage: text }
  ]

  let lastError: unknown
  for (const body of candidates) {
    try {
      const result = await harkFetch(ses, '/messages/send', {
        method: 'POST',
        query: { cid: conversationId },
        body
      })
      return { result, bodyKeys: Object.keys(body) }
    } catch (error) {
      lastError = error
      if (error instanceof HarkApiError && (error.status === 400 || error.status === 422)) {
        continue
      }
      throw error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Hark send failed')
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

export type HarkChatMessage = {
  id: string
  role: string
  content: string
  createdAt?: string | number | null
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
      createdAt: (raw['createdAt'] ?? raw['created_at'] ?? raw['createdAtMs'] ?? null) as
        | string
        | number
        | null
    })
  }
  return out
}
