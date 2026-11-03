/**
 * Muse chat sessions helpers (Noise `sessions.*` / `session.*`).
 */
export interface MuseChatSession {
  id: string
  title: string
  pinned: boolean
  archived: boolean
  updatedAtMs: number | null
  createdAtMs: number | null
  preview: string | null
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

export function normalizeChatSession(raw: unknown): MuseChatSession | null {
  const s = obj(raw)
  const id = str(s["id"] || s["session_id"] || s["sessionId"])
  if (!id) return null
  const title =
    str(s["title"] || s["name"] || s["display_title"] || s["displayTitle"]) || "Untitled session"
  const pinned =
    bool(s["pinned"] ?? s["is_pinned"] ?? s["isPinned"]) === true ||
    str(s["pin_state"] || s["pinState"]).toLowerCase() === "pinned"
  const archived =
    bool(s["archived"] ?? s["is_archived"] ?? s["isArchived"]) === true ||
    str(s["status"] || s["state"]).toLowerCase() === "archived"
  const preview =
    str(s["preview"] || s["snippet"] || s["last_message_preview"] || s["subtitle"]) || null
  return {
    id,
    title,
    pinned,
    archived,
    updatedAtMs: ms(s["updated_at_ms"] ?? s["updatedAtMs"] ?? s["updated_at"] ?? s["updatedAt"]),
    createdAtMs: ms(s["created_at_ms"] ?? s["createdAtMs"] ?? s["created_at"] ?? s["createdAt"]),
    preview
  }
}

export function sessionsFromListResult(raw: unknown): MuseChatSession[] {
  let r = raw
  if (r && typeof r === "object" && !Array.isArray(r)) {
    const o = r as Record<string, unknown>
    if (o["ok"] === true && "result" in o) r = o["result"]
  }
  const root = obj(r)
  const list = (root["sessions"] ?? root["items"] ?? root["results"] ?? (Array.isArray(r) ? r : [])) as unknown
  if (!Array.isArray(list)) return []
  const out: MuseChatSession[] = []
  for (const item of list) {
    const n = normalizeChatSession(item)
    if (n) out.push(n)
  }
  const rank = (s: MuseChatSession): number => {
    if (s.pinned && !s.archived) return 0
    if (!s.archived) return 1
    return 2
  }
  out.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    return (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0)
  })
  return out
}

export function sessionIdParams(sessionId: string): Record<string, unknown> {
  return { session_id: sessionId, id: sessionId }
}

export function formatSessionTime(msValue: number | null): string {
  if (msValue == null || msValue <= 0) return "—"
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(msValue)
    )
  } catch {
    return new Date(msValue).toLocaleString()
  }
}
