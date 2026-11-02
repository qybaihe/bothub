import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { attachWebViewManager, registerWebViewIpc } from './webViewIpc'

const isMac = process.platform === 'darwin'

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
  attachWebViewManager(win)

  win.once('ready-to-show', () => win.show())

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

app.whenReady().then(() => {
  registerWebViewIpc()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
