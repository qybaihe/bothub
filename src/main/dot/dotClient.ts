import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import WebSocket from 'ws'
import { proxyFetch, proxyWsAgent } from '../proxyTransport'
import { readJsonFile } from '../jsonFile'
import { requireValidProxyUrl } from '../proxyUrl'
import type {
  DotAuthStatus,
  MuseMediaPartView,
  MuseRichWidgetView,
  MuseToolCallView
} from '@shared/ipc'

export const DOT_ORIGIN = 'https://chatgpt.com'
export const DOT_API_BASE = 'https://chatgpt.com/backend-api'
export const DOT_OAUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token'
export const DOT_CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const DOT_APP_SERVER_WS_URL = 'wss://codex-cloud-backend.chatgpt.com/'

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

export class DotApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'DotApiError'
    this.status = status
    this.body = body
  }
}

export interface DotStoredAccount {
  accountId: string
  accessToken: string
  refreshToken?: string
  clientId?: string
  deviceId?: string
  chatgptAccountId: string
  chatgptUserId?: string
  email?: string
  displayName?: string
  planType?: string
  expiresAtMs?: number
  proxyUrl?: string
  activeDotId?: string
  roomId?: string
  threadId?: string
  botId?: string
  mode?: 'dot' | 'native'
  model?: string
  effort?: string
  updatedAtMs: number
}

export interface DotProfile {
  id: string
  displayName: string
  avatarType?: string | null
  avatarUrl?: string | null
  color?: string | null
  aeonKind?: string
  isPrimary?: boolean
  scope?: string
  messagingRoomId: string
  activeRootThreadId: string
  status: string
  isPaused?: boolean
  lastCheckInAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface DotRoomAttachment {
  attachmentId: string
  type: string
  fileId?: string
  name?: string
  mimeType?: string
  downloadUrl?: string
}

export interface DotRoomMessage {
  id: string
  roomId: string
  role: 'user' | 'bot'
  accountUserId: string
  text: string
  createdAtMs: number
  turnTrigger?: string
  threadTurnId?: string
  attachments?: DotRoomAttachment[]
}

export type DotRealtimeCallback = (
  event:
    | {
        type: 'message'
        accountId: string
        botId?: string
        dotId?: string
        roomId: string
        message: DotRoomMessage
        done: boolean
      }
    | {
        type: 'activity'
        accountId: string
        botId?: string
        dotId?: string
        roomId: string
        code: string
        text?: string
        busy: boolean
      }
) => void

const realtimeListeners = new Set<DotRealtimeCallback>()

export function onDotRealtimeEvent(cb: DotRealtimeCallback): () => void {
  realtimeListeners.add(cb)
  return () => realtimeListeners.delete(cb)
}

function emitRealtime(event: Parameters<DotRealtimeCallback>[0]): void {
  for (const cb of realtimeListeners) {
    try {
      cb(event)
    } catch (err) {
      console.error('[dot] realtime listener failed', err)
    }
  }
}

function resolveStorePath(): string {
  try {
    // Allow running in both Electron main process and standalone Node tests
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as typeof import('electron')
    if (electron?.app?.getPath) {
      return join(electron.app.getPath('userData'), 'dot-accounts.json')
    }
  } catch {
    /* standalone node */
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'bothub', 'dot-accounts.json')
  }
  return join(homedir(), '.bothub', 'dot-accounts.json')
}

const accountStore = new Map<string, DotStoredAccount>()
/**
 * Entries whose tokens could not be decrypted right now (Keychain denied,
 * safeStorage not ready). They are written back untouched; dropping them
 * made the next save delete those accounts for good.
 */
const unreadableEntries = new Map<string, PersistedDotAccount>()
let storeLoaded = false

interface PersistedDotAccount extends Omit<DotStoredAccount, 'accessToken' | 'refreshToken'> {
  accessToken?: string
  refreshToken?: string
  encTokens?: string
}

function getSafeStorage(): typeof import('electron').safeStorage | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as typeof import('electron')
    if (electron?.safeStorage?.isEncryptionAvailable?.()) {
      return electron.safeStorage
    }
  } catch {
    /* standalone node */
  }
  return null
}

function ensureStoreLoaded(): void {
  if (storeLoaded && accountStore.size > 0) return
  storeLoaded = true
  try {
    const file = resolveStorePath()
    if (!existsSync(file)) return
    // Corrupt → moved aside (not silently replaced by the next save).
    const parsed = readJsonFile<Record<string, unknown> | null>(file, null, (r) => Boolean(r) && typeof r === 'object')
    if (!parsed) return
    const raw = (
      parsed &&
      typeof parsed === 'object' &&
      parsed['accounts'] &&
      typeof parsed['accounts'] === 'object' &&
      !('accessToken' in (parsed['accounts'] as Record<string, unknown>)) &&
      !('encTokens' in (parsed['accounts'] as Record<string, unknown>))
        ? (parsed['accounts'] as Record<string, PersistedDotAccount>)
        : (parsed as unknown as Record<string, PersistedDotAccount>)
    )
    if (raw && typeof raw === 'object') {
      const ss = getSafeStorage()
      let migratedPlaintext = false
      for (const [k, v] of Object.entries(raw)) {
        if (!v || typeof v !== 'object') continue
        let accessToken = typeof v.accessToken === 'string' ? v.accessToken : ''
        let refreshToken = typeof v.refreshToken === 'string' ? v.refreshToken : undefined
        if (typeof v.encTokens === 'string' && v.encTokens) {
          if (!ss) {
            unreadableEntries.set(k, v)
            continue
          }
          try {
            const dec = JSON.parse(
              ss.decryptString(Buffer.from(v.encTokens, 'base64'))
            ) as { accessToken?: string; refreshToken?: string }
            if (typeof dec.accessToken === 'string') accessToken = dec.accessToken
            if (typeof dec.refreshToken === 'string') refreshToken = dec.refreshToken
          } catch {
            unreadableEntries.set(k, v)
            continue
          }
        } else if (accessToken && ss) {
          migratedPlaintext = true
        }
        if (accessToken) {
          const { encTokens: _enc, ...rest } = v
          accountStore.set(k, {
            ...rest,
            accessToken,
            ...(refreshToken ? { refreshToken } : {})
          })
        }
      }
      if (migratedPlaintext) {
        saveStore()
      }
    }
  } catch (err) {
    console.warn('[dot] failed to read dot-accounts.json', err)
  }
}

function saveStore(): void {
  try {
    const file = resolveStorePath()
    mkdirSync(dirname(file), { recursive: true })
    const ss = getSafeStorage()
    const out: Record<string, PersistedDotAccount> = {}
    for (const [k, v] of unreadableEntries.entries()) {
      if (!accountStore.has(k)) out[k] = v
    }
    for (const [k, v] of accountStore.entries()) {
      const { accessToken, refreshToken, ...metadata } = v
      if (ss) {
        const encTokens = ss
          .encryptString(JSON.stringify({ accessToken, refreshToken }))
          .toString('base64')
        out[k] = {
          ...metadata,
          encTokens
        }
      } else {
        out[k] = {
          ...metadata,
          accessToken,
          ...(refreshToken ? { refreshToken } : {})
        }
      }
    }
    // Temp file + rename: a crash mid-write must not truncate every account.
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(out, null, 2), { encoding: 'utf8', mode: 0o600 })
    chmodSync(tmp, 0o600)
    renameSync(tmp, file)
  } catch (err) {
    console.warn('[dot] failed to write dot-accounts.json', err)
  }
}

export interface DecodedChatGptJwt {
  chatgptAccountId?: string
  chatgptUserId?: string
  planType?: string
  email?: string
  displayName?: string
  clientId?: string
  expiresAtMs?: number
}

export function decodeChatGptJwt(token: string): DecodedChatGptJwt {
  try {
    const parts = token.trim().split('.')
    if (parts.length < 2 || !parts[1]) return {}
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    const authClaim =
      payload['https://api.openai.com/auth'] &&
      typeof payload['https://api.openai.com/auth'] === 'object'
        ? (payload['https://api.openai.com/auth'] as Record<string, unknown>)
        : {}
    const profileClaim =
      payload['https://api.openai.com/profile'] &&
      typeof payload['https://api.openai.com/profile'] === 'object'
        ? (payload['https://api.openai.com/profile'] as Record<string, unknown>)
        : {}
    const exp = typeof payload['exp'] === 'number' ? payload['exp'] * 1000 : undefined
    return {
      chatgptAccountId:
        typeof authClaim['chatgpt_account_id'] === 'string'
          ? authClaim['chatgpt_account_id']
          : undefined,
      chatgptUserId:
        typeof authClaim['chatgpt_user_id'] === 'string'
          ? authClaim['chatgpt_user_id']
          : typeof authClaim['user_id'] === 'string'
            ? authClaim['user_id']
            : undefined,
      planType:
        typeof authClaim['chatgpt_plan_type'] === 'string'
          ? authClaim['chatgpt_plan_type']
          : undefined,
      email: typeof profileClaim['email'] === 'string' ? profileClaim['email'] : undefined,
      displayName:
        typeof profileClaim['name'] === 'string'
          ? profileClaim['name']
          : typeof profileClaim['email'] === 'string'
            ? profileClaim['email'].split('@')[0]
            : undefined,
      clientId: typeof payload['client_id'] === 'string' ? payload['client_id'] : undefined,
      expiresAtMs: exp
    }
  } catch {
    return {}
  }
}

export function getStoredDotAccount(accountId: string): DotStoredAccount | undefined {
  ensureStoreLoaded()
  return accountStore.get(accountId)
}

export function patchStoredDotAccount(
  accountId: string,
  patch: Partial<DotStoredAccount>
): DotStoredAccount | undefined {
  ensureStoreLoaded()
  const prev = accountStore.get(accountId)
  if (!prev) return undefined
  const next: DotStoredAccount = {
    ...prev,
    ...patch,
    accountId,
    updatedAtMs: Date.now()
  }
  accountStore.set(accountId, next)
  saveStore()
  return next
}

export function clearStoredDotAccount(accountId: string): void {
  ensureStoreLoaded()
  cancelWatchDotRoomReply(accountId)
  closeCelsiusWatcher(accountId)
  accountStore.delete(accountId)
  unreadableEntries.delete(accountId)
  saveStore()
}

export function clearAllStoredDotAccounts(): void {
  ensureStoreLoaded()
  for (const id of accountStore.keys()) {
    cancelWatchDotRoomReply(id)
    closeCelsiusWatcher(id)
  }
  accountStore.clear()
  unreadableEntries.clear()
  saveStore()
}

export function listStoredDotAccounts(): DotStoredAccount[] {
  ensureStoreLoaded()
  return [...accountStore.values()].filter((a) => Boolean(a?.accessToken))
}

