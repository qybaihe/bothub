/**
 * Sand client accessToken via official PKCE + poll login (Grok Bot.app flow).
 * Web WorkosCursorSessionToken only works for reads; writes need this token.
 * Tokens persist with Electron safeStorage in BotHub's own userData file.
 *
 * Spec: docs/grokbot-protocol/asar-scan/sand-token-flow.md
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, safeStorage } from 'electron'
import { partitionForAccount } from '../webContentsViewManager'

export const SAND_CLIENT_ID = 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB'
const API = 'https://api2.cursor.sh'
const REFRESH_MARGIN_MS = 5 * 60 * 1000

export interface SandTokens {
  accessToken: string
  refreshToken?: string
  authId?: string
  selectedTeamId?: string
}

// ---------------- PKCE ----------------
export function createPkce(): { verifier: string; challenge: string; uuid: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge, uuid: randomUUID() }
}

export function sandLoginUrl(challenge: string, uuid: string): string {
  const q = new URLSearchParams({
    challenge,
    uuid,
    mode: 'login',
    redirectTarget: 'sand',
    supportsSelectedTeamLogin: 'true'
  })
  return `https://cursor.com/loginDeepControl?${q.toString()}`
}

// ---------------- poll ----------------
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function parseSandTokens(raw: unknown): SandTokens | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const accessToken = typeof r['accessToken'] === 'string' ? r['accessToken'] : undefined
  if (!accessToken) return null
  return {
    accessToken,
    refreshToken: typeof r['refreshToken'] === 'string' ? r['refreshToken'] : undefined,
    authId: typeof r['authId'] === 'string' ? r['authId'] : undefined,
    selectedTeamId:
      typeof r['selectedTeamId'] === 'string'
        ? r['selectedTeamId']
        : typeof r['selectedTeamId'] === 'number'
          ? String(r['selectedTeamId'])
          : undefined
  }
}

/**
 * Poll api2 /auth/poll until tokens appear.
 * 404 → keep waiting; backoff 1s * 1.2^n cap 10s, max 150 attempts;
 * 3 consecutive non-404 errors abort.
 */
export async function pollSandAuth(
  uuid: string,
  verifier: string,
  opts: { isAborted?: () => boolean; maxAttempts?: number; fetchImpl?: typeof fetch } = {}
): Promise<SandTokens> {
  const max = opts.maxAttempts ?? 150
  const doFetch = opts.fetchImpl ?? fetch
  let consecutiveErrors = 0
  for (let attempt = 0; attempt < max; attempt++) {
    if (opts.isAborted?.()) throw new Error('sand login aborted')
    const delay = Math.min(1000 * Math.pow(1.2, attempt), 10000)
    if (attempt > 0) await sleep(delay)
    try {
      const url = `${API}/auth/poll?uuid=${encodeURIComponent(uuid)}&verifier=${encodeURIComponent(verifier)}`
      const res = await doFetch(url, { method: 'GET', headers: { accept: 'application/json' } })
      if (res.status === 404) {
        consecutiveErrors = 0
        continue
      }
      if (!res.ok) {
        consecutiveErrors++
        if (consecutiveErrors >= 3) throw new Error(`auth/poll failed ${res.status} (x${consecutiveErrors})`)
        continue
      }
      consecutiveErrors = 0
      const tokens = parseSandTokens(await res.json())
      if (tokens) return tokens
    } catch (e) {
      if (opts.isAborted?.()) throw new Error('sand login aborted')
      consecutiveErrors++
      if (consecutiveErrors >= 3) throw e instanceof Error ? e : new Error(String(e))
    }
  }
  throw new Error('sand login timed out')
}

// ---------------- refresh ----------------
export interface RefreshResult {
  tokens?: SandTokens
  shouldLogout: boolean
}

