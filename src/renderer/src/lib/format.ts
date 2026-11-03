import { t } from "@/lib/i18n"
const DAY = 24 * 60 * 60 * 1000

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// The UI copy is English, so dates use an English locale for consistency.
const LOCALE = 'en-US'

const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const weekdayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' })
const shortDateFmt = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' })
const longDayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', month: 'short', day: 'numeric' })
const fullDateFmt = new Intl.DateTimeFormat(LOCALE, { year: 'numeric', month: 'short', day: 'numeric' })

/** Clock time, e.g. "09:41". */
export function formatClock(ts: number): string {
  return timeFmt.format(ts)
}

/** Compact timestamp for list rows: time today, then "Yesterday", weekday, date. */
export function formatListTime(ts: number, now = Date.now()): string {
  const diffDays = Math.round((startOfDay(now) - startOfDay(ts)) / DAY)
  if (diffDays <= 0) return formatClock(ts)
  if (diffDays === 1) return t('Yesterday')
  if (diffDays < 7) return weekdayFmt.format(ts)
  return shortDateFmt.format(ts)
}

/** Label for date dividers in a conversation. */
export function formatDayLabel(ts: number, now = Date.now()): string {
  const diffDays = Math.round((startOfDay(now) - startOfDay(ts)) / DAY)
  if (diffDays <= 0) return t('Today')
  if (diffDays === 1) return t('Yesterday')
  return longDayFmt.format(ts)
}

export function formatDate(ts: number): string {
  return fullDateFmt.format(ts)
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}