export function upsertDotCredentials(
  accountId: string,
  input: {
    accessToken: string
    refreshToken?: string
    clientId?: string
    chatgptAccountId?: string
    email?: string
    displayName?: string
    planType?: string
    proxyUrl?: string
  }
): DotStoredAccount {
  ensureStoreLoaded()
  const prev = accountStore.get(accountId)
  const decoded = decodeChatGptJwt(input.accessToken)
  const chatgptAccountId =
    input.chatgptAccountId?.trim() ||
    decoded.chatgptAccountId ||
    prev?.chatgptAccountId ||
    ''
  const email = input.email?.trim() || decoded.email || prev?.email
  const displayName =
    input.displayName?.trim() ||
    decoded.displayName ||
    (email ? email.split('@')[0] : undefined) ||
    prev?.displayName ||
    'Dot'
  const planType = input.planType?.trim() || decoded.planType || prev?.planType
  const next: DotStoredAccount = {
    accountId,
    accessToken: input.accessToken.trim(),
    refreshToken: input.refreshToken?.trim() || prev?.refreshToken,
    clientId: input.clientId?.trim() || decoded.clientId || prev?.clientId || DOT_CODEX_CLIENT_ID,
    deviceId: prev?.deviceId || randomUUID(),
    chatgptAccountId,
    chatgptUserId: decoded.chatgptUserId || prev?.chatgptUserId,
    email,
    displayName,
    planType,
    expiresAtMs: decoded.expiresAtMs || prev?.expiresAtMs,
    proxyUrl: requireValidProxyUrl(input.proxyUrl) ?? prev?.proxyUrl,
    activeDotId: prev?.activeDotId,
    roomId: prev?.roomId,
    threadId: prev?.threadId,
    botId: prev?.botId,
    mode: 'dot',
    model: prev?.model ?? 'gpt-6-astra',
    effort: prev?.effort ?? 'medium',
    updatedAtMs: Date.now()
  }
  accountStore.set(accountId, next)
  saveStore()
  return next
}

async function exchangeDotRefreshToken(
  refreshToken: string,
  clientId?: string,
  proxyUrl?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await proxyFetch(proxyUrl, DOT_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': CHROME_UA
    },
    body: JSON.stringify({
      client_id: clientId || DOT_CODEX_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'openid profile email'
    })
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new DotApiError(
      res.status,
      `OAuth refresh_token exchange failed (${res.status}): ${text.slice(0, 180)}`
    )
  }

  const tokenData = (await res.json()) as {
    access_token?: string
    refresh_token?: string
  }
  if (!tokenData.access_token) {
    throw new DotApiError(500, 'OAuth refresh response missing access_token')
  }

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || refreshToken
  }
}

/**
 * Parse user credential input:
 * - Raw ChatGPT/Codex JWT `access_token` (`eyJ...` or `Bearer eyJ...`)
 * - Raw OAuth `refresh_token` (`rt_...` or non-JWT token string) — automatically exchanged for `access_token`
 * - JSON credential object (`auth.json`, `{ access_token, refresh_token }`, `{ refresh_token }`, or `/api/auth/session`)
 */
export async function importDotCredentialsFromRaw(
  accountId: string,
  rawInput: string,
  extra?: { refreshToken?: string; chatgptAccountId?: string; proxyUrl?: string }
): Promise<DotStoredAccount> {
  const trimmed = (rawInput ?? '').trim()
  const extraRt = extra?.refreshToken?.trim()

  if (!trimmed && !extraRt) {
    throw new DotApiError(400, 'Empty credential input (provide access_token, refresh_token, or JSON)')
  }

  // Case 0: Only refreshToken was provided in extra (or rawInput is empty)
  if (!trimmed && extraRt) {
    const exchanged = await exchangeDotRefreshToken(extraRt, undefined, extra?.proxyUrl)
    return upsertDotCredentials(accountId, {
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      chatgptAccountId: extra?.chatgptAccountId,
      proxyUrl: extra?.proxyUrl
    })
  }

  // Case 1: Raw JWT access_token
  if (trimmed.startsWith('eyJ') && !trimmed.includes('{')) {
    let at = trimmed
    let rt = extraRt
    const decoded = decodeChatGptJwt(at)
    if (rt && decoded.expiresAtMs && decoded.expiresAtMs < Date.now() + 60_000) {
      try {
        const exchanged = await exchangeDotRefreshToken(rt, decoded.clientId, extra?.proxyUrl)
        at = exchanged.accessToken
        rt = exchanged.refreshToken
      } catch {
        /* use provided access_token if refresh fails */
      }
    }
    return upsertDotCredentials(accountId, {
      accessToken: at,
      refreshToken: rt,
      chatgptAccountId: extra?.chatgptAccountId,
      proxyUrl: extra?.proxyUrl
    })
  }

  // Case 2: JSON object or array, OR raw refresh_token / Bearer token
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // Check if it contains a Bearer JWT access_token
    const m = trimmed.match(/(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/)
    if (m?.[1]) {
      return upsertDotCredentials(accountId, {
        accessToken: m[1],
        refreshToken: extraRt,
        chatgptAccountId: extra?.chatgptAccountId,
        proxyUrl: extra?.proxyUrl
      })
    }
    // Otherwise treat single-line non-JSON string as an OAuth refresh_token (e.g. rt_...)
    const rtCandidate = trimmed.replace(/^Bearer\s+/i, '').trim()
    if (rtCandidate.length >= 16 && !/\s/.test(rtCandidate)) {
      const exchanged = await exchangeDotRefreshToken(rtCandidate, undefined, extra?.proxyUrl)
      return upsertDotCredentials(accountId, {
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        chatgptAccountId: extra?.chatgptAccountId,
        proxyUrl: extra?.proxyUrl
      })
    }
    throw new DotApiError(400, 'Invalid credential format: paste access_token (eyJ...), refresh_token (rt_...), or JSON')
  }

  const pickRecord = (item: unknown): Record<string, unknown> | null => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const obj = item as Record<string, unknown>
    if (obj['tokens'] && typeof obj['tokens'] === 'object') {
      return obj['tokens'] as Record<string, unknown>
    }
    if (
      typeof obj['access_token'] === 'string' ||
      typeof obj['accessToken'] === 'string' ||
      typeof obj['refresh_token'] === 'string' ||
      typeof obj['refreshToken'] === 'string'
    ) {
      return obj
    }
    return null
  }

  let rec: Record<string, unknown> | null = null
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const r = pickRecord(item)
      if (r) {
        rec = r
        break
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    const root = parsed as Record<string, unknown>
    if (Array.isArray(root['accounts'])) {
      for (const item of root['accounts']) {
        const r = pickRecord(item)
        if (r) {
          rec = r
          break
        }
      }
    } else {
      rec = pickRecord(root)
    }
  }

  if (!rec) {
    throw new DotApiError(400, 'No access_token or refresh_token found in JSON')
  }

  let accessToken = String(rec['access_token'] ?? rec['accessToken'] ?? '').trim()
  let refreshToken =
    extraRt ||
    (typeof rec['refresh_token'] === 'string' ? rec['refresh_token'].trim() : undefined) ||
    (typeof rec['refreshToken'] === 'string' ? rec['refreshToken'].trim() : undefined)
  const clientId = typeof rec['client_id'] === 'string' ? rec['client_id'] : undefined

  const decoded = accessToken ? decodeChatGptJwt(accessToken) : {}
  const isExpired = Boolean(decoded.expiresAtMs && decoded.expiresAtMs < Date.now() + 60_000)

  if ((!accessToken || isExpired) && refreshToken) {
    const exchanged = await exchangeDotRefreshToken(refreshToken, clientId || decoded.clientId, extra?.proxyUrl)
    accessToken = exchanged.accessToken
    refreshToken = exchanged.refreshToken
  }

  if (!accessToken) {
    throw new DotApiError(400, 'No valid access_token or refresh_token found')
  }

  const userObj =
    rec['user'] && typeof rec['user'] === 'object' ? (rec['user'] as Record<string, unknown>) : {}
  const accObj =
    rec['account'] && typeof rec['account'] === 'object'
      ? (rec['account'] as Record<string, unknown>)
      : {}

  const chatgptAccountId =
    extra?.chatgptAccountId ||
    (typeof rec['account_id'] === 'string' ? rec['account_id'] : undefined) ||
    (typeof rec['chatgpt_account_id'] === 'string' ? rec['chatgpt_account_id'] : undefined) ||
    (typeof accObj['id'] === 'string' ? accObj['id'] : undefined)
  const email =
    (typeof rec['email'] === 'string' ? rec['email'] : undefined) ||
    (typeof userObj['email'] === 'string' ? userObj['email'] : undefined)
  const displayName =
    (typeof rec['displayName'] === 'string' ? rec['displayName'] : undefined) ||
    (typeof userObj['name'] === 'string' ? userObj['name'] : undefined)
  const planType =
    (typeof rec['plan_type'] === 'string' ? rec['plan_type'] : undefined) ||
    (typeof accObj['planType'] === 'string' ? accObj['planType'] : undefined)
  const proxyUrl =
    extra?.proxyUrl || (typeof rec['proxy_url'] === 'string' ? rec['proxy_url'] : undefined)

  return upsertDotCredentials(accountId, {
    accessToken,
    refreshToken,
    clientId,
    chatgptAccountId,
    email,
    displayName,
    planType,
    proxyUrl
  })
}

/**
 * Refresh access_token using refresh_token via `POST https://auth.openai.com/oauth/token`.
 */
export async function refreshDotAccessToken(accountId: string): Promise<DotStoredAccount> {
  ensureStoreLoaded()
  const acc = accountStore.get(accountId)
  if (!acc?.refreshToken) {
    throw new DotApiError(401, 'No refresh_token available for Dot account')
  }

  const exchanged = await exchangeDotRefreshToken(acc.refreshToken, acc.clientId, acc.proxyUrl)

  return upsertDotCredentials(accountId, {
    accessToken: exchanged.accessToken,
    refreshToken: exchanged.refreshToken,
    clientId: acc.clientId,
    chatgptAccountId: acc.chatgptAccountId,
    email: acc.email,
    displayName: acc.displayName,
    planType: acc.planType,
    proxyUrl: acc.proxyUrl
  })
}

/**
 * Try to extract a ChatGPT web session from the Electron partition `persist:bothub-account-${accountId}`
 * if the user signed in via the interactive login window.
 */
export async function trySyncFromElectronPartition(
  accountId: string
): Promise<DotStoredAccount | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as typeof import('electron')
    if (!electron?.session?.fromPartition) return undefined
    const ses = electron.session.fromPartition(`persist:bothub-account-${accountId}`)
    const res = await ses.fetch('https://chatgpt.com/api/auth/session', {
      headers: {
        Accept: 'application/json',
        'User-Agent': CHROME_UA
      }
    })
    if (!res.ok) return undefined
    const data = (await res.json()) as Record<string, unknown>
    const accessToken = typeof data['accessToken'] === 'string' ? data['accessToken'] : ''
    if (!accessToken) return undefined
    const userObj =
      data['user'] && typeof data['user'] === 'object'
        ? (data['user'] as Record<string, unknown>)
        : {}
    const accObj =
      data['account'] && typeof data['account'] === 'object'
        ? (data['account'] as Record<string, unknown>)
        : {}
    return upsertDotCredentials(accountId, {
      accessToken,
      chatgptAccountId: typeof accObj['id'] === 'string' ? accObj['id'] : undefined,
      email: typeof userObj['email'] === 'string' ? userObj['email'] : undefined,
      displayName: typeof userObj['name'] === 'string' ? userObj['name'] : undefined,
      planType: typeof accObj['planType'] === 'string' ? accObj['planType'] : undefined
    })
  } catch {
    return undefined
  }
}

