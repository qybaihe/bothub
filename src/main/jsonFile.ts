import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Write JSON via a temp file + rename so a crash mid-write cannot leave a
 * truncated file behind (which used to read back as `{}` and then be
 * overwritten, losing every entry).
 */
export function writeJsonAtomic(path: string, data: unknown, mode = 0o600): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode })
  renameSync(tmp, path)
}

/**
 * Read JSON; a file that does not parse is moved aside (kept for recovery)
 * instead of being silently replaced on the next write.
 */
export function readJsonFile<T>(path: string, fallback: T, isValid: (raw: unknown) => boolean): T {
  if (!existsSync(path)) return fallback
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    try {
      renameSync(path, `${path}.corrupt-${Date.now()}`)
    } catch {
      /* best effort */
    }
    return fallback
  }
  return isValid(raw) ? (raw as T) : fallback
}
