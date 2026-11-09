import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { attachWebViewManager, registerWebViewIpc } from './webViewIpc'
import { attachMuseSessionManager, registerMuseIpc } from './muse/museIpc'
import { registerUpdaterIpc, startAutoUpdater } from './updater'
import { registerGrokIpc } from './grok/grokIpc'
import { registerHarkIpc } from './hark/harkIpc'
import { registerDotIpc } from './dot/dotIpc'
import { applyAllStoredProxies } from './muse/accountProxy'

const isMac = process.platform === 'darwin'
let mainWindow: BrowserWindow | null = null
let quitting = false

// Two instances share userData and race on every JSON store and on
// Chromium's profile; hand the second launch over to the first.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

// A stray rejection in a timer or IPC handler should be visible in logs,
// not silently swallowed. Only the error name/message is logged.
process.on('unhandledRejection', (reason) => {
  const text = reason instanceof Error ? `${reason.name}: ${reason.message}` : typeof reason
  console.error('[bothub] unhandled rejection:', text.slice(0, 300))
})

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 620,
    show: false,
    title: 'BotHub',
    backgroundColor: '#f7f7f8',
    autoHideMenuBar: true,
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 28 } } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Embedded platform web sessions (hidden until the renderer attaches one).
  const views = attachWebViewManager(win)
  attachMuseSessionManager(win, views)

  win.once('ready-to-show', () => win.show())

  // macOS: the red button hides the window instead of destroying it. A
  // re-created window used to start a second Muse session manager while the
  // old one kept its timers and gateways running (one leak per reopen).
  win.on('close', (event) => {
    if (isMac && !quitting) {
      event.preventDefault()
      // Hiding a fullscreen window leaves an empty black Space behind.
      if (win.isFullScreen()) {
        win.once('leave-full-screen', () => win.hide())
        win.setFullScreen(false)
      } else {
        win.hide()
      }
    }
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // Never open new Electron windows from the renderer; hand http(s) links to the OS.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // The app is a single page: block navigations (e.g. a file dropped onto the
  // window) that would replace the UI. Reloads are not affected.
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.on('before-quit', () => {
  quitting = true
})

app.whenReady().then(async () => {
  if (!gotLock) return
  // Before any partition loads: otherwise the first requests go direct.
  await Promise.race([applyAllStoredProxies(), new Promise((r) => setTimeout(r, 5_000))])
  registerWebViewIpc()
  registerMuseIpc()
  registerUpdaterIpc()
  registerGrokIpc()
  registerHarkIpc()
  registerDotIpc()
  mainWindow = createMainWindow()
  startAutoUpdater()

  app.on('activate', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
    else mainWindow = createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
