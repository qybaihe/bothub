import { PLATFORMS } from './platforms'
import type { PlatformAdapter, PlatformDescriptor, PlatformId } from './types'

/** Holds one adapter instance per platform. */
export class AdapterRegistry {
  private readonly adapters = new Map<PlatformId, PlatformAdapter>()

  register(adapter: PlatformAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter already registered for platform "${adapter.id}"`)
    }
    this.adapters.set(adapter.id, adapter)
  }

  has(id: PlatformId): boolean {
    return this.adapters.has(id)
  }

  get(id: PlatformId): PlatformAdapter | undefined {
    return this.adapters.get(id)
  }

  /** Like `get`, but throws when the platform has no adapter. */
  require(id: PlatformId): PlatformAdapter {
    const adapter = this.adapters.get(id)
    if (!adapter) throw new Error(`No adapter registered for platform "${id}"`)
    return adapter
  }

  list(): PlatformAdapter[] {
    return [...this.adapters.values()]
  }

  /** A platform is usable when it is released and has an adapter. */
  isAvailable(platform: PlatformDescriptor): boolean {
    return platform.availability === 'available' && this.adapters.has(platform.id)
  }

  /** Catalog entries annotated with whether they can be used right now. */
  listPlatforms(): Array<PlatformDescriptor & { usable: boolean }> {
    return PLATFORMS.map((platform) => ({ ...platform, usable: this.isAvailable(platform) }))
  }
}

/** App-wide registry instance. */
export const adapterRegistry = new AdapterRegistry()
