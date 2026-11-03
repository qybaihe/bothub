import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { UPDATE_CHANNELS, type UpdateStatusEvent } from '@shared/ipc'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let started = false
let lastInfo: UpdateInfo | null = null
let downloaded = false

function broadcast(event: UpdateStatusEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(UPDATE_CHANNELS.event, event)
  }
}

function configure(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Unsigned mac builds cannot apply Squirrel.Mac updates; still check + notify.
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => {
    broadcast({ type: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    lastInfo = info
    downloaded = false
    broadcast({
      type: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    broadcast({ type: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (progress) => {
    broadcast({
      type: 'downloading',
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    lastInfo = info
    downloaded = true
    broadcast({
      type: 'downloaded',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
    })
  })

  autoUpdater.on('error', (error) => {
    broadcast({ type: 'error', message: error?.message || String(error) })
  })
}

async function check(manual = false): Promise<void> {
  if (!app.isPackaged) {
    broadcast({
      type: 'error',
      message: manual ? 'Updates are only available in packaged builds.' : 'dev-skip'
    })
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    broadcast({ type: 'error', message })
  }
}

function installOrOpenRelease(): void {
  if (downloaded && process.platform !== 'darwin') {
    autoUpdater.quitAndInstall(false, true)
    return
  }

  // macOS unsigned: quitAndInstall needs a signed+notarized build. Fall back
  // to opening the GitHub release page so the user can install manually.
  if (process.platform === 'darwin') {
    try {
      autoUpdater.quitAndInstall(false, true)
      return
    } catch {
      // fall through
    }
  }

  const version = lastInfo?.version
  const url = version
    ? `https://github.com/qybaihe/bothub/releases/tag/v${version}`
    : 'https://github.com/qybaihe/bothub/releases/latest'
  void shell.openExternal(url)
  broadcast({
    type: 'error',
    message:
      'This build is not code-signed, so macOS cannot auto-install. Opened the release page instead.'
  })
}

export function registerUpdaterIpc(): void {
  ipcMain.handle(UPDATE_CHANNELS.check, async () => {
    await check(true)
    return { ok: true as const }
  })
  ipcMain.handle(UPDATE_CHANNELS.install, async () => {
    installOrOpenRelease()
    return { ok: true as const }
  })
  ipcMain.handle(UPDATE_CHANNELS.version, () => app.getVersion())
}

export function startAutoUpdater(): void {
  if (started) return
  started = true
  configure()

  // Delay first check so the window can load.
  setTimeout(() => {
    void check(false)
  }, 8_000)

  setInterval(() => {
    void check(false)
  }, CHECK_INTERVAL_MS)
}
