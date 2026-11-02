import { createMetaMuseMockAdapter } from './meta-muse/mock'
import { adapterRegistry, type AdapterRegistry } from './registry'

export { adapterRegistry, AdapterRegistry } from './registry'
export { PLATFORMS, getPlatform } from './platforms'
export * from './types'

/**
 * Register the adapters that ship with the app. Idempotent so it is safe
 * under React StrictMode and hot reloads.
 */
export function registerBuiltInAdapters(registry: AdapterRegistry = adapterRegistry): void {
  if (!registry.has('meta-muse')) registry.register(createMetaMuseMockAdapter())
}
