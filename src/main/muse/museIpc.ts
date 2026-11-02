import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { MUSE_CHANNELS, type MuseEnsureRequest, type MuseRpcRequest, type WebViewBounds } from '@shared/ipc'
import { WebContentsViewManager } from '../webContentsViewManager'
import { MuseSessionManager } from './museSessionManager'

const managers = new Map<number, MuseSessionManager>()

export function attachMuseSessionManager(window: BrowserWindow, views: WebContentsViewManager): MuseSessionManager {
  const manager = new MuseSessionManager(window, views)
  managers.set(window.webContents.id, manager)
  window.on('closed', () => managers.delete(window.webContents.id))

  // Forward muse events to the renderer that owns this window.
  manager.onEvent((event) => {
    if (!window.isDestroyed()) window.webContents.send(MUSE_CHANNELS.event, event)
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
    return managerFor(event).rpc(v.accountId, v.method, v.params)
  })

  ipcMain.handle(MUSE_CHANNELS.status, (event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return managerFor(event).getStatus(accountId) ?? null
  })
}
