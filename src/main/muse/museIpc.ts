import { ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { MUSE_CHANNELS, type MuseEnsureRequest, type MuseRpcRequest, type WebViewBounds } from '@shared/ipc'
import { WebContentsViewManager } from '../webContentsViewManager'
import { MuseSessionManager } from './museSessionManager'

const managers = new Map<number, MuseSessionManager>()

export function attachMuseSessionManager(window: BrowserWindow, views: WebContentsViewManager): MuseSessionManager {
  const manager = new MuseSessionManager(window, views)
  // Capture id before close: accessing window.webContents after 'closed' throws
  // TypeError: Object has been destroyed (seen on app quit).
  const senderId = window.webContents.id
  managers.set(senderId, manager)
  window.on('closed', () => managers.delete(senderId))

  // Forward muse events to the renderer that owns this window.
  manager.onEvent((event) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(MUSE_CHANNELS.event, event)
    }
  })
  return manager
}

function managerFor(event: IpcMainInvokeEvent): MuseSessionManager {
  const manager = managers.get(event.sender.id)
  if (!manager) throw new Error('Muse sessions are not available for this sender')
  return manager
}

function parseEnsure(value: unknown): MuseEnsureRequest {
  if (typeof value !== 'object' || value === null) throw new TypeError('Invalid muse ensure request')
  const v = value as Record<string, unknown>
  if (typeof v['botId'] !== 'string' || typeof v['accountId'] !== 'string') throw new TypeError('Invalid muse ensure request')
  return {
    botId: v['botId'],
    accountId: v['accountId'],
    show: v['show'] === true,
    bounds: v['bounds'] as WebViewBounds | undefined
  }
}

let registered = false

export function registerMuseIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(MUSE_CHANNELS.ensure, async (event, request: unknown) => {
    const req = parseEnsure(request)
    return managerFor(event).ensure(req.botId, req.accountId, { show: req.show, bounds: req.bounds })
  })

  ipcMain.handle(MUSE_CHANNELS.rpc, async (event, request: unknown) => {
    if (typeof request !== 'object' || request === null) throw new TypeError('Invalid muse rpc request')
    const v = request as MuseRpcRequest
    if (typeof v.accountId !== 'string' || typeof v.method !== 'string') throw new TypeError('Invalid muse rpc request')
    return managerFor(event).rpc(v.accountId, v.method, v.params, v.conversationId)
  })

  ipcMain.handle(MUSE_CHANNELS.status, (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return managerFor(event).getStatus(accountId) ?? null
  })

  ipcMain.handle(MUSE_CHANNELS.signOut, async (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    await managerFor(event).signOut(accountId)
  })

  ipcMain.handle(MUSE_CHANNELS.openLogin, async (event, request: unknown) => {
    const req = parseEnsure(request)
    return managerFor(event).openLogin(req.botId, req.accountId)
  })

  ipcMain.handle(MUSE_CHANNELS.cancelLogin, async (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    await managerFor(event).cancelLogin(accountId)
  })

  ipcMain.handle(MUSE_CHANNELS.getQuota, async (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return managerFor(event).getQuota(accountId)
  })

  ipcMain.handle(MUSE_CHANNELS.refreshQuota, async (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return managerFor(event).refreshQuota(accountId)
  })

  ipcMain.handle(MUSE_CHANNELS.listSchedules, async (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return managerFor(event).listSchedules(accountId)
  })

  ipcMain.handle(MUSE_CHANNELS.listScheduleRuns, async (event, accountId: unknown, jobId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    if (jobId !== undefined && typeof jobId !== 'string') throw new TypeError('Invalid jobId')
    return managerFor(event).listScheduleRuns(accountId, typeof jobId === 'string' ? jobId : undefined)
  })

  ipcMain.handle(MUSE_CHANNELS.runSchedule, async (event, accountId: unknown, jobId: unknown) => {
    if (typeof accountId !== 'string' || typeof jobId !== 'string') throw new TypeError('Invalid schedule run request')
    return managerFor(event).runSchedule(accountId, jobId)
  })

  ipcMain.handle(MUSE_CHANNELS.deleteSchedule, async (event, accountId: unknown, jobId: unknown) => {
    if (typeof accountId !== 'string' || typeof jobId !== 'string') throw new TypeError('Invalid schedule delete request')
    return managerFor(event).deleteSchedule(accountId, jobId)
  })

  ipcMain.handle(MUSE_CHANNELS.getInvite, async (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return managerFor(event).getInvite(accountId)
  })

  ipcMain.handle(MUSE_CHANNELS.refreshInvite, async (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return managerFor(event).refreshInvite(accountId)
  })

  ipcMain.handle(MUSE_CHANNELS.redeemInvite, async (event, accountId: unknown, code: unknown) => {
    if (typeof accountId !== 'string' || typeof code !== 'string') throw new TypeError('Invalid invite redeem request')
    return managerFor(event).redeemInvite(accountId, code)
  })

  ipcMain.handle(MUSE_CHANNELS.listSessions, async (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return managerFor(event).listSessions(accountId)
  })

  ipcMain.handle(MUSE_CHANNELS.mutateSession, async (event, accountId: unknown, mutation: unknown) => {
    if (typeof accountId !== 'string' || typeof mutation !== 'object' || mutation === null) {
      throw new TypeError('Invalid session mutation')
    }
    return managerFor(event).mutateSession(accountId, mutation as never)
  })

  ipcMain.handle(MUSE_CHANNELS.listFiles, async (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return managerFor(event).listFiles(accountId)
  })

  ipcMain.handle(MUSE_CHANNELS.listConnectors, async (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return managerFor(event).listConnectors(accountId)
  })

  ipcMain.handle(MUSE_CHANNELS.connectConnector, async (event, accountId: unknown, connectorId: unknown) => {
    if (typeof accountId !== 'string' || typeof connectorId !== 'string') {
      throw new TypeError('Invalid connector connect request')
    }
    return managerFor(event).connectConnector(accountId, connectorId)
  })

  ipcMain.handle(MUSE_CHANNELS.disconnectConnector, async (event, accountId: unknown, connectorId: unknown) => {
    if (typeof accountId !== 'string' || typeof connectorId !== 'string') {
      throw new TypeError('Invalid connector disconnect request')
    }
    return managerFor(event).disconnectConnector(accountId, connectorId)
  })

  ipcMain.handle(MUSE_CHANNELS.openExternal, async (_event, url: unknown) => {
    if (typeof url !== 'string' || !/^https:\/\/(muse\.ai|www\.muse\.ai)(\/|$)/i.test(url)) {
      throw new TypeError('Only https://muse.ai URLs can be opened')
    }
    await shell.openExternal(url)
    return { ok: true as const }
  })

  ipcMain.handle(MUSE_CHANNELS.openHttps, async (_event, url: unknown) => {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
      throw new TypeError('Only https URLs can be opened')
    }
    await shell.openExternal(url)
    return { ok: true as const }
  })
}
