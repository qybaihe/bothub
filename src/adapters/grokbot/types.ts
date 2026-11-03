/** Grok Bot (sand / api2.cursor.sh) adapter types. */

export type GrokAccountSlot = string // e.g. "grok|user_<ULID>"

export interface GrokAgentSummary {
  id: string
  name: string
  description?: string
  harness?: string
  visibility?: string
  avatarShape?: string
  avatarColor?: string
  isGroup?: boolean
  unreadCount?: number
  lastMessageId?: string
  awaitingUserResponse?: boolean
}

/** Auto-review resolution enums from asar proto (Yw). */
export type GrokAutoReviewResolution = 'UNSPECIFIED' | 'APPROVED' | 'DENIED' | 'ALWAYS'

export const GROK_AUTO_REVIEW_RESOLUTION: Record<GrokAutoReviewResolution, number> = {
  UNSPECIFIED: 0,
  APPROVED: 1,
  DENIED: 2,
  ALWAYS: 3
}

/** Local tool permission card enums from asar (Xw) — NEVER observed in descriptor. */
export type GrokLocalToolResolution = 'UNSPECIFIED' | 'ALLOW_ONCE' | 'DENY' | 'ALWAYS' | 'NEVER'

export const GROK_LOCAL_TOOL_RESOLUTION: Record<GrokLocalToolResolution, number> = {
  UNSPECIFIED: 0,
  ALLOW_ONCE: 1,
  DENY: 2,
  ALWAYS: 3,
  NEVER: 4
}

export interface GrokAuthSession {
  accountId: string
  accessToken: string
  /** Optional Cursor team id header. */
  teamId?: string
  /** Stable machine id used for x-cursor-checksum (algorithm still approximate). */
  machineId?: string
  accountSlot?: GrokAccountSlot
}
