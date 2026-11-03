/**
 * Muse scheduled tasks helpers (Noise `tasks.*` RPC).
 * Create is agent/chat-only — no tasks.create.
 */

export interface MuseScheduleCadence {
  kind: string
  runAtUtc?: number | null
  intervalSeconds?: number | null
  weekdays?: string[]
  monthDays?: number[]
  months?: number[]
}

export interface MuseSchedule {
  id: string
  title: string
  scheduleKey: string
  timezone: string | null
  isHeartbeat: boolean
  mode: string | null
  enabled: boolean
  nextRunAtUtc: number | null
  cadence: MuseScheduleCadence | null
  /** Human-readable cadence from schedule_key / cadence. */
  cadenceLabel: string
}

export interface MuseTaskRun {
  id: string
  jobId: string
  status: string
  startedAtUtc: number | null
  finishedAtUtc: number | null
  title: string | null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

const WEEKDAYS: Record<string, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat'
}

/** Format `schedule_key` (`kind@payload`) for UI. */
export function formatScheduleKey(key: string): string {
  const raw = key.trim()
  if (!raw) return '—'
  const at = raw.indexOf('@')
  const kind = (at >= 0 ? raw.slice(0, at) : raw).toLowerCase()
  const payload = at >= 0 ? raw.slice(at + 1) : ''
  switch (kind) {
    case 'runonce':
      return payload ? `Once · ${payload.replace('T', ' ').replace(/\.\d+Z?$/, ' UTC')}` : 'Once'
    case 'interval': {
      const m = /^(\d+)([smh])$/i.exec(payload)
      if (!m) return `Every ${payload || '?'}`
      const n = m[1]!
      const u = m[2]!.toLowerCase()
      const unit = u === 's' ? 'sec' : u === 'm' ? 'min' : 'hr'
      return `Every ${n} ${unit}`
    }
    case 'hourly':
      return 'Hourly'
    case 'daily':
      return payload ? `Daily · ${payload}` : 'Daily'
    case 'weekly': {
      const [days, time] = payload.split('-')
      const dayLabel = (days || '')
        .split(',')
        .map((d) => WEEKDAYS[d.trim().toLowerCase()] || d.trim())
        .filter(Boolean)
        .join(', ')
      return time ? `Weekly · ${dayLabel} ${time}` : `Weekly · ${dayLabel || payload}`
    }
    case 'monthly': {
      const [doms, time] = payload.split('-')
      return time ? `Monthly · day ${doms} · ${time}` : `Monthly · ${payload}`
    }
    case 'yearly':
      return payload ? `Yearly · ${payload}` : 'Yearly'
    default:
      return raw
  }
}

function cadenceLabel(scheduleKey: string, cadence: MuseScheduleCadence | null): string {
  if (cadence?.kind) {
    const k = cadence.kind.toLowerCase()
    if (k === 'interval' && cadence.intervalSeconds) {
      const s = cadence.intervalSeconds
      if (s % 3600 === 0) return `Every ${s / 3600} hr`
      if (s % 60 === 0) return `Every ${s / 60} min`
      return `Every ${s} sec`
    }
  }
  return formatScheduleKey(scheduleKey)
}