export async function ensureValidDotAccount(accountId: string): Promise<DotStoredAccount> {
  ensureStoreLoaded()
  let acc = accountStore.get(accountId)
  if (!acc) {
    acc = await trySyncFromElectronPartition(accountId)
  }
  if (!acc || !acc.accessToken) {
    throw new DotApiError(401, 'Not signed in to Dot (import token or sign in first)')
  }
  // Refresh proactively if expiring within 5 minutes
  if (acc.expiresAtMs && acc.expiresAtMs < Date.now() + 5 * 60_000 && acc.refreshToken) {
    try {
      acc = await refreshDotAccessToken(accountId)
    } catch (err) {
      console.warn('[dot] proactive token refresh failed, continuing with current token', err)
    }
  }
  return acc
}

export async function getDotAuthStatus(accountId: string): Promise<DotAuthStatus> {
  ensureStoreLoaded()
  let acc = accountStore.get(accountId)
  if (!acc) {
    acc = await trySyncFromElectronPartition(accountId)
  }
  if (!acc || !acc.accessToken) {
    return { accountId, signedIn: false }
  }
  return {
    accountId,
    signedIn: true,
    handle: acc.email || acc.chatgptAccountId || accountId,
    displayName: acc.displayName || acc.email?.split('@')[0] || 'Dot',
    planType: acc.planType,
    chatgptAccountId: acc.chatgptAccountId,
    activeDotId: acc.activeDotId,
    roomId: acc.roomId,
    threadId: acc.threadId,
    mode: acc.mode ?? 'dot',
    model: acc.model ?? 'gpt-6-astra',
    effort: acc.effort ?? 'medium',
    hasRefreshToken: Boolean(acc.refreshToken),
    expiresAtMs: acc.expiresAtMs,
    updatedAt: acc.updatedAtMs,
    hasProxy: Boolean(acc.proxyUrl)
  }
}

export interface DotApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path: string
  query?: Record<string, string | undefined>
  body?: unknown
  headers?: Record<string, string>
}

function dotClientHeaders(
  cred: DotStoredAccount,
  extra?: Record<string, string>
): Record<string, string> {
  return {
    Authorization: `Bearer ${cred.accessToken}`,
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
    Origin: DOT_ORIGIN,
    Referer: `${DOT_ORIGIN}/dots`,
    'User-Agent': CHROME_UA,
    'OAI-Device-Id': cred.deviceId || '00000000-0000-4000-8000-000000000001',
    'OAI-Language': 'en-US',
    'OAI-Client-Version': 'prod-a8f4c92d1e4b8c3a9f0e2d1b',
    'Sec-Ch-Ua': '"Chromium";v="147", "Google Chrome";v="147", "Not.A/Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    ...(cred.chatgptAccountId ? { 'chatgpt-account-id': cred.chatgptAccountId } : {}),
    ...(extra ?? {})
  }
}

export async function callDotApi<T = unknown>(
  accountId: string,
  opts: DotApiRequestOptions
): Promise<T> {
  let acc = await ensureValidDotAccount(accountId)
  if (!acc.deviceId) {
    acc.deviceId = randomUUID()
    saveStore()
  }
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET')
  const relPath = opts.path.startsWith('/') ? opts.path : `/${opts.path}`
  const url = new URL(`${DOT_API_BASE}${relPath}`)
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v)
    }
  }

  const doFetch = async (cred: DotStoredAccount): Promise<Response> => {
    const headers = dotClientHeaders(cred, opts.headers)
    let bodyPayload: string | undefined
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json'
      bodyPayload = JSON.stringify(opts.body)
    }
    return proxyFetch(cred.proxyUrl, url.toString(), {
      method,
      headers,
      body: bodyPayload,
      signal: AbortSignal.timeout(30_000)
    })
  }

  const maxAttempts = method === 'GET' ? 3 : 2
  let res: Response | undefined
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * attempt))
    }
    try {
      res = await doFetch(acc)
      if (res.status === 401 && acc.refreshToken) {
        acc = await refreshDotAccessToken(accountId)
        res = await doFetch(acc)
      }
      if (
        (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) &&
        attempt + 1 < maxAttempts
      ) {
        continue
      }
      break
    } catch (err) {
      lastErr = err
      if (attempt + 1 >= maxAttempts) throw err
    }
  }
  if (!res) {
    throw lastErr instanceof Error ? lastErr : new DotApiError(0, 'Dot API network error')
  }

  const text = await res.text()
  let parsed: unknown = text
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    const detail =
      parsed && typeof parsed === 'object' && 'detail' in (parsed as Record<string, unknown>)
        ? JSON.stringify((parsed as Record<string, unknown>)['detail'])
        : typeof parsed === 'string'
          ? parsed.slice(0, 200)
          : `HTTP ${res.status}`
    throw new DotApiError(res.status, `Dot API ${method} ${relPath} failed (${res.status}): ${detail}`, parsed)
  }

  return parsed as T
}

function normalizeDotProfile(raw: Record<string, unknown>): DotProfile {
  const preview =
    raw['messaging_room_preview'] && typeof raw['messaging_room_preview'] === 'object'
      ? (raw['messaging_room_preview'] as Record<string, unknown>)
      : {}
  const rawName = String(
    raw['display_name'] || raw['displayName'] || preview['name'] || 'Dot'
  ).trim()
  return {
    id: String(raw['id'] ?? ''),
    displayName: rawName || 'Dot',
    avatarType: typeof raw['avatar_type'] === 'string' ? raw['avatar_type'] : null,
    avatarUrl: typeof raw['avatar_url'] === 'string' ? raw['avatar_url'] : null,
    color: typeof raw['color'] === 'string' ? raw['color'] : null,
    aeonKind: typeof raw['aeon_kind'] === 'string' ? raw['aeon_kind'] : 'orbit',
    isPrimary: Boolean(raw['is_primary']),
    scope: typeof raw['scope'] === 'string' ? raw['scope'] : 'private',
    messagingRoomId: String(raw['messaging_room_id'] ?? raw['messagingRoomId'] ?? ''),
    activeRootThreadId: String(raw['active_root_thread_id'] ?? raw['activeRootThreadId'] ?? ''),
    status: String(raw['status'] ?? 'active'),
    isPaused: Boolean(raw['is_paused']),
    lastCheckInAt: typeof raw['last_check_in_at'] === 'string' ? raw['last_check_in_at'] : null,
    createdAt: typeof raw['created_at'] === 'string' ? raw['created_at'] : undefined,
    updatedAt: typeof raw['updated_at'] === 'string' ? raw['updated_at'] : undefined
  }
}

export async function listDots(
  accountId: string,
  ensureDefault = true
): Promise<{ items: DotProfile[]; activeDot?: DotProfile }> {
  let res: { items?: Record<string, unknown>[] }
  try {
    res = await callDotApi<{ items?: Record<string, unknown>[] }>(accountId, {
      method: 'GET',
      path: '/tbo',
      query: { limit: '25' }
    })
  } catch (err) {
    if (err instanceof DotApiError && (err.status === 404 || err.status === 403)) {
      throw new DotApiError(
        err.status,
        '该账号当前套餐未开通 Dot (/backend-api/tbo 404)，请选用 promax / pro / team 账号'
      )
    }
    throw err
  }

  let items = (Array.isArray(res?.items) ? res.items : [])
    .map(normalizeDotProfile)
    .filter((d) => d.id && d.status !== 'deleting')

  if (items.length === 0 && ensureDefault) {
    const created = await createDot(accountId, { displayName: 'Dot', hasExisting: false })
    items = [created]
  }

  const acc = getStoredDotAccount(accountId)
  let activeDot =
    (acc?.activeDotId ? items.find((d) => d.id === acc.activeDotId) : undefined) ??
    items.find((d) => d.isPrimary) ??
    items[0]

  if (activeDot) {
    patchStoredDotAccount(accountId, {
      mode: 'dot',
      activeDotId: activeDot.id,
      roomId: activeDot.messagingRoomId,
      threadId: activeDot.activeRootThreadId
    })
    void ensureCelsiusWatcher(accountId, activeDot.messagingRoomId)
  }

  return { items, activeDot }
}

export async function createDot(
  accountId: string,
  opts?: { displayName?: string; color?: string; hasExisting?: boolean }
): Promise<DotProfile> {
  const existing =
    opts?.hasExisting !== undefined
      ? opts.hasExisting
      : (
          await callDotApi<{ items?: unknown[] }>(accountId, {
            method: 'GET',
            path: '/tbo',
            query: { limit: '5' }
          }).catch(() => ({ items: [] }))
        ).items?.length
        ? true
        : false

  const raw = await callDotApi<Record<string, unknown>>(accountId, {
    method: 'POST',
    path: '/tbo',
    body: {
      display_name: opts?.displayName?.trim() || 'Dot',
      ...(opts?.color ? { color: opts.color } : {}),
      create_thread: true,
      create_additional: Boolean(existing),
      should_initialize: true
    }
  })

  const profile = normalizeDotProfile(raw)
  patchStoredDotAccount(accountId, {
    activeDotId: profile.id,
    roomId: profile.messagingRoomId,
    threadId: profile.activeRootThreadId
  })
  void ensureCelsiusWatcher(accountId, profile.messagingRoomId)
  return profile
}

export async function getDot(accountId: string, dotId: string): Promise<DotProfile> {
  const raw = await callDotApi<Record<string, unknown>>(accountId, {
    method: 'GET',
    path: `/tbo/${encodeURIComponent(dotId)}`
  })
  return normalizeDotProfile(raw)
}

export async function deleteDot(accountId: string, dotId: string): Promise<unknown> {
  return callDotApi(accountId, {
    method: 'DELETE',
    path: `/tbo/${encodeURIComponent(dotId)}`
  })
}

const activeRoomWatches = new Map<string, () => void>()

export function cancelWatchDotRoomReply(accountId: string): void {
  const finish = activeRoomWatches.get(accountId)
  if (finish) {
    activeRoomWatches.delete(accountId)
    finish()
  }
}

export async function pauseDotRuntime(accountId: string, dotId?: string): Promise<unknown> {
  const acc = getStoredDotAccount(accountId)
  const targetDotId = dotId || acc?.activeDotId
  cancelWatchDotRoomReply(accountId)
  // Also interrupt any active native AppServer turn
  await interruptNativeTurn(accountId).catch(() => undefined)
  if (!targetDotId) return { ok: true }
  return callDotApi(accountId, {
    method: 'POST',
    path: `/tbo/${encodeURIComponent(targetDotId)}/runtime/pause`,
    body: {}
  })
}

export async function resumeDotRuntime(accountId: string, dotId?: string): Promise<unknown> {
  const acc = getStoredDotAccount(accountId)
  const targetDotId = dotId || acc?.activeDotId
  if (!targetDotId) throw new DotApiError(400, 'dotId required')
  return callDotApi(accountId, {
    method: 'POST',
    path: `/tbo/${encodeURIComponent(targetDotId)}/runtime/resume`,
    body: {}
  })
}

export async function cancelDotTurn(accountId: string, dotId?: string): Promise<unknown> {
  cancelWatchDotRoomReply(accountId)
  await interruptNativeTurn(accountId).catch(() => undefined)
  const acc = getStoredDotAccount(accountId)
  const targetDotId = dotId || acc?.activeDotId
  if (targetDotId) {
    await callDotApi(accountId, {
      method: 'POST',
      path: `/tbo/${encodeURIComponent(targetDotId)}/runtime/pause`,
      body: {}
    }).catch(() => undefined)
    // Resume after a brief delay so the container remains ready for the next message
    setTimeout(() => {
      void callDotApi(accountId, {
        method: 'POST',
        path: `/tbo/${encodeURIComponent(targetDotId)}/runtime/resume`,
        body: {}
      }).catch(() => undefined)
    }, 600)
  }
  return { ok: true }
}

