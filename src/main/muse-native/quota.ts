/**
 * Muse Usage / quota via Next.js Server Action (HTTPS + hatch_* cookies).
 * Not Noise RPC. Never logs cookies or tokens.
 */
import type { FetchFn } from './controlPlane'

const ORIGIN = 'https://muse.ai'

/** Known id from docs/museai/QUOTA.md — may change on deploy; we rediscover. */
const FALLBACK_ACTION_ID = '409b972cbb33d3e372f4ca9d3c8332677217064f62'

export interface MuseQuotaTier {
  tierId: string
  name: string
  tierCode: string
  isPaid: boolean
  rank: number
}

export interface MuseQuotaUsage {
  state: string
  percentUsed: number
  resetsAt: number | null
  quotaStatus: string
}

export interface MuseSubscription {
  tier: MuseQuotaTier
  usage: MuseQuotaUsage
  statusSubtitle: string | null
  usageRowLabel: string | null
  usageRowValueLabel: string | null
  usageRowFooter: string | null
  billingSubtitle: string | null
  topupBalance: number | null
  topupTotal: number | null
  topupRowLabel: string | null
  topupRowValueLabel: string | null
  topupEligible: boolean | null
  entryPointCtaLabel: string | null
}

export interface MuseQuotaSnapshot {
  fetchedAt: number
  stale: boolean
  success: boolean
  subscription: MuseSubscription | null
  error?: string
}

export class MuseQuotaError extends Error {
  constructor(
    message: string,
    readonly code?: 'signed_out' | 'action_not_found' | 'parse' | 'http'
  ) {
    super(message)
    this.name = 'MuseQuotaError'
  }
}

let cachedActionId: string | null = FALLBACK_ACTION_ID

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

/** Parse Next Server Action `text/x-component` multi-line body for subscription JSON. */
export function parseSubscriptionActionBody(text: string): { success: boolean; subscription: MuseSubscription | null } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let found: Record<string, unknown> | null = null
  for (const line of lines) {
    const jsonPart = line.includes(':') && /^\d+:/.test(line) ? line.slice(line.indexOf(':') + 1) : line
    try {
      const parsed = JSON.parse(jsonPart) as unknown
      const o = obj(parsed)
      if (o['subscription'] || (o['success'] === true && o['subscription'])) {
        found = o
        break
      }
      // Some flight rows nest under result
      const nested = obj(o['result'])
      if (nested['subscription']) {
        found = nested
        break
      }
    } catch {
      /* skip non-JSON rows */
    }
  }
  if (!found) throw new MuseQuotaError('subscription action: no subscription JSON in response', 'parse')
  return { success: found['success'] !== false, subscription: normalizeSubscription(found['subscription']) }
}

export function normalizeSubscription(raw: unknown): MuseSubscription | null {
  const s = obj(raw)
  if (!Object.keys(s).length) return null
  const tier = obj(s['tier'])
  const usage = obj(s['usage'])
  return {
    tier: {
      tierId: str(tier['tierId'] || tier['tier_id']),
      name: str(tier['name']) || 'Muse',
      tierCode: str(tier['tierCode'] || tier['tier_code']),
      isPaid: bool(tier['isPaid'] ?? tier['is_paid']) === true,
      rank: num(tier['rank']) ?? 0
    },
    usage: {
      state: str(usage['state']) || 'UNKNOWN',
      percentUsed: Math.max(0, Math.min(100, Math.round(num(usage['percentUsed'] ?? usage['percent_used']) ?? 0))),
      resetsAt: num(usage['resetsAt'] ?? usage['resets_at']),
      quotaStatus: str(usage['quotaStatus'] || usage['quota_status'])
    },
    statusSubtitle: str(s['statusSubtitle'] || s['status_subtitle']) || null,
    usageRowLabel: str(s['usageRowLabel'] || s['usage_row_label']) || null,
    usageRowValueLabel: str(s['usageRowValueLabel'] || s['usage_row_value_label']) || null,
    usageRowFooter: str(s['usageRowFooter'] || s['usage_row_footer']) || null,
    billingSubtitle: str(s['billingSubtitle'] || s['billing_subtitle']) || null,
    topupBalance: num(s['topupBalance'] ?? s['topup_balance']),
    topupTotal: num(s['topupTotal'] ?? s['topup_total']),
    topupRowLabel: str(s['topupRowLabel'] || s['topup_row_label']) || null,
    topupRowValueLabel: str(s['topupRowValueLabel'] || s['topup_row_value_label']) || null,
    topupEligible: bool(s['topupEligible'] ?? s['topup_eligible']),
    entryPointCtaLabel: str(s['entryPointCtaLabel'] || s['entry_point_cta_label']) || 'Upgrade'
  }
}

