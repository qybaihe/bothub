/// <reference types="vite/client" />
import type { BotHubBridge } from '@shared/bridge'

declare global {
  interface Window {
    /** Present only inside Electron (exposed by the preload script). */
    electron?: BotHubBridge
  }
}

export {}