export async function listDotThreads(accountId: string, dotId?: string): Promise<unknown> {
  const acc = getStoredDotAccount(accountId)
  const targetDotId = dotId || acc?.activeDotId
  if (!targetDotId) {
    const { activeDot } = await listDots(accountId, true)
    if (!activeDot) return { items: [] }
    return callDotApi(accountId, {
      method: 'GET',
      path: `/tbo/${encodeURIComponent(activeDot.id)}/threads`
    })
  }
  return callDotApi(accountId, {
    method: 'GET',
    path: `/tbo/${encodeURIComponent(targetDotId)}/threads`
  })
}

export function inferDotFileMimeType(name?: string, rawMime?: string): string {
  const lower = (name || '').toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'text/markdown'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.py')) return 'text/x-python'
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    return 'text/javascript'
  }
  if (lower.endsWith('.css')) return 'text/css'
  if (lower.endsWith('.txt') || lower.endsWith('.log')) return 'text/plain'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (rawMime && rawMime !== 'application/octet-stream') return rawMime
  return rawMime || 'application/octet-stream'
}

export function isDotAckMessage(msg: DotRoomMessage): boolean {
  if (
    msg.attachments &&
    msg.attachments.some((a) => a.type === 'file' || a.downloadUrl || a.fileId)
  ) {
    return false
  }
  if (msg.turnTrigger === 'aeon_transplant') {
    return true
  }
  if (msg.text.length < 260) {
    if (
      /做好后|发给你|稍等|正在|马上|开始|我现在就|我会创建|先帮你|我去|为你生成|我先|请稍候|继续处理|I'll|I will|working on|one moment|let me|了解しました|送ります|作成します|少々お待ち|今すぐ|処理します|Je vais|Un instant/i.test(
        msg.text
      )
    ) {
      return true
    }
  }
  return false
}

export function dotAttachmentsToMedia(
  attachments?: DotRoomAttachment[]
): MuseMediaPartView[] | undefined {
  if (!attachments || attachments.length === 0) return undefined
  const out: MuseMediaPartView[] = []
  for (const att of attachments) {
    if (att.type === 'widget' || (!att.downloadUrl && !att.fileId && !att.name)) {
      continue
    }
    const name = att.name || att.fileId || att.attachmentId || 'attachment'
    const mimeType = inferDotFileMimeType(name, att.mimeType)
    const isImg =
      mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)
    const path =
      att.downloadUrl ||
      (att.fileId ? `dotfile://${att.fileId}` : '')
    if (!path) continue
    out.push({
      kind: isImg ? 'image' : 'file',
      path,
      name,
      mimeType
    })
  }
  return out.length > 0 ? out : undefined
}

