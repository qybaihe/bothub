import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { WEB_VIEW_CHANNELS, type CreateWebViewRequest, type WebViewBounds } from '@shared/ipc'
import { WebContentsViewManager } from './webContentsViewManager'

/** One manager per window, keyed by the window's own webContents id. */
const managers = new Map<number, WebContentsViewManager>()

export function attachWebViewManager(window: BrowserWindow): WebContentsViewManager {
  const manager = new WebContentsViewManager(window)
  const senderId = window.webContents.id
  managers.set(senderId, manager)
  window.on('closed', () => managers.delete(senderId))
  return manager
}

function managerFor(event: IpcMainEvent | IpcMainInvokeEvent): WebContentsViewManager {
  // Only windows we created (and registered) may control web views.
  const manager = managers.get(event.sender.id)
  if (!manager) throw new Error('Web views are not available for this sender')
  return manager
}

// IPC payloads come from the renderer: validate shapes before use.

function parseString(value: unknown, field: string, maxLength = 256): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`Invalid ${field}`)
  }
  return value
}

function parseOptionalString(value: unknown, field: string, maxLength: number): string | undefined {
  return value === undefined ? undefined : parseString(value, field, maxLength)
}

function parseCreateRequest(value: unknown): CreateWebViewRequest {
  if (typeof value !== 'object' || value === null) throw new TypeError('Invalid web view request')
  const request = value as Record<string, unknown>
  return {
    botId: parseString(request['botId'], 'botId'),
    accountId: parseString(request['accountId'], 'accountId'),
    url: parseOptionalString(request['url'], 'url', 2048),
    label: parseOptionalString(request['label'], 'label', 200)
  }
}

function parseBounds(value: unknown): WebViewBounds {
  if (typeof value !== 'object' || value === null) throw new TypeError('Invalid bounds')
  const b = value as Record<string, unknown>
  const numbers = [b['x'], b['y'], b['width'], b['height']]
  if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n))) throw new TypeError('Invalid bounds')
  const [x, y, width, height] = numbers as number[]
  return { x: x!, y: y!, width: width!, height: height! }
}

let registered = false

/** Register web view IPC handlers once for the whole app. */
export function registerWebViewIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(WEB_VIEW_CHANNELS.create, (event, request: unknown) =>
    managerFor(event).create(parseCreateRequest(request))
  )

  ipcMain.handle(WEB_VIEW_CHANNELS.attach, (event, viewId: unknown, bounds: unknown) =>
    managerFor(event).attach(parseString(viewId, 'viewId', 600), parseBounds(bounds))
  )

  // High-frequency and fire-and-forget: ignore malformed or stale updates.
  ipcMain.on(WEB_VIEW_CHANNELS.resize, (event, viewId: unknown, bounds: unknown) => {
    const manager = managers.get(event.sender.id)
    if (!manager || typeof viewId !== 'string') return
    try {
      manager.resize(viewId, parseBounds(bounds))
    } catch {
      // ignore
    }
  })

  ipcMain.handle(WEB_VIEW_CHANNELS.detach, (event, viewId: unknown) => {
    managerFor(event).detach(parseString(viewId, 'viewId', 600))
  })

  ipcMain.handle(WEB_VIEW_CHANNELS.destroy, (event, viewId: unknown) => {
    managerFor(event).destroy(parseString(viewId, 'viewId', 600))
  })

  ipcMain.handle(WEB_VIEW_CHANNELS.clearPartition, async (event, accountId: unknown) => {
    await managerFor(event).clearPartition(parseString(accountId, 'accountId'))
  })
}
