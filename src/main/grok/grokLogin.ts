import { BrowserWindow, session as electronSession, shell } from "electron"
import { randomUUID } from "node:crypto"
import { partitionForAccount } from "../webContentsViewManager"
import { setGrokMainAuth } from "./grokAuthStore"

const LOGIN_URL = "https://authenticator.cursor.sh"
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
  // user_<id>::<jwt>
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

function looksLikeJwt(value: string): boolean {
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(value)
}

function extractTokenFromObject(obj: unknown, depth = 0): string | null {
  if (depth > 6 || obj == null) return null
  if (typeof obj === "string") {
    const fromCookie = accessTokenFromWorkosCookie(obj)
    if (fromCookie) return fromCookie.accessToken
    if (looksLikeJwt(obj)) return obj
    return null
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = extractTokenFromObject(item, depth + 1)
      if (hit) return hit
    }
    return null
  }
  if (typeof obj === "object") {
    const rec = obj as Record<string, unknown>
    for (const key of ["accessToken", "access_token", "token", "jwt"]) {
      const v = rec[key]
      if (typeof v === "string") {
        const hit = extractTokenFromObject(v, depth + 1)
        if (hit) return hit
      }
    }
    for (const v of Object.values(rec)) {
      const hit = extractTokenFromObject(v, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

/**
 * Open Cursor/Grok authenticator in a BrowserWindow sharing the account
 * partition. On success, capture accessToken from WorkosCursorSessionToken
 * (or auth JSON / storage) into Hub memory — never Keychain / sand-secrets.
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
  const machineId = randomUUID()

  const win = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: "使用 Grok Bot 登录",
    backgroundColor: "#f7f7f8",
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

  const finish = (accessToken: string, accountSlot?: string): void => {
    if (settling || win.isDestroyed()) return
    if (!accessToken || accessToken.length < 20) return
    settling = true
    setGrokMainAuth({
      accountId,
      accessToken,
      accountSlot,
      machineId
    })
    const payload: GrokAuthCaptured = { accountId, accessToken, accountSlot, machineId }
    try {
      captureListener?.(payload)
    } catch (error) {
      console.error("[grok] auth capture listener failed", error)
    }
    if (!win.isDestroyed()) win.close()
  }

  const tryCookies = async (): Promise<boolean> => {
    try {
      const cookies = await ses.cookies.get({})
      for (const cookie of cookies) {
        if (!TOKEN_COOKIE_NAMES.has(cookie.name) && !/workos.*session|cursor.*session/i.test(cookie.name)) {
          continue
        }
        if (cookie.name.endsWith(".sig")) continue
        const parsed = accessTokenFromWorkosCookie(cookie.value)
        if (parsed) {
          finish(parsed.accessToken, parsed.accountSlot)
          return true
        }
      }
    } catch (error) {
      console.error("[grok] cookie read failed", error)
    }
    return false
  }

  const tryStorage = async (): Promise<boolean> => {
    if (win.isDestroyed()) return false
    try {
      const found = (await win.webContents.executeJavaScript(`(() => {
        const out = []
        const scan = (store, label) => {
          try {
            for (let i = 0; i < store.length; i++) {
              const k = store.key(i)
              const v = store.getItem(k)
              if (!v) continue
              if (/accessToken|access_token|WorkosCursorSessionToken|cursorAuth/i.test(k) || /eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/.test(v)) {
                out.push({ label, key: k, value: v.slice(0, 4000) })
              }
            }
          } catch {}
        }
        scan(localStorage, "local")
        scan(sessionStorage, "session")
        return out
      })()`)) as Array<{ key: string; value: string }>
      for (const item of found || []) {
        try {
          const asJson = JSON.parse(item.value) as unknown
          const fromJson = extractTokenFromObject(asJson)
          if (fromJson) {
            finish(fromJson)
            return true
          }
        } catch {
          /* not json */
        }
        const parsed = accessTokenFromWorkosCookie(item.value)
        if (parsed) {
          finish(parsed.accessToken, parsed.accountSlot)
          return true
        }
        if (looksLikeJwt(item.value)) {
          finish(item.value)
          return true
        }
      }
    } catch {
      /* page may not allow */
    }
    return false
  }

  const tryCapture = async (): Promise<void> => {
    if (settling || win.isDestroyed()) return
    if (await tryCookies()) return
    await tryStorage()
  }

  const onNav = (): void => {
    void tryCapture()
  }
  win.webContents.on("did-finish-load", onNav)
  win.webContents.on("did-navigate", onNav)
  win.webContents.on("did-navigate-in-page", onNav)
  win.webContents.on("did-redirect-navigation", onNav)

  const onCookie = (
    _event: unknown,
    cookie: { name: string },
    _cause: string,
    removed: boolean
  ): void => {
    if (removed) return
    if (
      TOKEN_COOKIE_NAMES.has(cookie.name) ||
      /workos.*session|cursor.*session/i.test(cookie.name)
    ) {
      void tryCapture()
    }
  }
  ses.cookies.on("changed", onCookie)

  // Sniff Bearer tokens and JSON bodies on Cursor auth / API hosts.
  const filter = { urls: ["https://*.cursor.sh/*", "https://*.cursor.com/*", "https://api2.cursor.sh/*"] }
  // Response Authorization echo is rare; Bearer capture is via onBeforeSendHeaders.

  ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const headers = details.requestHeaders || {}
    const auth = headers["Authorization"] || headers["authorization"]
    if (typeof auth === "string" && /^Bearer\s+eyJ/i.test(auth)) {
      const token = auth.replace(/^Bearer\s+/i, "").trim()
      if (token.length > 40) finish(token)
    }
    callback({ requestHeaders: headers })
  })

  win.on("closed", () => {
    ses.cookies.off("changed", onCookie)
    loginWindows.delete(accountId)
  })

  // Poll cookies while the window is open (auth redirects can be quiet).
  const poll = setInterval(() => {
    if (win.isDestroyed() || settling) {
      clearInterval(poll)
      return
    }
    void tryCapture()
  }, 1500)
  win.on("closed", () => clearInterval(poll))

  await win.loadURL(LOGIN_URL)
}
