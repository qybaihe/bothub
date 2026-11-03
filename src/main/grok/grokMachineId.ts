/**
 * Stable per-account machineId for x-cursor-checksum.
 * Persisted under userData (not Keychain / sand-secrets).
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

type Store = Record<string, string>

function storePath(): string {
  return join(app.getPath('userData'), 'grok-machine-ids.json')
}

function readStore(): Store {
  const path = storePath()
  if (!existsSync(path)) return {}
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!raw || typeof raw !== 'object') return {}
    const out: Store = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim()
    }
    return out
  } catch {
    return {}
  }
}

function writeStore(store: Store): void {
  const path = storePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf8')
}

/** Return existing UUID for accountId or create + persist one. */
export function getOrCreateGrokMachineId(accountId: string): string {
  const store = readStore()
  const existing = store[accountId]
  if (existing) return existing
  const id = randomUUID()
  store[accountId] = id
  writeStore(store)
  return id
}

export function peekGrokMachineId(accountId: string): string | undefined {
  return readStore()[accountId]
}