export async function refreshSandToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch
): Promise<RefreshResult> {
  const res = await fetchImpl(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: SAND_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  })
  // 400/401 → token revoked / rotated out: caller should re-login.
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    return { shouldLogout: true }
  }
  if (!res.ok) throw new Error(`oauth/token refresh failed ${res.status}`)
  const body = (await res.json()) as Record<string, unknown>
  const accessToken = typeof body['access_token'] === 'string' ? body['access_token'] : (body['accessToken'] as string)
  if (!accessToken) return { shouldLogout: true }
  const rotated = typeof body['refresh_token'] === 'string'
    ? (body['refresh_token'] as string)
    : typeof body['refreshToken'] === 'string'
      ? (body['refreshToken'] as string)
      : refreshToken // keep old when not rotated
  return {
    shouldLogout: false,
    tokens: {
      accessToken,
      refreshToken: rotated,
      selectedTeamId:
        typeof body['selectedTeamId'] === 'string' ? (body['selectedTeamId'] as string) : undefined
    }
  }
}

/** Decode JWT exp (seconds) without verifying. */
export function tokenExpMs(accessToken: string): number | null {
  try {
    const seg = accessToken.split('.')[1]
    if (!seg) return null
    const payload = JSON.parse(Buffer.from(seg, 'base64url').toString()) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

// ---------------- persistence (safeStorage only; fail closed) ----------------
interface StoredEntry {
  /** base64 of safeStorage.encryptString(JSON.stringify(tokens)) */
  enc: string
  /** legacy marker — never written; migrated or deleted on load */
  plain?: boolean
}
type StoreFile = Record<string, StoredEntry>

function storePath(): string {
  return join(app.getPath('userData'), 'grok-sand-tokens.json')
}

function readFile(): StoreFile {
  const p = storePath()
  if (!existsSync(p)) return {}
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as unknown
    return raw && typeof raw === 'object' ? (raw as StoreFile) : {}
  } catch {
    return {}
  }
}

function writeFile(store: StoreFile): void {
  const p = storePath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 })
}

function assertEncryptionAvailable(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption unavailable; refusing to store Grok tokens in plaintext')
  }
}

/** Encrypt and write sand tokens. Throws if safeStorage cannot encrypt. */
export function persistSandTokens(accountId: string, tokens: SandTokens): void {
  assertEncryptionAvailable()
  const store = readFile()
  store[accountId] = { enc: safeStorage.encryptString(JSON.stringify(tokens)).toString('base64') }
  writeFile(store)
}

/**
 * Decrypt sand tokens for an account.
 * Migrates any legacy `plain` entries to encrypted form when encryption is available;
 * otherwise deletes them (fail closed — never return plaintext-on-disk tokens).
 */
export function loadSandTokens(accountId: string): SandTokens | null {
  const store = readFile()
  const entry = store[accountId]
  if (!entry?.enc) return null
  try {
    const buf = Buffer.from(entry.enc, 'base64')
    if (entry.plain) {
      if (!safeStorage.isEncryptionAvailable()) {
        delete store[accountId]
        writeFile(store)
        return null
      }
      const tokens = parseSandTokens(JSON.parse(buf.toString('utf8')))
      if (!tokens) {
        delete store[accountId]
        writeFile(store)
        return null
      }
      store[accountId] = { enc: safeStorage.encryptString(JSON.stringify(tokens)).toString('base64') }
      writeFile(store)
      return tokens
    }
    if (!safeStorage.isEncryptionAvailable()) return null
    return parseSandTokens(JSON.parse(safeStorage.decryptString(buf)))
  } catch {
    return null
  }
}

export function clearSandTokens(accountId: string): void {
  const store = readFile()
  if (store[accountId]) {
    delete store[accountId]
    writeFile(store)
  }
}

/** Account ids that currently have a persisted sand-token blob. */
export function listPersistedSandAccountIds(): string[] {
  return Object.keys(readFile())
}

/** Force an oauth/token refresh regardless of expiry. Clears tokens on logout. */
export async function forceRefreshSandAccessToken(
  accountId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ accessToken: string; selectedTeamId?: string } | null> {
  const tokens = loadSandTokens(accountId)
  if (!tokens?.refreshToken) return null
  const result = await refreshSandToken(tokens.refreshToken, fetchImpl)
  if (result.shouldLogout) {
    clearSandTokens(accountId)
    return null
  }
  if (!result.tokens) return null
  const merged: SandTokens = {
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken ?? tokens.refreshToken,
    authId: tokens.authId,
    selectedTeamId: result.tokens.selectedTeamId ?? tokens.selectedTeamId
  }
  persistSandTokens(accountId, merged)
  return { accessToken: merged.accessToken, selectedTeamId: merged.selectedTeamId }
}

