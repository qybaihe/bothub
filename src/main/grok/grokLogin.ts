import { BrowserWindow, shell } from 'electron'
import { partitionForAccount } from '../webContentsViewManager'

const LOGIN_URL = 'https://authenticator.cursor.sh'
const ALLOWED = /^(authenticator\.cursor\.sh|prod\.authentication\.cursor\.sh|cursor\.com|www\.cursor\.com|x\.ai|accounts\.x\.ai|api2\.cursor\.sh)$/i

const loginWindows = new Map<string, BrowserWindow>()

function hostAllowed(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return ALLOWED.test(host) || host.endsWith('.cursor.sh') || host.endsWith('.cursor.com') || host.endsWith('.x.ai')
  } catch {
    return false
  }
}

/**
 * Open Cursor/Grok authenticator in a BrowserWindow sharing the account
 * partition. Does not extract accessToken (safeStorage / Keychain out of
 * scope) — user completes 2FA here, then pastes token via setAccessToken.
 */
export async function openGrokLoginWindow(accountId: string, parent?: BrowserWindow): Promise<void> {
  const existing = loginWindows.get(accountId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }

  const partition = partitionForAccount(`grok-${accountId}`)
  const win = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: '使用 Grok Bot 登录',
    backgroundColor: '#f7f7f8',
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
      return { action: 'deny' }
    }
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('closed', () => loginWindows.delete(accountId))
  await win.loadURL(LOGIN_URL)
}