export function normalizeRoomMessage(raw: Record<string, unknown>, fallbackRoomId = ''): DotRoomMessage {
  const id = String(raw['id'] ?? '')
  const roomId = String(raw['room_id'] ?? fallbackRoomId)
  const accountUserId = String(raw['account_user_id'] ?? '')
  const isBot =
    accountUserId.startsWith('calpico-member-') ||
    String(raw['role'] ?? '').toLowerCase() === 'assistant'
  const contentObj =
    raw['content'] && typeof raw['content'] === 'object'
      ? (raw['content'] as Record<string, unknown>)
      : {}
  const text = String(contentObj['text'] ?? raw['text'] ?? '').trim()
  const rawAtts = Array.isArray(contentObj['attachments']) ? contentObj['attachments'] : []
  const attachments: DotRoomAttachment[] = rawAtts
    .map((a) => {
      if (!a || typeof a !== 'object') return null
      const ao = a as Record<string, unknown>
      const fileObj =
        ao['file'] && typeof ao['file'] === 'object'
          ? (ao['file'] as Record<string, unknown>)
          : {}
      const name = typeof fileObj['name'] === 'string' ? fileObj['name'] : undefined
      const rawMime = typeof fileObj['mime_type'] === 'string' ? fileObj['mime_type'] : undefined
      return {
        attachmentId: String(ao['attachment_id'] ?? fileObj['id'] ?? ''),
        type: String(ao['type'] ?? 'file'),
        fileId: typeof ao['file_id'] === 'string' ? ao['file_id'] : undefined,
        name,
        mimeType: inferDotFileMimeType(name, rawMime),
        downloadUrl: typeof fileObj['download_url'] === 'string' ? fileObj['download_url'] : undefined
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const metadata =
    raw['message_metadata'] && typeof raw['message_metadata'] === 'object'
      ? (raw['message_metadata'] as Record<string, unknown>)
      : raw['metadata'] && typeof raw['metadata'] === 'object'
        ? (raw['metadata'] as Record<string, unknown>)
        : {}
  const createdStr = typeof raw['created_at'] === 'string' ? raw['created_at'] : ''
  const createdAtMs = createdStr ? Date.parse(createdStr) || Date.now() : Date.now()

  return {
    id,
    roomId,
    role: isBot ? 'bot' : 'user',
    accountUserId,
    text,
    createdAtMs,
    turnTrigger: typeof metadata['turn_trigger'] === 'string' ? metadata['turn_trigger'] : undefined,
    threadTurnId: typeof metadata['thread_turn_id'] === 'string' ? metadata['thread_turn_id'] : undefined,
    ...(attachments.length > 0 ? { attachments } : {})
  }
}

export async function listRoomMessages(
  accountId: string,
  opts?: { roomId?: string; dotId?: string; limit?: number; after?: string }
): Promise<{ roomId: string; dotId?: string; messages: DotRoomMessage[]; hasMore: boolean }> {
  let acc = getStoredDotAccount(accountId)
  let roomId = opts?.roomId || acc?.roomId
  let dotId = opts?.dotId || acc?.activeDotId

  if (!roomId) {
    const { activeDot } = await listDots(accountId, true)
    if (!activeDot || !activeDot.messagingRoomId) {
      return { roomId: '', dotId: activeDot?.id, messages: [], hasMore: false }
    }
    roomId = activeDot.messagingRoomId
    dotId = activeDot.id
    acc = getStoredDotAccount(accountId)
  }

  // IMPORTANT: Calpico room messages API enforces `limit <= 32` (HTTP 422 if > 32).
  const limit = Math.max(1, Math.min(32, opts?.limit ?? 32))
  const res = await callDotApi<{
    items?: Record<string, unknown>[]
    data?: Record<string, unknown>[]
    has_more?: boolean
  }>(accountId, {
    method: 'GET',
    path: `/messaging/rooms/${encodeURIComponent(roomId)}/messages`,
    query: {
      limit: String(limit),
      ...(opts?.after ? { after: opts.after } : {})
    }
  })

  const list = Array.isArray(res?.items)
    ? res.items
    : Array.isArray(res?.data)
      ? res.data
      : []
  const messages = list.map((m) => normalizeRoomMessage(m, roomId)).filter((m) => m.id)
  void ensureRoomPoller(accountId, roomId, messages)
  return {
    roomId,
    dotId,
    messages,
    hasMore: Boolean(res?.has_more)
  }
}

export async function downloadDotFile(
  accountId: string,
  opts: { url?: string; fileId?: string; roomId?: string; name?: string }
): Promise<{
  name: string
  filename: string
  mimeType: string
  size: number
  dataBase64: string
  text?: string
}> {
  const acc = await ensureValidDotAccount(accountId)
  let targetUrl = opts.url?.trim() || ''
  let fileId = opts.fileId?.trim() || ''
  let fileName = opts.name?.trim() || ''

  if (targetUrl.startsWith('dotfile://')) {
    fileId = targetUrl.slice('dotfile://'.length)
    targetUrl = ''
  }

  const resolveFreshUrlFromRoom = async (): Promise<string> => {
    const listed = await listRoomMessages(accountId, {
      roomId: opts.roomId || acc.roomId,
      limit: 32
    }).catch(() => ({ messages: [] as DotRoomMessage[] }))
    for (let i = listed.messages.length - 1; i >= 0; i--) {
      const m = listed.messages[i]!
      for (const att of m.attachments ?? []) {
        if (!att.downloadUrl) continue
        if (
          (fileId && (att.fileId === fileId || att.attachmentId === fileId)) ||
          (fileName && att.name === fileName)
        ) {
          if (!fileName && att.name) fileName = att.name
          return att.downloadUrl
        }
      }
    }
    return ''
  }

  const resolveFreshUrlFromLibrary = async (fid: string): Promise<string> => {
    if (!fid.startsWith('file_') && !fid.startsWith('file-')) return ''
    try {
      const info = await callDotApi<{
        download_url?: string
        file_name?: string
      }>(accountId, {
        method: 'GET',
        path: `/files/download/${encodeURIComponent(fid)}`
      })
      if (!fileName && info?.file_name) fileName = info.file_name
      return info?.download_url || ''
    } catch {
      return ''
    }
  }

  if (!targetUrl && fileId) {
    if (fileId.startsWith('libfile_')) {
      try {
        const lib = (await listDotLibraryNodes(accountId, 50)) as {
          items?: Array<Record<string, unknown>>
          nodes?: Array<Record<string, unknown>>
        }
        const nodes = Array.isArray(lib?.items)
          ? lib.items
          : Array.isArray(lib?.nodes)
            ? lib.nodes
            : []
        const matched = nodes.find((n) => n && (n['id'] === fileId || n['node_id'] === fileId))
        if (matched) {
          if (!fileName && typeof matched['title'] === 'string') fileName = matched['title']
          if (!fileName && typeof matched['name'] === 'string') fileName = matched['name']
          if (typeof matched['download_url'] === 'string' && matched['download_url']) {
            targetUrl = matched['download_url']
          } else if (typeof matched['file_id'] === 'string' && matched['file_id']) {
            fileId = matched['file_id']
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (!targetUrl && (fileId.startsWith('file_') || fileId.startsWith('file-'))) {
      targetUrl = await resolveFreshUrlFromLibrary(fileId)
    }
    if (!targetUrl) {
      targetUrl = await resolveFreshUrlFromRoom()
    }
  }

  if (!targetUrl && fileName) {
    targetUrl = await resolveFreshUrlFromRoom()
  }

  if (!targetUrl) {
    throw new DotApiError(404, '无法解析 Dot 文件下载链接')
  }

  const fetchUrl = async (u: string): Promise<Response> => {
    const isChatgptApi = u.startsWith(DOT_ORIGIN)
    return proxyFetch(acc.proxyUrl, u, {
      headers: {
        ...(isChatgptApi
          ? {
              Authorization: `Bearer ${acc.accessToken}`,
              ...(acc.chatgptAccountId ? { 'chatgpt-account-id': acc.chatgptAccountId } : {}),
              Origin: DOT_ORIGIN,
              Referer: `${DOT_ORIGIN}/dots`
            }
          : {}),
        'User-Agent': CHROME_UA
      }
    })
  }

  let res = await fetchUrl(targetUrl)
  if (!res.ok && (res.status === 401 || res.status === 403 || res.status === 404)) {
    const refreshedUrl =
      (fileId && (fileId.startsWith('file_') || fileId.startsWith('file-'))
        ? await resolveFreshUrlFromLibrary(fileId)
        : '') || (await resolveFreshUrlFromRoom())
    if (refreshedUrl && refreshedUrl !== targetUrl) {
      targetUrl = refreshedUrl
      res = await fetchUrl(targetUrl)
    }
  }

  if (!res.ok) {
    throw new DotApiError(res.status, `下载 Dot 文件失败 (${res.status})`)
  }

  const ab = await res.arrayBuffer()
  const buf = Buffer.from(ab)
  const finalName = fileName || 'document'
  const mimeType = inferDotFileMimeType(
    finalName,
    res.headers.get('content-type')?.split(';')[0]?.trim()
  )
  const isTextLike =
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'image/svg+xml' ||
    /\.(html?|md|markdown|txt|json|csv|py|js|ts|tsx|css|svg|xml|yaml|yml)$/i.test(finalName)

  return {
    name: finalName,
    filename: finalName,
    mimeType,
    size: buf.byteLength,
    dataBase64: buf.toString('base64'),
    ...(isTextLike ? { text: buf.toString('utf8') } : {})
  }
}

/**
 * Maintain a persistent `POST /backend-api/messaging/rooms/{room_id}/live` SSE connection
 * while the room is active so the backend streams `calpico-room-live` / `calpico-message-add`
 * events onto both the SSE response and the user's Celsius WebSocket.
 */
interface RoomLiveStreamState {
  ac: AbortController
  startedAt: number
}

const activeRoomLiveStreams = new Map<string, RoomLiveStreamState>()

export function closeRoomLiveStream(accountId: string, roomId?: string): void {
  for (const [k, v] of activeRoomLiveStreams.entries()) {
    if (k === `${accountId}:${roomId}` || (!roomId && k.startsWith(`${accountId}:`))) {
      v.ac.abort()
      activeRoomLiveStreams.delete(k)
    }
  }
}

export async function triggerRoomLivePush(accountId: string, roomId: string): Promise<void> {
  if (!roomId) return
  const key = `${accountId}:${roomId}`
  const existing = activeRoomLiveStreams.get(key)
  if (existing && Date.now() - existing.startedAt < 10 * 60 * 1000) {
    return
  }
  existing?.ac.abort()

  const ac = new AbortController()
  activeRoomLiveStreams.set(key, { ac, startedAt: Date.now() })
  // Refresh after 10 minutes
  const maxTimer = setTimeout(() => {
    ac.abort()
    activeRoomLiveStreams.delete(key)
  }, 10 * 60 * 1000)

  try {
    const acc = await ensureValidDotAccount(accountId)
    const res = await proxyFetch(acc.proxyUrl, `${DOT_API_BASE}/messaging/rooms/${encodeURIComponent(roomId)}/live`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${acc.accessToken}`,
        ...(acc.chatgptAccountId ? { 'chatgpt-account-id': acc.chatgptAccountId } : {}),
        Accept: 'text/event-stream',
        Origin: DOT_ORIGIN,
        Referer: `${DOT_ORIGIN}/dots`,
        'User-Agent': CHROME_UA
      },
      signal: ac.signal
    })
    if (!res.ok || !res.body) return
    let buffer = ''
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += Buffer.from(chunk).toString('utf8')
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const jsonStr = line.slice(5).trim()
        if (!jsonStr || jsonStr === '[DONE]') continue
        try {
          const ev = JSON.parse(jsonStr) as Record<string, unknown>
          handleCalpicoEventPayload(accountId, ev, roomId)
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* stream closed or aborted */
  } finally {
    clearTimeout(maxTimer)
    if (activeRoomLiveStreams.get(key)?.ac === ac) {
      activeRoomLiveStreams.delete(key)
    }
  }
}

const NO_TOOLS_PROMPT_RE =
  /(do not (call|use) (or use )?any tools|without invoking any tools|いかなるツールも(呼び出したり使用したりしないで|使用しないで)|n'utilisez aucun outil|不要(调用|使用)任何工具)/i

export async function sendRoomMessage(
  accountId: string,
  opts: { roomId?: string; dotId?: string; text: string }
): Promise<{ roomId: string; dotId?: string; message: DotRoomMessage }> {
  const acc = getStoredDotAccount(accountId)
  let roomId = opts.roomId || acc?.roomId
  let dotId = opts.dotId || acc?.activeDotId

  if (!roomId) {
    const { activeDot } = await listDots(accountId, true)
    if (!activeDot) throw new DotApiError(404, 'No active Dot room found')
    roomId = activeDot.messagingRoomId
    dotId = activeDot.id
  }

  void ensureCelsiusWatcher(accountId, roomId)
  void triggerRoomLivePush(accountId, roomId)

  // In Calpico rooms (`aeon`), posting a reply into the user's chat room is itself an internal
  // messaging tool action. Prompts that strictly forbid *all* tools can cause the model to write
  // only to its internal thread stdout without posting the reply to the room.
  const wireText = NO_TOOLS_PROMPT_RE.test(opts.text)
    ? `${opts.text}\n\n(Note for room delivery: do not use any external/search/code/file tools, but do send your final response text directly into this chat room.)`
    : opts.text

  const raw = await callDotApi<Record<string, unknown>>(accountId, {
    method: 'POST',
    path: `/messaging/rooms/${encodeURIComponent(roomId)}/messages`,
    body: {
      content: {
        text: wireText,
        attachments: []
      },
      request_id: randomUUID(),
      idempotency_token: randomUUID()
    }
  })

  const message = normalizeRoomMessage(raw, roomId)
  message.text = opts.text
  return { roomId, dotId, message }
}

// ============================================================================
// Persistent Celsius WebSocket Watcher (`GET /backend-api/celsius/ws/user`)
// & Continuous Room Message Sync Poller
// ============================================================================

interface CelsiusWatcherState {
  accountId: string
  ws: WebSocket | null
  subscribedRooms: Set<string>
  seenMessageIds: Set<string>
  reconnectTimer?: NodeJS.Timeout
  pingTimer?: NodeJS.Timeout
  closed: boolean
}

const celsiusWatchers = new Map<string, CelsiusWatcherState>()

interface RoomPollerState {
  accountId: string
  roomId: string
  timer?: NodeJS.Timeout
  lastActiveAt: number
  busy: boolean
  knownSignatures: Map<string, string>
  closed: boolean
}

const roomPollers = new Map<string, RoomPollerState>()

function messageSignature(msg: DotRoomMessage): string {
  const attSig = (msg.attachments ?? [])
    .map((a) => `${a.fileId || a.attachmentId}:${a.name || ''}:${Boolean(a.downloadUrl)}`)
    .join('|')
  return `${msg.text.length}:${msg.text.slice(-32)}:${attSig}`
}

export function bumpDotRoomActivity(accountId: string, roomId?: string, busy = true): void {
  const st = roomPollers.get(accountId)
  if (st) {
    if (roomId) st.roomId = roomId
    st.lastActiveAt = Date.now()
    st.busy = busy
  }
}

export function ensureRoomPoller(
  accountId: string,
  roomId?: string,
  seedMessages?: DotRoomMessage[]
): void {
  const acc = getStoredDotAccount(accountId)
  const targetRoomId = roomId || acc?.roomId || ''
  if (!targetRoomId) return

  let st = roomPollers.get(accountId)
  if (st && !st.closed) {
    st.roomId = targetRoomId
    if (seedMessages) {
      for (const m of seedMessages) {
        st.knownSignatures.set(m.id, messageSignature(m))
      }
    }
    return
  }

  st = {
    accountId,
    roomId: targetRoomId,
    lastActiveAt: Date.now(),
    busy: false,
    knownSignatures: new Map<string, string>(),
    closed: false
  }
  if (seedMessages) {
    for (const m of seedMessages) {
      st.knownSignatures.set(m.id, messageSignature(m))
    }
  }
  roomPollers.set(accountId, st)

  const tick = async () => {
    const cur = roomPollers.get(accountId)
    if (!cur || cur.closed) return
    const curAcc = getStoredDotAccount(accountId)
    if (!curAcc || !cur.roomId) return

    try {
      const res = await callDotApi<{
        items?: Record<string, unknown>[]
        data?: Record<string, unknown>[]
      }>(accountId, {
        method: 'GET',
        path: `/messaging/rooms/${encodeURIComponent(cur.roomId)}/messages`,
        query: { limit: '12' }
      })
      const rawList = Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.data)
          ? res.data
          : []
      const msgs = rawList.map((m) => normalizeRoomMessage(m, cur.roomId)).filter((m) => m.id)
      const hadSeed = cur.knownSignatures.size > 0
      for (const m of msgs) {
        const sig = messageSignature(m)
        const prevSig = cur.knownSignatures.get(m.id)
        cur.knownSignatures.set(m.id, sig)
        if (hadSeed && m.role === 'bot' && (m.text || m.attachments?.length) && prevSig !== sig) {
          cur.lastActiveAt = Date.now()
          emitRealtime({
            type: 'message',
            accountId,
            botId: curAcc.botId,
            dotId: curAcc.activeDotId,
            roomId: cur.roomId,
            message: m,
            done: true
          })
        }
      }
    } catch {
      /* ignore transient poll error */
    }

    if (cur.closed) return
    const recentlyActive = cur.busy || Date.now() - cur.lastActiveAt < 6 * 60 * 1000
    const nextDelay = recentlyActive ? 3000 : 12000
    cur.timer = setTimeout(() => void tick(), nextDelay)
  }

  st.timer = setTimeout(() => void tick(), 3500)
}

export function handleCalpicoEventPayload(
  accountId: string,
  ev: Record<string, unknown>,
  fallbackRoomId = ''
): void {
  const evType = String(ev['type'] ?? '')
  const payload = (ev['payload'] as Record<string, unknown> | undefined) ?? ev
  const evRoomId = String(payload['room_id'] ?? ev['room_id'] ?? fallbackRoomId)
  const acc = getStoredDotAccount(accountId)
  const st = celsiusWatchers.get(accountId)

  if (evType === 'calpico-message-add' || evType === 'calpico-message-update') {
    const msgRaw = payload['message'] as Record<string, unknown> | undefined
    if (!msgRaw) return
    const msg = normalizeRoomMessage(msgRaw, evRoomId || acc?.roomId || '')
    if (msg.role === 'bot' && (msg.text || msg.attachments?.length)) {
      st?.seenMessageIds.add(msg.id)
      const poller = roomPollers.get(accountId)
      poller?.knownSignatures.set(msg.id, messageSignature(msg))
      bumpDotRoomActivity(accountId, msg.roomId, true)
      emitRealtime({
        type: 'message',
        accountId,
        botId: acc?.botId,
        dotId: acc?.activeDotId,
        roomId: msg.roomId,
        message: msg,
        done: true
      })
    }
  } else if (evType === 'calpico-is-responding-heartbeat') {
    const typing = Boolean(payload['typing'])
    bumpDotRoomActivity(accountId, evRoomId || acc?.roomId, typing)
    emitRealtime({
      type: 'activity',
      accountId,
      botId: acc?.botId,
      dotId: acc?.activeDotId,
      roomId: evRoomId || acc?.roomId || '',
      code: typing ? 'thinking' : 'idle',
      text: typing ? 'Dot is responding…' : undefined,
      busy: typing
    })
  } else if (evType === 'calpico-room-live' || evType === 'calpico-room-live-state') {
    const threads = Array.isArray(payload['threads'])
      ? (payload['threads'] as Record<string, unknown>[])
      : []
    const first = threads[0]
    if (!first) {
      bumpDotRoomActivity(accountId, evRoomId || acc?.roomId, false)
      emitRealtime({
        type: 'activity',
        accountId,
        botId: acc?.botId,
        dotId: acc?.activeDotId,
        roomId: evRoomId || acc?.roomId || '',
        code: 'idle',
        text: undefined,
        busy: false
      })
      return
    }
    const turnStatus = String(first['turn_status'] ?? '')
    const actObj =
      first['activity_status'] && typeof first['activity_status'] === 'object'
        ? (first['activity_status'] as Record<string, unknown>)
        : {}
    const statusType = String(actObj['status_type'] ?? '')
    const statusLabel = typeof actObj['status_label'] === 'string' ? actObj['status_label'] : undefined
    const summary = typeof first['summary'] === 'string' ? first['summary'] : undefined
    const busy =
      turnStatus === 'in_progress' ||
      (statusType !== '' && statusType.toLowerCase() !== 'ready')
    bumpDotRoomActivity(accountId, evRoomId || acc?.roomId, busy)
    emitRealtime({
      type: 'activity',
      accountId,
      botId: acc?.botId,
      dotId: acc?.activeDotId,
      roomId: evRoomId || acc?.roomId || '',
      code: busy ? statusType.toLowerCase() || 'thinking' : 'idle',
      text: busy ? statusLabel || summary || statusType || 'Thinking…' : undefined,
      busy
    })
  }
}

export function closeCelsiusWatcher(accountId: string): void {
  closeRoomLiveStream(accountId)
  const poller = roomPollers.get(accountId)
  if (poller) {
    poller.closed = true
    if (poller.timer) clearTimeout(poller.timer)
    roomPollers.delete(accountId)
  }
  const st = celsiusWatchers.get(accountId)
  if (!st) return
  st.closed = true
  if (st.reconnectTimer) clearTimeout(st.reconnectTimer)
  if (st.pingTimer) clearInterval(st.pingTimer)
  try {
    st.ws?.close()
  } catch {
    /* ignore */
  }
  celsiusWatchers.delete(accountId)
}

export async function ensureCelsiusWatcher(accountId: string, roomId?: string): Promise<void> {
  if (roomId) {
    ensureRoomPoller(accountId, roomId)
    void triggerRoomLivePush(accountId, roomId)
  }
  let st = celsiusWatchers.get(accountId)
  if (st && !st.closed && st.ws && st.ws.readyState === WebSocket.OPEN) {
    if (roomId && !st.subscribedRooms.has(roomId)) {
      st.subscribedRooms.add(roomId)
      try {
        st.ws.send(
          JSON.stringify([
            {
              command: { type: 'subscribe', topic_id: `calpico-room-live:${roomId}` },
              id: Math.floor(Math.random() * 100000) + 10
            }
          ])
        )
      } catch {
        /* ignore */
      }
    }
    return
  }

  if (st && !st.closed && st.ws && st.ws.readyState === WebSocket.CONNECTING) {
    if (roomId) st.subscribedRooms.add(roomId)
    return
  }

  try {
    const info = await callDotApi<{ websocket_url?: string }>(accountId, {
      method: 'GET',
      path: '/celsius/ws/user'
    })
    if (!info?.websocket_url) return

    st = {
      accountId,
      ws: null,
      subscribedRooms: new Set(roomId ? [roomId] : []),
      seenMessageIds: st?.seenMessageIds ?? new Set<string>(),
      closed: false
    }
    celsiusWatchers.set(accountId, st)

    const ws = new WebSocket(info.websocket_url, {
      agent: proxyWsAgent(getStoredDotAccount(accountId)?.proxyUrl),
      headers: {
        Origin: DOT_ORIGIN,
        'User-Agent': CHROME_UA
      }
    })
    st.ws = ws

    ws.on('open', () => {
      if (!st || st.closed) return
      if (st.pingTimer) clearInterval(st.pingTimer)
      st.pingTimer = setInterval(() => {
        if (!st || st.closed || ws.readyState !== WebSocket.OPEN) return
        try {
          ws.ping()
        } catch {
          /* ignore */
        }
      }, 25_000)
      const acc = getStoredDotAccount(accountId)
      if (acc?.roomId) st.subscribedRooms.add(acc.roomId)
      const cmds: unknown[] = [
        {
          command: {
            type: 'connect',
            presence: { type: 'presence', state: 'foreground' }
          },
          id: 1
        },
        {
          command: {
            type: 'subscribe',
            topic_id: 'calpico-chatgpt-messaging'
          },
          id: 2
        }
      ]
      let nextId = 3
      for (const rId of st.subscribedRooms) {
        cmds.push({
          command: {
            type: 'subscribe',
            topic_id: `calpico-room-live:${rId}`
          },
          id: nextId++
        })
      }
      try {
        ws.send(JSON.stringify(cmds))
      } catch {
        /* ignore */
      }
    })

    ws.on('message', (data) => {
      if (!st || st.closed) return
      try {
        const frame = JSON.parse(data.toString()) as Record<string, unknown>
        if (frame['type'] !== 'message') return
        const ev = frame['payload'] as Record<string, unknown> | undefined
        if (!ev || typeof ev !== 'object') return
        handleCalpicoEventPayload(accountId, ev, roomId)
      } catch {
        /* ignore malformed frame */
      }
    })

    ws.on('close', () => {
      if (!st || st.closed) return
      if (st.pingTimer) {
        clearInterval(st.pingTimer)
        st.pingTimer = undefined
      }
      st.ws = null
      st.reconnectTimer = setTimeout(() => {
        void ensureCelsiusWatcher(accountId, roomId)
      }, 4000)
    })

    ws.on('error', () => {
      /* handled by close */
    })
  } catch {
    /* ignore */
  }
}

/**
 * Send a message to a Dot's Calpico room and watch both Celsius WS + room message polling
 * until Dot finishes its turn (including multi-minute code/file generation turns).
 */
export async function sendAndWatchDotRoomReply(
  accountId: string,
  opts: {
    botId?: string
    dotId?: string
    roomId?: string
    text: string
    timeoutMs?: number
    onMessage?: (msg: DotRoomMessage, done: boolean, stillBusy?: boolean) => void
    onActivity?: (code: string, text: string | undefined, busy: boolean) => void
    /** The user message is in the room (before any reply). */
    onSent?: () => void
  }
): Promise<{
  roomId: string
  sentMessage: DotRoomMessage
  replies: DotRoomMessage[]
}> {
  if (opts.botId) {
    patchStoredDotAccount(accountId, { botId: opts.botId })
  }

  const beforeSnap = await listRoomMessages(accountId, {
    roomId: opts.roomId,
    dotId: opts.dotId,
    limit: 32
  }).catch(() => ({ roomId: opts.roomId || '', messages: [] as DotRoomMessage[] }))
  const beforeIds = new Set(beforeSnap.messages.map((m) => m.id))

  if (beforeSnap.roomId) {
    await ensureCelsiusWatcher(accountId, beforeSnap.roomId).catch(() => undefined)
  }

  const sent = await sendRoomMessage(accountId, {
    roomId: opts.roomId || beforeSnap.roomId || undefined,
    dotId: opts.dotId,
    text: opts.text
  })
  opts.onSent?.()
  const roomId = sent.roomId
  const sentId = sent.message.id
  const sentCreatedAtMs = sent.message.createdAtMs || Date.now()
  beforeIds.add(sentId)
  bumpDotRoomActivity(accountId, roomId, true)

  const timeoutMs = opts.timeoutMs ?? 300_000
  const startedAt = Date.now()

  const repliesById = new Map<string, DotRoomMessage>()
  const emittedSignatures = new Map<string, string>()
  let lastBusy = true
  let lastReplyAt = 0
  let idleEmptyChecks = 0
  let recoverySent = false

  opts.onActivity?.('thinking', 'Thinking…', true)

  return new Promise((resolve) => {
    let finished = false
    let pollTimer: NodeJS.Timeout | undefined

    const finish = () => {
      if (finished) return
      finished = true
      if (activeRoomWatches.get(accountId) === finish) {
        activeRoomWatches.delete(accountId)
      }
      if (pollTimer) clearTimeout(pollTimer)
      unsub()
      bumpDotRoomActivity(accountId, roomId, false)
      opts.onActivity?.('idle', undefined, false)
      resolve({
        roomId,
        sentMessage: sent.message,
        replies: [...repliesById.values()]
      })
    }

    cancelWatchDotRoomReply(accountId)
    activeRoomWatches.set(accountId, finish)

    const isNewBotReply = (msg: DotRoomMessage): boolean => {
      if (msg.role !== 'bot' || (!msg.text && !msg.attachments?.length)) return false
      if (beforeIds.has(msg.id)) return false
      if (msg.createdAtMs && msg.createdAtMs < sentCreatedAtMs - 5000) return false
      return true
    }

    const looksLikeInProgressAck = (msg: DotRoomMessage): boolean => isDotAckMessage(msg)

    const triggerSilentTurnRecovery = async (reason: 'transplant_idle' | 'empty_turn_idle') => {
      if (finished || recoverySent) return
      recoverySent = true
      idleEmptyChecks = 0
      lastBusy = true
      opts.onActivity?.(
        'thinking',
        reason === 'transplant_idle'
          ? 'Dot 容器刚完成自动迁移，正在自动续发任务获取回复…'
          : 'Dot 已在内部完成计算，正在同步回复到聊天室…',
        true
      )
      try {
        await listDots(accountId, false).catch(() => undefined)
        const followUpPrompt =
          reason === 'transplant_idle'
            ? `请继续直接完成刚才这条任务并把完整结果发到当前聊天室：\n\n${opts.text}`
            : '请把你刚才针对上一条消息生成的完整结果直接发送到当前聊天室中（不要只留在内部输出）。'
        const nudge = await sendRoomMessage(accountId, {
          roomId,
          dotId: opts.dotId,
          text: followUpPrompt
        })
        beforeIds.add(nudge.message.id)
      } catch {
        /* ignore recovery error */
      }
    }

    const checkStillBusyAndMaybeFinish = async () => {
      if (finished || repliesById.size === 0) return
      const allReplies = [...repliesById.values()]
      const latestMsg = allReplies[allReplies.length - 1]!
      const isExplicitAck = looksLikeInProgressAck(latestMsg)
      const isTransplantOnly =
        allReplies.every((m) => m.turnTrigger === 'aeon_transplant') && allReplies.length > 0

      if (latestMsg.turnTrigger === 'aeon_transplant') {
        await listDots(accountId, false).catch(() => undefined)
      }

      const rootBusy = await isDotRootThreadBusy(accountId).catch(() => null)
      if (rootBusy === true) {
        lastBusy = true
        opts.onActivity?.(
          'thinking',
          latestMsg.turnTrigger === 'aeon_transplant'
            ? 'Dot 容器已切换并正在恢复上下文继续处理…'
            : 'Dot 正在后台处理并生成后续回复/文件…',
          true
        )
        return
      }
      // Even if root thread briefly reports idle right after an explicit Phase-1 ack, give an 8s grace window
      if (isExplicitAck && Date.now() - lastReplyAt < 8_000) {
        opts.onActivity?.('thinking', 'Dot 正在后台处理并生成后续回复/文件…', true)
        return
      }
      // If the only reply was an `aeon_transplant` recovery notice and the new container went idle without answering, auto-continue once
      // Only when Dot positively reports idle: this re-posts the prompt as the user.
      if (isTransplantOnly && !recoverySent && rootBusy === false) {
        await triggerSilentTurnRecovery('transplant_idle')
        return
      }
      finish()
    }

    const recordAndEmitReply = (msg: DotRoomMessage) => {
      const sig = messageSignature(msg)
      const prevSig = emittedSignatures.get(msg.id)
      repliesById.set(msg.id, msg)
      if (prevSig !== sig) {
        emittedSignatures.set(msg.id, sig)
        lastReplyAt = Date.now()
        idleEmptyChecks = 0
        if (msg.turnTrigger === 'aeon_transplant') {
          void listDots(accountId, false).catch(() => undefined)
        }
        const ackLike = looksLikeInProgressAck(msg)
        opts.onMessage?.(msg, true, ackLike)
      }
    }

    const unsub = onDotRealtimeEvent((ev) => {
      if (ev.accountId !== accountId) return
      if (ev.roomId && ev.roomId !== roomId) return
      if (ev.type === 'activity') {
        lastBusy = ev.busy
        opts.onActivity?.(ev.code, ev.text, ev.busy)
        if (!ev.busy && repliesById.size > 0) {
          setTimeout(() => void checkStillBusyAndMaybeFinish(), 600)
        }
      } else if (ev.type === 'message') {
        if (isNewBotReply(ev.message)) {
          recordAndEmitReply(ev.message)
          if (!lastBusy) {
            setTimeout(() => void checkStillBusyAndMaybeFinish(), 600)
          }
        }
      }
    })

    const pollOnce = async () => {
      if (finished) return
      if (Date.now() - startedAt > timeoutMs) {
        finish()
        return
      }
      void triggerRoomLivePush(accountId, roomId)
      try {
        const listed = await listRoomMessages(accountId, {
          roomId,
          after: sentId,
          limit: 16
        })
        for (const m of listed.messages) {
          if (isNewBotReply(m)) {
            recordAndEmitReply(m)
          }
        }
        if (repliesById.size > 0 && (!lastBusy || Date.now() - lastReplyAt > 2500)) {
          await checkStillBusyAndMaybeFinish()
          if (finished) return
        } else if (repliesById.size === 0 && Date.now() - startedAt > 6_000) {
          const rootBusy = await isDotRootThreadBusy(accountId).catch(() => null)
          if (rootBusy === null) {
            // Status unknown (no thread id / read failed): never nudge on a
            // guess, just give up quietly after a longer wait.
            if (Date.now() - startedAt > 60_000) idleEmptyChecks++
          } else if (!rootBusy && !lastBusy) {
            idleEmptyChecks++
          } else if (!rootBusy && Date.now() - startedAt > 15_000) {
            idleEmptyChecks++
          } else {
            idleEmptyChecks = 0
          }
          if (idleEmptyChecks >= 2) {
            if (!recoverySent && rootBusy === false) {
              await triggerSilentTurnRecovery('empty_turn_idle')
            } else if (idleEmptyChecks >= 4 || (rootBusy === null && idleEmptyChecks >= 2)) {
              finish()
              return
            }
          }
        }
      } catch {
        /* ignore transient poll error */
      }
      if (!finished) {
        pollTimer = setTimeout(() => void pollOnce(), 1800)
      }
    }

    pollTimer = setTimeout(() => void pollOnce(), 1400)
  })
}

// ============================================================================
// Codex Cloud App-Server WebSocket (`wss://codex-cloud-backend.chatgpt.com/`)
// ============================================================================

interface ActiveNativeSession {
  ws: WebSocket
  threadId?: string
  turnId?: string
}

const activeNativeSessions = new Map<string, ActiveNativeSession>()

export async function interruptNativeTurn(accountId: string): Promise<void> {
  const active = activeNativeSessions.get(accountId)
  if (!active || active.ws.readyState !== WebSocket.OPEN) return
  if (active.threadId && active.turnId) {
    try {
      active.ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 999,
          method: 'turn/interrupt',
          params: { threadId: active.threadId, turnId: active.turnId }
        })
      )
    } catch {
      /* ignore */
    }
  }
}

async function withAppServerWs<T>(
  accountId: string,
  fn: ( helpers: {
    call: (method: string, params?: unknown) => Promise<unknown>
    ws: WebSocket
    account: DotStoredAccount
  }) => Promise<T>,
  timeoutMs = 35_000
): Promise<T> {
  const acc = await ensureValidDotAccount(accountId)
  return new Promise<T>((resolve, reject) => {
    const ws = new WebSocket(
      DOT_APP_SERVER_WS_URL,
      ['codex-app-server', 'codex-client.browser', `openai-bearer.${acc.accessToken}`],
      {
        agent: proxyWsAgent(acc.proxyUrl),
        headers: {
          Origin: DOT_ORIGIN,
          'User-Agent': CHROME_UA
        }
      }
    )

    let nextId = 1
    const pending = new Map<
      number,
      { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >()
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      reject(new DotApiError(504, 'Dot App-Server WebSocket timed out'))
    }, timeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }

    const call = (method: string, params: unknown = {}): Promise<unknown> =>
      new Promise((res, rej) => {
        const id = nextId++
        pending.set(id, { resolve: res, reject: rej })
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          id?: number
          result?: unknown
          error?: { code?: number; message?: string }
        }
        if (typeof msg.id === 'number' && pending.has(msg.id)) {
          const p = pending.get(msg.id)!
          pending.delete(msg.id)
          if (msg.error) {
            p.reject(new DotApiError(400, msg.error.message || 'JSON-RPC error', msg.error))
          } else {
            p.resolve(msg.result)
          }
        }
      } catch {
        /* ignore */
      }
    })

    ws.on('open', async () => {
      try {
        await call('initialize', {
          clientInfo: {
            name: 'chatgpt-web',
            title: 'ChatGPT Dot',
            version: '1.0.0'
          },
          capabilities: {
            experimentalApi: true
          }
        })
        ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }))
        const out = await fn({ call, ws, account: acc })
        if (!settled) {
          settled = true
          cleanup()
          resolve(out)
        }
      } catch (err) {
        if (!settled) {
          settled = true
          cleanup()
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }
    })

    ws.on('error', (err) => {
      if (!settled) {
        settled = true
        cleanup()
        reject(err)
      }
    })

    ws.on('close', () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new DotApiError(502, 'App-Server WebSocket closed unexpectedly'))
      }
    })
  })
}

