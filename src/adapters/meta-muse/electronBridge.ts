import type { BotHubBridge } from '@shared/bridge'

/** Renderer-only accessor; adapters ship in the web bundle. */
export function getBotHubBridge(): BotHubBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return window.electron
}
