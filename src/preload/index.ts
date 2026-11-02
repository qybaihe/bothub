import { contextBridge, ipcRenderer } from 'electron'
import type { BotHubBridge } from '@shared/bridge'
import { WEB_VIEW_CHANNELS } from '@shared/ipc'

const bridge: BotHubBridge = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? ''
  },
  webViews: {
    create: (request) => ipcRenderer.invoke(WEB_VIEW_CHANNELS.create, request),
    attach: (viewId, bounds) => ipcRenderer.invoke(WEB_VIEW_CHANNELS.attach, viewId, bounds),
    resize: (viewId, bounds) => ipcRenderer.send(WEB_VIEW_CHANNELS.resize, viewId, bounds),
    detach: (viewId) => ipcRenderer.invoke(WEB_VIEW_CHANNELS.detach, viewId),
    destroy: (viewId) => ipcRenderer.invoke(WEB_VIEW_CHANNELS.destroy, viewId)
  }
}

try {
  contextBridge.exposeInMainWorld('electron', bridge)
} catch (error) {
  console.error('[preload] failed to expose bridge', error)
}