export async function getDotRateLimits(accountId: string): Promise<unknown> {
  return withAppServerWs(accountId, ({ call }) => call('account/rateLimits/read', {}))
}

export async function listDotModels(accountId: string): Promise<unknown> {
  return withAppServerWs(accountId, ({ call }) =>
    call('model/list', { includeHidden: true, cursor: null, limit: 100 })
  )
}

export async function getDotThreadGoal(accountId: string, threadId?: string): Promise<unknown> {
  const acc = getStoredDotAccount(accountId)
  const tid = threadId || acc?.threadId
  if (!tid) return { goal: null }
  return withAppServerWs(accountId, ({ call }) =>
    call('thread/goal/get', { threadId: tid })
  ).catch(() => ({ goal: null }))
}

export async function setDotThreadGoal(
  accountId: string,
  goal: string,
  threadId?: string
): Promise<unknown> {
  const acc = getStoredDotAccount(accountId)
  const tid = threadId || acc?.threadId
  if (!tid) throw new DotApiError(400, 'threadId required')
  return withAppServerWs(accountId, ({ call }) =>
    call('thread/goal/set', { threadId: tid, goal })
  )
}

export async function clearDotThreadGoal(accountId: string, threadId?: string): Promise<unknown> {
  const acc = getStoredDotAccount(accountId)
  const tid = threadId || acc?.threadId
  if (!tid) throw new DotApiError(400, 'threadId required')
  return withAppServerWs(accountId, ({ call }) =>
    call('thread/goal/clear', { threadId: tid })
  )
}