export function normalizeSchedule(raw: unknown): MuseSchedule | null {
  const s = obj(raw)
  const id = str(s['id'] || s['job_id'] || s['schedule_id'])
  if (!id) return null
  const cadenceRaw = obj(s['cadence'])
  const cadence: MuseScheduleCadence | null = Object.keys(cadenceRaw).length
    ? {
        kind: str(cadenceRaw['kind']),
        runAtUtc: num(cadenceRaw['run_at_utc'] ?? cadenceRaw['runAtUtc']),
        intervalSeconds: num(cadenceRaw['interval_seconds'] ?? cadenceRaw['intervalSeconds']),
        weekdays: Array.isArray(cadenceRaw['weekdays'])
          ? (cadenceRaw['weekdays'] as unknown[]).map((x) => str(x))
          : undefined,
        monthDays: Array.isArray(cadenceRaw['month_days'] ?? cadenceRaw['monthDays'])
          ? ((cadenceRaw['month_days'] ?? cadenceRaw['monthDays']) as unknown[])
              .map((x) => num(x))
              .filter((n): n is number => n != null)
          : undefined,
        months: Array.isArray(cadenceRaw['months'])
          ? (cadenceRaw['months'] as unknown[])
              .map((x) => num(x))
              .filter((n): n is number => n != null)
          : undefined
      }
    : null
  const scheduleKey = str(s['schedule_key'] || s['scheduleKey'])
  const mode = str(s['mode']) || null
  const isHeartbeat =
    bool(s['is_heartbeat'] ?? s['isHeartbeat']) === true || mode === 'heartbeat'
  const enabled = bool(s['enabled']) !== false
  return {
    id,
    title: str(s['title']) || 'Untitled task',
    scheduleKey,
    timezone: str(s['timezone'] || s['time_zone']) || null,
    isHeartbeat,
    mode,
    enabled,
    nextRunAtUtc: num(s['next_run_at_utc'] ?? s['nextRunAtUtc']),
    cadence,
    cadenceLabel: cadenceLabel(scheduleKey, cadence)
  }
}

/** Extract schedules[] from tasks.list result (with or without ok/result envelope). */
export function schedulesFromListResult(raw: unknown): MuseSchedule[] {
  let r = raw
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const o = r as Record<string, unknown>
    if (o['ok'] === true && 'result' in o) r = o['result']
  }
  const root = obj(r)
  const list = (root['schedules'] ?? root['tasks'] ?? (Array.isArray(r) ? r : [])) as unknown
  if (!Array.isArray(list)) return []
  const out: MuseSchedule[] = []
  for (const item of list) {
    const n = normalizeSchedule(item)
    if (n) out.push(n)
  }
  return out
}

export function partitionSchedules(schedules: MuseSchedule[]): {
  active: MuseSchedule[]
  paused: MuseSchedule[]
} {
  const visible = schedules.filter((s) => !s.isHeartbeat)
  const sortFn = (a: MuseSchedule, b: MuseSchedule): number => {
    const an = a.nextRunAtUtc ?? Number.MAX_SAFE_INTEGER
    const bn = b.nextRunAtUtc ?? Number.MAX_SAFE_INTEGER
    if (an !== bn) return an - bn
    return a.title.localeCompare(b.title)
  }
  const active = visible.filter((s) => s.enabled).sort(sortFn)
  const paused = visible.filter((s) => !s.enabled).sort(sortFn)
  return { active, paused }
}

export function normalizeTaskRun(raw: unknown): MuseTaskRun | null {
  const s = obj(raw)
  const id = str(s['id'] || s['run_id'])
  const jobId = str(s['job_id'] || s['schedule_id'] || s['task_id'])
  if (!id && !jobId) return null
  return {
    id: id || jobId,
    jobId,
    status: str(s['status'] || s['state']) || 'unknown',
    startedAtUtc: num(s['started_at_utc'] ?? s['startedAtUtc'] ?? s['started_at']),
    finishedAtUtc: num(s['finished_at_utc'] ?? s['finishedAtUtc'] ?? s['finished_at']),
    title: str(s['title']) || null
  }
}

export function runsFromResult(raw: unknown): MuseTaskRun[] {
  let r = raw
  if (r && typeof r === 'object' && !Array.isArray(r)) {
    const o = r as Record<string, unknown>
    if (o['ok'] === true && 'result' in o) r = o['result']
  }
  const root = obj(r)
  const list = (root['runs'] ?? root['items'] ?? root['results'] ?? (Array.isArray(r) ? r : [])) as unknown
  if (!Array.isArray(list)) return []
  return list.map(normalizeTaskRun).filter((x): x is MuseTaskRun => Boolean(x))
}

export function formatNextRun(utcSec: number | null, timeZone?: string | null): string {
  if (utcSec == null || utcSec <= 0) return '—'
  try {
    const d = new Date(utcSec * 1000)
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timeZone || undefined
    }).format(d)
  } catch {
    return new Date(utcSec * 1000).toLocaleString()
  }
}
