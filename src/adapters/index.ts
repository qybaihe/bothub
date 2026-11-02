import { createMetaMuseMockAdapter } from './meta-muse/mock'
import { createMuseAdapter } from './meta-muse/adapter'
import { adapterRegistry, type AdapterRegistry } from './registry'

export { adapterRegistry, AdapterRegistry } from './registry'
export { PLATFORMS, getPlatform } from './platforms'
export * from './types'

function useMockMuse(): boolean {
  try {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    return env?.['BOTHUB_USE_MOCK_MUSE'] === '1'
  } catch {
    return false
  }
}

/**
 * Register the adapters that ship with the app. Idempotent so it is safe
 * under React StrictMode and hot reloads.
 *
 * Default: real Muse adapter (Electron WebContentsView + sendRequest/DOM).
 * Set BOTHUB_USE_MOCK_MUSE=1 for the in-memory mock (also handy for pure web).
 */
export function registerBuiltInAdapters(registry: AdapterRegistry = adapterRegistry): void {
  if (registry.has('meta-muse')) return
  if (useMockMuse()) registry.register(createMetaMuseMockAdapter())
  else registry.register(createMuseAdapter())
}