const ACTION_RE =
  /createServerReference\(\s*["']([0-9a-f]{40,44})["'][\s\S]{0,180}?["']fetchSubscriptionAction["']/i
const ACTION_RE_REV =
  /["']fetchSubscriptionAction["'][\s\S]{0,180}?createServerReference\(\s*["']([0-9a-f]{40,44})["']/i
const LOOSE_NEAR =
  /fetchSubscriptionAction[\s\S]{0,120}?([0-9a-f]{40,44})|([0-9a-f]{40,44})[\s\S]{0,120}?fetchSubscriptionAction/i

/** Best-effort: scrape muse.ai bundles for the current Server Action id. */
export async function discoverSubscriptionActionId(fetchFn: FetchFn): Promise<string | null> {
  try {
    const home = await fetchFn(ORIGIN + '/', {
      method: 'GET',
      headers: { Accept: 'text/html', 'Accept-Language': 'en-US' }
    })
    if (!home.ok) return null
    const html = await home.text()
    const fromHtml = html.match(ACTION_RE)?.[1] || html.match(ACTION_RE_REV)?.[1] || html.match(LOOSE_NEAR)?.[1] || html.match(LOOSE_NEAR)?.[2]
    if (fromHtml) return fromHtml

    const scriptSrcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map((m) => m[1]!)
      .filter((u) => /\.js(\?|$)/.test(u))
      .slice(0, 12)
    for (const src of scriptSrcs) {
      const url = src.startsWith('http') ? src : new URL(src, ORIGIN).href
      if (!url.includes('muse.ai') && !url.startsWith('/')) continue
      try {
        const r = await fetchFn(url, { headers: { Accept: '*/*' } })
        if (!r.ok) continue
        const js = await r.text()
        const id = js.match(ACTION_RE)?.[1] || js.match(ACTION_RE_REV)?.[1] || js.match(LOOSE_NEAR)?.[1] || js.match(LOOSE_NEAR)?.[2]
        if (id) return id
      } catch {
        /* try next chunk */
      }
    }
  } catch {
    /* degrade to fallback */
  }
  return null
}

async function postAction(
  fetchFn: FetchFn,
  actionId: string,
  includeAgreement: boolean
): Promise<{ status: number; text: string }> {
  const body = JSON.stringify([{ includeAgreement }])
  const res = await fetchFn(ORIGIN + '/', {
    method: 'POST',
    headers: {
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': actionId,
      Origin: ORIGIN,
      Referer: ORIGIN + '/'
    },
    body
  })
  const text = await res.text()
  return { status: res.status, text }
}

function looksLikeSubscription(text: string): boolean {
  return /"subscription"\s*:/.test(text) || /"percentUsed"\s*:/.test(text)
}

/**
 * Fetch current subscription / usage for the account whose cookies the fetchFn carries.
 */
export async function fetchSubscription(
  fetchFn: FetchFn,
  opts: { includeAgreement?: boolean; rediscover?: boolean } = {}
): Promise<MuseQuotaSnapshot> {
  const includeAgreement = opts.includeAgreement === true
  const fetchedAt = Date.now()

  const tryIds: string[] = []
  if (cachedActionId) tryIds.push(cachedActionId)
  if (FALLBACK_ACTION_ID && !tryIds.includes(FALLBACK_ACTION_ID)) tryIds.push(FALLBACK_ACTION_ID)

  let lastStatus = 0
  let lastText = ''

  for (const id of tryIds) {
    const { status, text } = await postAction(fetchFn, id, includeAgreement)
    lastStatus = status
    lastText = text
    if (status === 401 || status === 403) {
      throw new MuseQuotaError(`quota: not signed in (${status})`, 'signed_out')
    }
    if (status >= 200 && status < 300 && looksLikeSubscription(text)) {
      cachedActionId = id
      const parsed = parseSubscriptionActionBody(text)
      return {
        fetchedAt,
        stale: false,
        success: parsed.success,
        subscription: parsed.subscription
      }
    }
  }

  // Hash may have rotated — rediscover once.
  if (opts.rediscover !== false) {
    const discovered = await discoverSubscriptionActionId(fetchFn)
    if (discovered && !tryIds.includes(discovered)) {
      cachedActionId = discovered
      const { status, text } = await postAction(fetchFn, discovered, includeAgreement)
      lastStatus = status
      lastText = text
      if (status === 401 || status === 403) {
        throw new MuseQuotaError(`quota: not signed in (${status})`, 'signed_out')
      }
      if (status >= 200 && status < 300 && looksLikeSubscription(text)) {
        const parsed = parseSubscriptionActionBody(text)
        return {
          fetchedAt,
          stale: false,
          success: parsed.success,
          subscription: parsed.subscription
        }
      }
    }
  }

  if (lastStatus === 404 || lastStatus === 400 || !looksLikeSubscription(lastText)) {
    throw new MuseQuotaError(
      `quota: fetchSubscriptionAction unavailable (HTTP ${lastStatus || 'n/a'})`,
      'action_not_found'
    )
  }
  throw new MuseQuotaError(`quota: HTTP ${lastStatus}`, 'http')
}

/** Optional invite remaining (control-plane HTTPS). */
export async function fetchInviteSummary(
  fetchFn: FetchFn
): Promise<{ usesRemaining: number | null; rewardLabel: string | null } | null> {
  try {
    const res = await fetchFn(ORIGIN + '/api/hatch/invite', {
      method: 'GET',
      headers: { Accept: 'application/json', Origin: ORIGIN, Referer: ORIGIN + '/' }
    })
    if (!res.ok) return null
    const json = obj(await res.json())
    return {
      usesRemaining: num(json['uses_remaining'] ?? json['usesRemaining']),
      rewardLabel: str(json['reward'] || json['reward_label'] || json['description']) || null
    }
  } catch {
    return null
  }
}