/**
 * Stream a native turn directly on `wss://codex-cloud-backend.chatgpt.com/` using `gpt-6-astra`
 * (or any Sol/Luna/Terra model), emitting token-by-token deltas (`item/agentMessage/delta`) and
 * tool call status (`item/started` / `item/completed`).
 */
export async function streamDotNativeTurn(
  accountId: string,
  opts: {
    text: string
    model?: string
    effort?: string
    onDelta?: (args: {
      messageId: string
      text: string
      done: boolean
      tools?: MuseToolCallView[]
      richWidgets?: MuseRichWidgetView[]
    }) => void
    onActivity?: (code: string, text: string | undefined, busy: boolean) => void
  }
): Promise<{ messageId: string; text: string; threadId: string; tools: MuseToolCallView[] }> {
  const acc = await ensureValidDotAccount(accountId)
  const model = opts.model || acc.model || 'gpt-6-astra'
  const effort = opts.effort || acc.effort || 'medium'

  return withAppServerWs(
    accountId,
    async ({ call, ws }) => {
      opts.onActivity?.('thinking', `Running ${model}…`, true)
      const started = (await call('thread/start', {
        model,
        serviceTier: 'fast',
        approvalPolicy: 'never'
      })) as { thread?: { id?: string } }
      const threadId = started?.thread?.id || randomUUID()

      const sessionState: ActiveNativeSession = { ws, threadId }
      activeNativeSessions.set(accountId, sessionState)

      let messageId = `dot_native_${randomUUID()}`
      let fullText = ''
      const toolsMap = new Map<string, MuseToolCallView>()

      return new Promise<{
        messageId: string
        text: string
        threadId: string
        tools: MuseToolCallView[]
      }>((resolve, reject) => {
        const onMsg = (data: WebSocket.RawData) => {
          try {
            const frame = JSON.parse(data.toString()) as {
              method?: string
              params?: Record<string, unknown>
            }
            if (!frame.method) return
            const p = frame.params ?? {}

            if (frame.method === 'turn/started') {
              const turn = p['turn'] as { id?: string } | undefined
              if (turn?.id) sessionState.turnId = turn.id
            } else if (frame.method === 'item/started') {
              const item = p['item'] as Record<string, unknown> | undefined
              if (!item) return
              const itemType = String(item['type'] ?? '')
              const itemId = String(item['id'] ?? randomUUID())
              if (itemType === 'agentMessage') {
                messageId = `dot_${itemId}`
              } else if (itemType !== 'userMessage' && itemType !== 'reasoning') {
                toolsMap.set(itemId, {
                  id: itemId,
                  name: String(item['tool'] ?? item['command'] ?? itemType),
                  status: 'running',
                  summary: typeof item['command'] === 'string' ? item['command'] : undefined
                })
                opts.onActivity?.('tool', `Running ${itemType}…`, true)
                opts.onDelta?.({
                  messageId,
                  text: fullText,
                  done: false,
                  tools: [...toolsMap.values()]
                })
              }
            } else if (frame.method === 'item/agentMessage/delta') {
              const delta = typeof p['delta'] === 'string' ? p['delta'] : ''
              if (delta) {
                fullText += delta
                opts.onDelta?.({
                  messageId,
                  text: fullText,
                  done: false,
                  ...(toolsMap.size > 0 ? { tools: [...toolsMap.values()] } : {})
                })
              }
            } else if (frame.method === 'item/completed') {
              const item = p['item'] as Record<string, unknown> | undefined
              if (!item) return
              const itemType = String(item['type'] ?? '')
              const itemId = String(item['id'] ?? '')
              if (itemType === 'agentMessage') {
                const finalItemText = typeof item['text'] === 'string' ? item['text'] : ''
                if (finalItemText && finalItemText.length >= fullText.length) {
                  fullText = finalItemText
                }
              } else if (toolsMap.has(itemId)) {
                const prev = toolsMap.get(itemId)!
                toolsMap.set(itemId, { ...prev, status: 'completed' })
              }
            } else if (frame.method === 'turn/completed') {
              ws.off('message', onMsg)
              activeNativeSessions.delete(accountId)
              opts.onActivity?.('idle', undefined, false)
              opts.onDelta?.({
                messageId,
                text: fullText,
                done: true,
                ...(toolsMap.size > 0 ? { tools: [...toolsMap.values()] } : {})
              })
              resolve({
                messageId,
                text: fullText,
                threadId,
                tools: [...toolsMap.values()]
              })
            }
          } catch {
            /* ignore */
          }
        }

        ws.on('message', onMsg)

        call('turn/start', {
          threadId,
          input: [{ type: 'text', text: opts.text }],
          model,
          effort,
          serviceTier: 'fast'
        }).catch((err) => {
          ws.off('message', onMsg)
          activeNativeSessions.delete(accountId)
          opts.onActivity?.('idle', undefined, false)
          reject(err)
        })
      })
    },
    120_000
  )
}

