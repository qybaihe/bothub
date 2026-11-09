import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { UPDATE_CHANNELS, type UpdateStatusEvent } from '@shared/ipc'
import { checkFailedMessage, interpretLatestRelease } from './updateCheck'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
const GITHUB_OWNER = 'qybaihe'
const GITHUB_REPO = 'bothub'
const RELEASES_LATEST = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
const GITHUB_API_LATEST = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

let started = false
let lastInfo: UpdateInfo | null = null
let latestVersionTag: string | null = null
let downloaded = false
let isManualCheck = false

/**
 * ShipIt (Squirrel.Mac) rejects unsigned / ad-hoc electron-builder artifacts
 * with "Code signature … did not pass validation". Until we ship Developer ID
 * signed + notarized builds, never auto-download or quitAndInstall on darwin —
 * only notify and open the GitHub release page for a manual install.
 */
function canAutoInstall(): boolean {
  if (process.platform === 'darwin') return false
  return true
}

function hasAppUpdateConfig(): boolean {
  try {
    return existsSync(join(process.resourcesPath, 'app-update.yml'))
  } catch {
    return false
  }
}

function normalizeSemver(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]!
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0)
}

function isNewerVersion(remote: string, current: string): boolean {
  const r = normalizeSemver(remote)
  const c = normalizeSemver(current)
  const len = Math.max(r.length, c.length, 3)
  for (let i = 0; i < len; i++) {
    const rv = r[i] ?? 0
    const cv = c[i] ?? 0
    if (rv > cv) return true
    if (rv < cv) return false
  }
  return false
}

function releaseUrl(version?: string): string {
  const clean = version?.replace(/^v/i, '')
  return clean
    ? `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/v${clean}`
    : RELEASES_LATEST
}

function broadcast(event: UpdateStatusEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send(UPDATE_CHANNELS.event, event)
  }
}

function openReleasePage(version?: string): void {
  void shell.openExternal(releaseUrl(version ?? latestVersionTag ?? lastInfo?.version))
}

async function checkViaGitHubApi(manual: boolean): Promise<void> {
  const currentVersion = app.getVersion()
  if (manual) {
    broadcast({ type: 'checking' })
  }
  try {
    const res = await fetch(GITHUB_API_LATEST, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `BotHub/${currentVersion}`
      },
      signal: AbortSignal.timeout(12_000)
    })
    const data = res.ok ? ((await res.json().catch(() => null)) as Parameters<typeof interpretLatestRelease>[1]) : null
    const outcome = interpretLatestRelease(res, data, currentVersion, isNewerVersion)
    if (outcome.type === 'available') {
      latestVersionTag = outcome.version
      broadcast({ type: 'available', version: outcome.version, releaseNotes: outcome.releaseNotes, manualInstall: true })
    } else if (manual) {
      // A failed check is not "no update": say it failed.
      broadcast(outcome.type === 'error' ? { type: 'error', message: outcome.message } : { type: 'not-available', version: currentVersion })
    }
  } catch (error) {
    if (manual) broadcast({ type: 'error', message: checkFailedMessage(error) })
  }
}

function configure(): void {
  const auto = canAutoInstall() && hasAppUpdateConfig()
  autoUpdater.autoDownload = auto
  autoUpdater.autoInstallOnAppQuit = auto
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => {
    if (isManualCheck) {
      broadcast({ type: 'checking' })
    }
  })

  autoUpdater.on('update-available', (info) => {
    lastInfo = info
    latestVersionTag = info.version
    downloaded = false
    broadcast({
      type: 'available',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      manualInstall: !auto
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    if (isManualCheck) {
      broadcast({ type: 'not-available', version: info.version || app.getVersion() })
    }
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
    latestVersionTag = info.version
    downloaded = true
    broadcast({
      type: 'downloaded',
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
    })
  })

  autoUpdater.on('error', (error) => {
    const raw = error?.message || String(error)
    if (/ShipIt|code signature|代码不含资源|did not pass validation/i.test(raw)) {
      broadcast({
        type: 'available',
        version: latestVersionTag ?? lastInfo?.version ?? app.getVersion(),
        manualInstall: true
      })
      return
    }
    // Missing app-update.yml / 404 latest-mac.yml / no published releases: fall back to GitHub API check
    if (/app-update\.yml|ENOENT|404|latest-mac\.yml|latest\.yml|No published versions|Cannot find/i.test(raw)) {
      void checkViaGitHubApi(isManualCheck)
      return
    }
    if (isManualCheck) {
      broadcast({ type: 'error', message: raw })
    }
  })
}

async function check(manual = false): Promise<void> {
  isManualCheck = manual
  // On macOS or when app-update.yml is not bundled, use the lightweight GitHub Releases API check
  // so it never throws ENOENT on app-update.yml or 404 on latest-mac.yml.
  if (!app.isPackaged || process.platform === 'darwin' || !hasAppUpdateConfig()) {
    await checkViaGitHubApi(manual)
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    await checkViaGitHubApi(manual)
  }
}

function installOrOpenRelease(): void {
  if (canAutoInstall() && downloaded) {
    autoUpdater.quitAndInstall(false, true)
    return
  }
  openReleasePage(latestVersionTag ?? lastInfo?.version)
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

  // Delay first background check so the window can load.
  setTimeout(() => {
    void check(false)
  }, 8_000)

  setInterval(() => {
    void check(false)
  }, CHECK_INTERVAL_MS)
}
