import { BrowserWindow, session as electronSession, shell } from "electron"
import { partitionForAccount } from "../webContentsViewManager"
import { setGrokMainAuth } from "./grokAuthStore"
import { getOrCreateGrokMachineId } from "./grokMachineId"
import { createPkce, persistSandTokens, pollSandAuth, sandLoginUrl } from "./grokSandAuth"

const ALLOWED =
  /^(authenticator\.cursor\.sh|prod\.authentication\.cursor\.sh|cursor\.com|www\.cursor\.com|x\.ai|accounts\.x\.ai|api2\.cursor\.sh)$/i

const TOKEN_COOKIE_NAMES = new Set([
  "WorkosCursorSessionToken",
  "workos_cursor_session_token",
  "WorkosCursorSessionToken.sig"
])

const loginWindows = new Map<string, BrowserWindow>()

export type GrokAuthCaptured = {
  accountId: string
  accessToken: string
  accountSlot?: string
  teamId?: string
  machineId: string
}

export type GrokAuthCaptureListener = (auth: GrokAuthCaptured) => void

let captureListener: GrokAuthCaptureListener | undefined

export function onGrokAuthCaptured(listener: GrokAuthCaptureListener): () => void {
  captureListener = listener
  return () => {
    if (captureListener === listener) captureListener = undefined
  }
}

function hostAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return (
      ALLOWED.test(host) ||
      host.endsWith(".cursor.sh") ||
      host.endsWith(".cursor.com") ||
      host.endsWith(".x.ai")
    )
  } catch {
    return false
  }
}

/** Decode WorkosCursorSessionToken → JWT (Bearer accessToken). */
export function accessTokenFromWorkosCookie(raw: string): { accessToken: string; accountSlot?: string } | null {
  if (!raw || !raw.trim()) return null
  let value = raw.trim()
  try {
    value = decodeURIComponent(value)
  } catch {
    /* keep raw */
  }
  const parts = value.split("::")
  if (parts.length >= 2) {
    const slot = parts[0]?.trim()
    const jwt = parts.slice(1).join("::").trim()
    if (jwt.startsWith("eyJ") && jwt.length > 40) {
      return { accessToken: jwt, accountSlot: slot || undefined }
    }
  }
  if (value.startsWith("eyJ") && value.length > 40) {
    return { accessToken: value }
  }
  return null
}

/**
 * Open Cursor/Grok official PKCE `loginDeepControl?redirectTarget=sand` in a
 * BrowserWindow sharing the account partition, and poll `api2.cursor.sh/auth/poll`
 * for the write-capable sand `{accessToken, refreshToken}` pair (persisted via
 * Electron safeStorage). Also keeps cookie/header fallback if user closes early
 * after signing in on web.
 */
export async function openGrokLoginWindow(accountId: string, parent?: BrowserWindow): Promise<void> {
  const existing = loginWindows.get(accountId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }

  const partition = partitionForAccount(`grok-${accountId}`)
  const ses = electronSession.fromPartition(partition)
  const machineId = getOrCreateGrokMachineId(accountId)
  const { verifier, challenge, uuid } = createPkce()
  const deepUrl = sandLoginUrl(challenge, uuid)

  const win = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: "使用 Grok Bot 登录 (Sand PKCE)",
    backgroundColor: "#f5f5f5",
    autoHideMenuBar: true,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    webPreferences: {
      partition,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  loginWindows.set(accountId, win)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (hostAllowed(url)) {
      void win.webContents.loadURL(url)
      return { action: "deny" }
    }
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: "deny" }
  })

  let settling = false
  let closed = false
  let fallbackCookieToken: { accessToken: string; accountSlot?: string } | null = null

  const finish = (
    accessToken: string,
    opts: { refreshToken?: string; accountSlot?: string; teamId?: string; fromPkce?: boolean } = {}
  ): void => {
    if (settling) return
    if (!accessToken || accessToken.length < 20) return
    settling = true
    setGrokMainAuth({
      accountId,
      accessToken,
      accountSlot: opts.accountSlot,
      teamId: opts.teamId,
      machineId
    })
    if (opts.fromPkce || opts.refreshToken) {
      void persistSandTokens(accountId, {
        accessToken,
        refreshToken: opts.refreshToken,
        authId: opts.accountSlot,
        selectedTeamId: opts.teamId
      }).catch((err) => console.warn("[grok] safeStorage persist failed", err))
    }
    const payload: GrokAuthCaptured = {
      accountId,
      accessToken,
      accountSlot: opts.accountSlot,
      teamId: opts.teamId,
      machineId
    }
    try {
      captureListener?.(payload)
    } catch (error) {
      console.error("[grok] auth capture listener failed", error)
    }
    if (!win.isDestroyed()) win.close()
  }

  // Primary path: official Sand PKCE /auth/poll
  void pollSandAuth(uuid, verifier, {
    isAborted: () => closed || settling,
    maxAttempts: 150
  })
    .then((tokens) => {
      finish(tokens.accessToken, {
        refreshToken: tokens.refreshToken,
        accountSlot: tokens.authId,
        teamId: tokens.selectedTeamId,
        fromPkce: true
      })
    })
    .catch(() => {
      /* if window closed after web login but before confirm click, use fallback cookie if available */
      if (!settling && fallbackCookieToken) {
        finish(fallbackCookieToken.accessToken, { accountSlot: fallbackCookieToken.accountSlot })
      }
    })

  // Record fallback web cookie in case user closes window right after login without clicking "Yes, log in"
  const checkCookiesForFallback = async (): Promise<void> => {
    if (settling || win.isDestroyed()) return
    try {
      const cookies = await ses.cookies.get({})
      for (const cookie of cookies) {
        if (!TOKEN_COOKIE_NAMES.has(cookie.name) && !/workos.*session|cursor.*session/i.test(cookie.name)) {
          continue
        }
        if (cookie.name.endsWith(".sig")) continue
        const parsed = accessTokenFromWorkosCookie(cookie.value)
        if (parsed) {
          fallbackCookieToken = parsed
          break
        }
      }
    } catch {
      /* ignore */
    }
  }

  win.webContents.on("did-finish-load", () => void checkCookiesForFallback())
  win.webContents.on("did-navigate", () => void checkCookiesForFallback())

  win.on("closed", () => {
    closed = true
    loginWindows.delete(accountId)
    if (!settling && fallbackCookieToken) {
      finish(fallbackCookieToken.accessToken, { accountSlot: fallbackCookieToken.accountSlot })
    }
  })

  await win.loadURL(deepUrl)
}
