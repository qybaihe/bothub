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

/** The file exists but could not be read right now (locked, permissions). */
export class JsonStoreReadError extends Error {
  constructor(path: string, cause: unknown) {
    super(`Could not read ${path}: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'JsonStoreReadError'
  }
}

function moveAside(path: string): void {
  try {
    renameSync(path, `${path}.corrupt-${Date.now()}`)
  } catch {
    /* best effort */
  }
}

/**
 * Read JSON. A file that does not parse or has the wrong shape is moved
 * aside (kept for recovery). A file that exists but cannot be read throws
 * JsonStoreReadError: returning the fallback there made the next
 * read-modify-write replace every entry.
 */
export function readJsonFile<T>(path: string, fallback: T, isValid: (raw: unknown) => boolean): T {
  if (!existsSync(path)) return fallback
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw new JsonStoreReadError(path, err)
  }
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    moveAside(path)
    return fallback
  }
  if (isValid(raw)) return raw as T
  moveAside(path)
  return fallback
}
