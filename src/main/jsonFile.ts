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
  renameWithRetry(tmp, path)
}

/** Windows antivirus/indexers briefly lock files (EPERM/EBUSY/EACCES). */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(from, to)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err
      const until = Date.now() + 50 * (attempt + 1)
      while (Date.now() < until) {
        /* short synchronous back-off; callers are sync */
      }
    }
  }
}

/**
 * Read JSON; a file that does not parse is moved aside (kept for recovery)
 * instead of being silently replaced on the next write.
 */
export function readJsonFile<T>(path: string, fallback: T, isValid: (raw: unknown) => boolean): T {
  if (!existsSync(path)) return fallback
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    // Unreadable right now (locked, permissions): not corrupt, keep the file.
    return fallback
  }
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
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
