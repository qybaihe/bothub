import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { UPDATE_CHANNELS, type UpdateStatusEvent } from '@shared/ipc'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
const RELEASES_LATEST = 'https://github.com/qybaihe/bothub/releases/latest'

let started = false
let lastInfo: UpdateInfo | null = null
let downloaded = false

/**
 * ShipIt (Squirrel.Mac) rejects unsigned / ad-hoc electron-builder artifacts
 * with "Code signature … did not pass validation". Until we ship Developer ID
 * signed + notarized builds, never auto-download or quitAndInstall on darwin —
 * only notify and open the GitHub release page for a manual install.
 *
 * Re-enable autoDownload / autoInstallOnAppQuit / quitAndInstall once signed.
 */
function canAutoInstall(): boolean {
  if (process.platform === 'darwin') return false
  return true
}

function releaseUrl(version?: string): string {
  return version
    ? `https://github.com/qybaihe/bothub/releases/tag/v${version}`
    : RELEASES_LATEST
}

function broadcast(event: UpdateStatusEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(UPDATE_CHANNELS.event, event)
  }
}

function openReleasePage(version?: string): void {
  void shell.openExternal(releaseUrl(version ?? lastInfo?.version))
}

function configure(): void {
  const auto = canAutoInstall()
  autoUpdater.autoDownload = auto
  autoUpdater.autoInstallOnAppQuit = auto
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
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      manualInstall: !auto
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
    const raw = error?.message || String(error)
    // ShipIt / codesign failures on unsigned builds — surface a clear manual path.
    if (/ShipIt|code signature|代码不含资源|did not pass validation/i.test(raw)) {
      broadcast({
        type: 'available',
        version: lastInfo?.version ?? app.getVersion(),
        manualInstall: true
      })
      return
    }
    broadcast({ type: 'error', message: raw })
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
    if (/ShipIt|code signature|代码不含资源|did not pass validation/i.test(message)) {
      broadcast({
        type: 'available',
        version: lastInfo?.version ?? app.getVersion(),
        manualInstall: true
      })
      return
    }
    broadcast({ type: 'error', message })
  }
}

function installOrOpenRelease(): void {
  if (canAutoInstall() && downloaded) {
    autoUpdater.quitAndInstall(false, true)
    return
  }
  openReleasePage(lastInfo?.version)
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