/** Return a valid accessToken, refreshing when within 5min of expiry. */
export async function getValidSandAccessToken(
  accountId: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ accessToken: string; selectedTeamId?: string } | null> {
  const tokens = loadSandTokens(accountId)
  if (!tokens?.accessToken) return null
  const expMs = tokenExpMs(tokens.accessToken)
  const needsRefresh = expMs != null && expMs - Date.now() < REFRESH_MARGIN_MS
  if (needsRefresh && tokens.refreshToken) {
    const result = await refreshSandToken(tokens.refreshToken, fetchImpl)
    if (result.shouldLogout) {
      clearSandTokens(accountId)
      return null
    }
    if (result.tokens) {
      const merged: SandTokens = {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken ?? tokens.refreshToken,
        authId: tokens.authId,
        selectedTeamId: result.tokens.selectedTeamId ?? tokens.selectedTeamId
      }
      persistSandTokens(accountId, merged)
      return { accessToken: merged.accessToken, selectedTeamId: merged.selectedTeamId }
    }
  }
  return { accessToken: tokens.accessToken, selectedTeamId: tokens.selectedTeamId }
}

// ---------------- interactive login window ----------------
const CONFIRM_SELECTORS = [
  'Yes, log in',
  'Yes, Log In',
  'Log in',
  'Confirm',
  'Authorize',
  'Continue'
]

const sandLoginWindows = new Map<string, BrowserWindow>()

export interface SandLoginResult {
  tokens: SandTokens
  clickedConfirm: boolean
}

/**
 * Open cursor.com/loginDeepControl in the account's grok partition and poll.
 * When the page only needs a confirm click (already signed-in session), click
 * it. Does NOT type credentials / codes — caller handles the needsInput case.
 */
export async function runSandLogin(
  accountId: string,
  opts: {
    parent?: BrowserWindow
    autoConfirm?: boolean
    show?: boolean
    onNeedsInput?: (detail: string) => void
    maxAttempts?: number
  } = {}
): Promise<SandLoginResult> {
  const existing = sandLoginWindows.get(accountId)
  if (existing && !existing.isDestroyed()) existing.close()

  const { verifier, challenge, uuid } = createPkce()
  const url = sandLoginUrl(challenge, uuid)
  const partition = partitionForAccount(`grok-${accountId}`)

  const win = new BrowserWindow({
    width: 980,
    height: 760,
    show: opts.show ?? true,
    title: '使用 Grok Bot 登录（sand）',
    backgroundColor: '#f7f7f8',
    autoHideMenuBar: true,
    parent: opts.parent && !opts.parent.isDestroyed() ? opts.parent : undefined,
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  sandLoginWindows.set(accountId, win)

  let closed = false
  win.on('closed', () => {
    closed = true
    sandLoginWindows.delete(accountId)
  })

  await win.loadURL(url)

  let clickedConfirm = false
  const tryConfirmClick = async (): Promise<void> => {
    if (closed || win.isDestroyed() || !opts.autoConfirm) return
    try {
      const clicked = (await win.webContents.executeJavaScript(
        `(() => {
          const wanted = ${JSON.stringify(CONFIRM_SELECTORS)};
          const els = Array.from(document.querySelectorAll('button, a, [role=button], input[type=submit]'));
          for (const el of els) {
            const txt = (el.innerText || el.value || el.textContent || '').trim();
            if (wanted.some((w) => txt.toLowerCase() === w.toLowerCase() || txt.toLowerCase().includes('yes, log in'))) {
              el.click();
              return txt;
            }
          }
          return '';
        })()`,
        true
      )) as string
      if (clicked) clickedConfirm = true
    } catch {
      /* page not ready */
    }
  }

  // Click confirm a few times across first seconds, in case page renders late.
  win.webContents.on('did-finish-load', () => void tryConfirmClick())
  const confirmTimers = [1200, 2500, 4000, 6500].map((ms) => setTimeout(() => void tryConfirmClick(), ms))

  try {
    const tokens = await pollSandAuth(uuid, verifier, {
      isAborted: () => closed,
      maxAttempts: opts.maxAttempts
    })
    persistSandTokens(accountId, tokens)
    return { tokens, clickedConfirm }
  } finally {
    confirmTimers.forEach(clearTimeout)
    if (!win.isDestroyed()) win.close()
  }
}
