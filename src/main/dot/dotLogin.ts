import { BrowserWindow } from 'electron'
import { DOT_ORIGIN, getStoredDotAccount, trySyncFromElectronPartition } from './dotClient'

export type DotLoginEvent =
  | {
      accountId: string
      signedIn: true
      handle?: string
      displayName?: string
      planType?: string
      chatgptAccountId?: string
    }
  | {
      accountId: string
      signedIn: false
      windowClosed?: boolean
    }

const loginWindows = new Map<string, BrowserWindow>()
const loginListeners = new Set<(event: DotLoginEvent) => void>()

export function onDotLoginEvent(listener: (event: DotLoginEvent) => void): () => void {
  loginListeners.add(listener)
  return () => loginListeners.delete(listener)
}

function emitLogin(event: DotLoginEvent): void {
  for (const listener of loginListeners) {
    try {
      listener(event)
    } catch (err) {
      console.error('[dot] login listener failed', err)
    }
  }
}

export async function openDotLoginWindow(
  accountId: string,
  parent?: BrowserWindow
): Promise<void> {
  const existing = loginWindows.get(accountId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }

  const partition = `persist:bothub-account-${accountId}`
  const win = new BrowserWindow({
    width: 1020,
    height: 760,
    parent,
    title: 'Sign in to ChatGPT Dot (chatgpt.com/dots)',
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  loginWindows.set(accountId, win)
  let captured = false

  const pollSession = async () => {
    if (captured || win.isDestroyed()) return
    const synced = await trySyncFromElectronPartition(accountId)
    if (synced && synced.accessToken) {
      captured = true
      emitLogin({
        accountId,
        signedIn: true,
        handle: synced.email || synced.chatgptAccountId || accountId,
        displayName: synced.displayName || synced.email?.split('@')[0] || 'Dot',
        planType: synced.planType,
        chatgptAccountId: synced.chatgptAccountId
      })
      if (!win.isDestroyed()) win.close()
    }
  }

  const interval = setInterval(() => {
    void pollSession()
  }, 2000)

  win.webContents.on('did-navigate', () => {
    void pollSession()
  })

  win.on('closed', () => {
    clearInterval(interval)
    loginWindows.delete(accountId)
    if (!captured) {
      const existing = getStoredDotAccount(accountId)
      if (existing?.accessToken) {
        emitLogin({
          accountId,
          signedIn: true,
          handle: existing.email || existing.chatgptAccountId || accountId,
          displayName: existing.displayName || existing.email?.split('@')[0] || 'Dot',
          planType: existing.planType,
          chatgptAccountId: existing.chatgptAccountId
        })
      } else {
        emitLogin({
          accountId,
          signedIn: false,
          windowClosed: true
        })
      }
    }
  })

  await win.loadURL(`${DOT_ORIGIN}/dots`)
}

export async function cancelDotLogin(accountId: string): Promise<void> {
  const win = loginWindows.get(accountId)
  if (win && !win.isDestroyed()) {
    win.close()
  }
  loginWindows.delete(accountId)
}
