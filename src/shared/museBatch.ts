/**
 * Batch Muse account import: one account per line, `email | inbox_url`.
 * Tolerates `----`, tabs, commas, runs of spaces, blank lines and `#` comments.
 */
export interface MuseBatchItem {
  /** 1-based source line. */
  line: number
  email: string
  /** https URL of a web inbox that receives the Muse/Meta login code. */
  inboxUrl: string
}

export interface MuseBatchParseError {
  line: number
  reason: 'missing-inbox' | 'bad-email' | 'bad-url' | 'duplicate'
}

const EMAIL_RE = /^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/
const SPLIT_RE = /\s*(?:\||-{2,}|\t|,|；|;)\s*|\s+/

export function parseMuseBatch(text: string): { items: MuseBatchItem[]; errors: MuseBatchParseError[] } {
  const items: MuseBatchItem[] = []
  const errors: MuseBatchParseError[] = []
  const seen = new Set<string>()
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1
    const trimmed = raw.replace(/^\uFEFF/, '').trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return
    const parts = trimmed.split(SPLIT_RE).filter(Boolean)
    const email = parts.find((p) => EMAIL_RE.test(p) && !/^https?:/i.test(p))
    const url = parts.find((p) => /^https?:\/\//i.test(p))
    if (!email) return void errors.push({ line, reason: 'bad-email' })
    if (!url) return void errors.push({ line, reason: 'missing-inbox' })
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return void errors.push({ line, reason: 'bad-url' })
    }
    if (parsed.protocol !== 'https:') return void errors.push({ line, reason: 'bad-url' })
    const key = email.toLowerCase()
    if (seen.has(key)) return void errors.push({ line, reason: 'duplicate' })
    seen.add(key)
    items.push({ line, email, inboxUrl: parsed.toString() })
  })
  return { items, errors }
}

/** `abc***@example.com` — the only form an email may take in logs or UI summaries. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 3)}***@${domain}`
}

/** Pull 6-digit login codes out of web-inbox text, in page order (newest first on most inboxes). */
export function extractLoginCodes(text: string): string[] {
  const out: string[] = []
  const re = /(?:code|验证码|安全码|代码|コード)\D{0,24}?(\d{6})(?!\d)|(?<!\d)(\d{6})(?!\d)\s*(?:is your|是你的|为你的)/gi
  for (const m of text.matchAll(re)) out.push((m[1] ?? m[2])!)
  return out
}

export interface MuseAutoLoginRequest {
  botId: string
  accountId: string
  email: string
  inboxUrl: string
}

export type MuseAutoLoginFailure =
  | 'no-email-field'
  | 'email-rejected'
  | 'no-code-field'
  | 'inbox-unreachable'
  | 'code-timeout'
  | 'code-rejected'
  | 'needs-human'
  | 'cancelled'
  | 'timeout'

export interface MuseAutoLoginResult {
  ok: boolean
  reason?: MuseAutoLoginFailure
  /** The login window is still open (hidden) and can be shown for a manual checkpoint. */
  canShow?: boolean
}