// ============================================================================
// Library & Dynamic Pages (`/backend-api/files/library/nodes` & `/backend-api/pages`)
// ============================================================================

export async function listDotLibraryNodes(accountId: string, limit = 25): Promise<unknown> {
  return callDotApi(accountId, {
    method: 'GET',
    path: '/files/library/nodes',
    query: {
      limit: String(limit),
      include_pages: 'true'
    }
  })
}

export async function createDotPage(
  accountId: string,
  title: string,
  layout: 'document' | 'spatial' = 'document'
): Promise<unknown> {
  return callDotApi(accountId, {
    method: 'POST',
    path: '/pages',
    body: {
      title: title.trim() || 'Untitled Page',
      layout
    }
  })
}

export async function deleteDotPage(accountId: string, pageId: string): Promise<unknown> {
  return callDotApi(accountId, {
    method: 'DELETE',
    path: `/pages/${encodeURIComponent(pageId)}`
  })
}

// ============================================================================
// Dot Root Thread Status & Cross-Account Memory Export / Migration
// ============================================================================

/**
 * Whether Dot's root thread is still working. `null` means unknown (no
 * thread id, or the read failed); callers must not treat that as idle,
 * because idle triggers an automatic follow-up message.
 */
export async function isDotRootThreadBusy(accountId: string, threadId?: string): Promise<boolean | null> {
  const acc = getStoredDotAccount(accountId)
  const tid = threadId || acc?.threadId
  if (!tid) return null
  try {
    const res = (await withAppServerWs(
      accountId,
      ({ call }) => call('thread/read', { threadId: tid }),
      6_000
    )) as { thread?: { status?: { type?: string } } }
    const statusType = String(res?.thread?.status?.type ?? 'idle').toLowerCase()
    return statusType !== 'idle' && statusType !== 'ready' && statusType !== 'completed'
  } catch {
    return null
  }
}

export interface DotMemorySnapshotResult {
  markdown: string
  goal?: string
  globalMemoriesCount: number
  roomMessagesCount: number
  sourceHandle?: string
  sourceDotId?: string
  exportedAt: string
}

/**
 * Export a portable Markdown memory snapshot for a Dot account:
 * - `mode === 'deep'`: asks Dot (`aeon`) in its Calpico Room to compile a structured `# Dot 记忆快照`
 *   distinguishing user-stated facts from account history, then merges global `/backend-api/memories` & `thread/goal`.
 * - `mode === 'fast'` (default): immediately extracts any existing `# Dot 记忆快照` from the room,
 *   global `/backend-api/memories`, `thread/goal/get`, and recent room context without waiting 35s.
 */
export async function exportDotMemorySnapshot(
  accountId: string,
  opts?: {
    mode?: 'fast' | 'deep'
    dotId?: string
    roomId?: string
    onActivity?: (code: string, text: string | undefined, busy: boolean) => void
  }
): Promise<DotMemorySnapshotResult> {
  const acc = await ensureValidDotAccount(accountId)
  const mode = opts?.mode ?? 'fast'

  if (mode === 'deep') {
    opts?.onActivity?.('thinking', '正在请求 Dot (aeon) 整理完整记忆快照…', true)
    await sendAndWatchDotRoomReply(accountId, {
      dotId: opts?.dotId ?? acc.activeDotId,
      roomId: opts?.roomId ?? acc.roomId,
      timeoutMs: 75_000,
      text: '请把你目前记得的所有关于我的信息整理成一份结构化的 Markdown 记忆快照（以 `# Dot 记忆快照` 开头，包含：1. 身份 2. 项目与技术栈 3. 语言与回复偏好 4. 待办与目标 5. 历史重要上下文），并区分我明确告诉你的信息与账号历史背景，方便我备份或跨账号迁移。',
      onActivity: opts?.onActivity
    }).catch(() => undefined)
  }

  const [memRes, goalRes, roomRes] = await Promise.all([
    callDotApi<{
      memories?: Array<{ id?: string; content?: string; updated_at?: string }>
    }>(accountId, { method: 'GET', path: '/memories' }).catch(() => null),
    getDotThreadGoal(accountId, acc.threadId).catch(() => null),
    listRoomMessages(accountId, {
      roomId: opts?.roomId ?? acc.roomId,
      dotId: opts?.dotId ?? acc.activeDotId,
      limit: 40
    }).catch(() => ({ roomId: acc.roomId || '', messages: [] as DotRoomMessage[] }))
  ])

  const globalMemories = Array.isArray(memRes?.memories)
    ? memRes.memories.filter((m) => typeof m?.content === 'string' && m.content.trim())
    : []

  const goalObj =
    goalRes && typeof goalRes === 'object' ? (goalRes as Record<string, unknown>) : null
  const goalStr = typeof goalObj?.['goal'] === 'string' ? goalObj['goal'].trim() : ''

  // Find the latest `# Dot 记忆快照` compiled by Dot in the room (messages are newest-first or chronological; sort by createdAtMs)
  const sortedMsgs = [...roomRes.messages].sort((a, b) => a.createdAtMs - b.createdAtMs)
  const snapshotMsgs = sortedMsgs.filter(
    (m) =>
      m.role === 'bot' &&
      (m.text.includes('# Dot 记忆快照') ||
        (m.text.includes('## 1. 身份') && m.text.includes('## 2. 项目')))
  )
  const latestDotSnapshot =
    snapshotMsgs.length > 0 ? snapshotMsgs[snapshotMsgs.length - 1]!.text.trim() : ''

  const exportedAt = new Date().toISOString()
  const lines: string[] = []

  if (latestDotSnapshot) {
    lines.push(latestDotSnapshot)
    lines.push('')
    lines.push('---')
    lines.push(
      `> 元信息：导出自账号 \`${acc.email || acc.displayName || accountId}\` (${acc.planType || 'dot'}) · Dot \`${acc.activeDotId || 'default'}\` · ${exportedAt}`
    )
  } else {
    lines.push('# Dot 记忆快照')
    lines.push(
      `> 导出自账号 \`${acc.email || acc.displayName || accountId}\` (${acc.planType || 'dot'}) · Dot \`${acc.activeDotId || 'default'}\` · ${exportedAt}`
    )
  }

  if (goalStr) {
    lines.push('')
    lines.push('## 长期目标 (Thread Goal)')
    lines.push(`- ${goalStr}`)
  }

  if (globalMemories.length > 0) {
    lines.push('')
    lines.push('## ChatGPT 全局记忆库 (/backend-api/memories)')
    for (const m of globalMemories) {
      lines.push(`- ${m.content!.trim()}`)
    }
  }

  if (!latestDotSnapshot && sortedMsgs.length > 0) {
    lines.push('')
    lines.push('## 近期关键对话记录 (Calpico Room)')
    const recent = sortedMsgs.slice(-14)
    for (const m of recent) {
      const speaker = m.role === 'user' ? '用户' : 'Dot'
      const clean = m.text.replace(/\n{3,}/g, '\n\n').trim()
      lines.push(`- **${speaker}**：${clean}`)
    }
  }

  return {
    markdown: lines.join('\n').trim(),
    goal: goalStr || undefined,
    globalMemoriesCount: globalMemories.length,
    roomMessagesCount: sortedMsgs.length,
    sourceHandle: acc.email || acc.displayName,
    sourceDotId: acc.activeDotId,
    exportedAt
  }
}

/**
 * Import / migrate a `# Dot 记忆快照` Markdown document into the target Dot account:
 * 1. Restores `thread/goal/set` if a goal is present.
 * 2. Sends a structured memory-injection turn to the target Dot's Calpico Room so Dot (`aeon`)
 *    persists the user's identity, projects, preferences, and context in its long-term memory.
 */
export async function importDotMemorySnapshot(
  accountId: string,
  opts: {
    markdown: string
    goal?: string
    botId?: string
    dotId?: string
    roomId?: string
    onActivity?: (code: string, text: string | undefined, busy: boolean) => void
    onMessage?: (msg: DotRoomMessage, done: boolean) => void
  }
): Promise<{
  roomId: string
  sentMessage: DotRoomMessage
  replies: DotRoomMessage[]
  goalRestored?: string
}> {
  const markdown = opts.markdown.trim()
  if (!markdown) {
    throw new DotApiError(400, '记忆快照内容不能为空')
  }

  // Extract goal from markdown if not explicitly passed
  let goalToRestore = opts.goal?.trim()
  if (!goalToRestore) {
    const goalMatch = markdown.match(/##\s*长期目标[^\n]*\n+-\s*([^\n]+)/)
    if (goalMatch?.[1]) {
      goalToRestore = goalMatch[1].trim()
    }
  }

  if (goalToRestore) {
    await setDotThreadGoal(accountId, goalToRestore).catch(() => undefined)
  }

  const injectionPrompt = [
    '【Dot 跨账号记忆迁移与上下文注入】',
    '以下是我从上一个 Dot 账号导出的 `# Dot 记忆快照`。请将其中关于我的身份、项目与技术栈、语言与回复偏好、待办与长期目标以及关键上下文完整记入你的长期记忆中，并在后续所有对话中直接沿用（请用简明中文回复确认你已记住的核心要点）：',
    '',
    markdown
  ].join('\n')

  const result = await sendAndWatchDotRoomReply(accountId, {
    botId: opts.botId,
    dotId: opts.dotId,
    roomId: opts.roomId,
    text: injectionPrompt,
    timeoutMs: 75_000,
    onActivity: opts.onActivity,
    onMessage: opts.onMessage
  })

  return {
    ...result,
    goalRestored: goalToRestore
  }
}

