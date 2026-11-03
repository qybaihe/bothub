/**
 * Muse Files / Library helpers (Noise `artifacts.*` / `fs.*`).
 * Read-focused normalizers; destructive ops stay behind UI confirm.
 */
export interface MuseFileEntry {
  id: string
  name: string
  kind: string
  path: string | null
  sizeBytes: number | null
  mimeType: string | null
  pinned: boolean
  updatedAtMs: number | null
  source: "artifact" | "library" | "fs"
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v)
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function ms(v: unknown): number | null {
  const n = num(v)
  if (n == null) return null
  return n > 0 && n < 1e12 ? Math.round(n * 1000) : n
}

function unwrap(raw: unknown): unknown {
  let r = raw
  if (r && typeof r === "object" && !Array.isArray(r)) {
    const o = r as Record<string, unknown>
    if (o["ok"] === true && "result" in o) r = o["result"]
  }
  return r
}

function listFrom(raw: unknown, keys: string[]): unknown[] {
  const r = unwrap(raw)
  if (Array.isArray(r)) return r
  const root = obj(r)
  for (const k of keys) {
    const v = root[k]
    if (Array.isArray(v)) return v
  }
  return []
}

export function normalizeFileEntry(
  raw: unknown,
  source: MuseFileEntry["source"],
  index: number
): MuseFileEntry | null {
  const s = obj(raw)
  const id = str(
    s["id"] || s["artifact_id"] || s["file_id"] || s["path"] || s["sha256"] || `${source}-${index}`
  )
  if (!id) return null
  const name =
    str(s["name"] || s["title"] || s["filename"] || s["display_name"] || s["path"]) || `Item ${index + 1}`
  const kind = str(s["kind"] || s["type"] || s["artifact_type"] || s["entry_type"] || source)
  return {
    id,
    name,
    kind,
    path: str(s["path"] || s["uri"] || s["url"]) || null,
    sizeBytes: num(s["size"] ?? s["size_bytes"] ?? s["byte_size"] ?? s["bytes"]),
    mimeType: str(s["mime_type"] || s["mimeType"] || s["content_type"]) || null,
    pinned: bool(s["pinned"] ?? s["is_pinned"] ?? s["isPinned"]) === true,
    updatedAtMs: ms(s["updated_at_ms"] ?? s["updatedAtMs"] ?? s["updated_at"] ?? s["mtime"]),
    source
  }
}

export function artifactsFromListResult(raw: unknown): MuseFileEntry[] {
  const list = listFrom(raw, ["artifacts", "items", "results", "files"])
  const out: MuseFileEntry[] = []
  list.forEach((item, i) => {
    const n = normalizeFileEntry(item, "artifact", i)
    if (n) out.push(n)
  })
  return out
}

export function libraryFromResult(raw: unknown): MuseFileEntry[] {
  const list = listFrom(raw, ["entries", "items", "files", "library", "results", "nodes"])
  const out: MuseFileEntry[] = []
  list.forEach((item, i) => {
    const n = normalizeFileEntry(item, "library", i)
    if (n) out.push(n)
  })
  return out
}

export function formatBytes(n: number | null): string {
  if (n == null || n < 0) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
