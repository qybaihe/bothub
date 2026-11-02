import { contextBridge } from 'electron'
import type { BotHubBridge } from '@shared/bridge'

const bridge: BotHubBridge = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? ''
  }
}

try {
  contextBridge.exposeInMainWorld('electron', bridge)
} catch (error) {
  console.error('[preload] failed to expose bridge', error)
}
