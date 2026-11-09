/**
 * Stable per-account machineId for x-cursor-checksum.
 * Persisted under userData (not Keychain / sand-secrets).
 */
import { randomUUID } from 'node:crypto'
import { readJsonFile, writeJsonAtomic } from '../jsonFile'
import { join } from 'node:path'
import { app } from 'electron'

type Store = Record<string, string>

function storePath(): string {
  return join(app.getPath('userData'), 'grok-machine-ids.json')
}

function readStore(): Store {
  // A corrupt file is moved aside instead of being overwritten (new machine
  // ids would make Grok treat every account as a new device).
  const raw = readJsonFile<Record<string, unknown>>(storePath(), {}, (r) => Boolean(r) && typeof r === 'object' && !Array.isArray(r))
  const out: Store = {}
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim()
  }
  return out
}

function writeStore(store: Store): void {
  writeJsonAtomic(storePath(), store)
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
  try {
    return readStore()[accountId]
  } catch {
    return undefined
  }
}
