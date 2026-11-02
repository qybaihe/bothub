import type { BotHubBridge } from '@shared/bridge'

/**
 * Safe accessor for the preload bridge. Returns `undefined` when the renderer
 * runs in a plain browser (`npm run dev:web`), so callers must handle that.
 */
export function getBridge(): BotHubBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.electron
}

export const isElectron = getBridge() !== undefined

export const runtimePlatform: string = getBridge()?.platform ?? 'web'
