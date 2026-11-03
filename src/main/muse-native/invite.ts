/**
 * Muse invite-for-usage via control-plane HTTPS (hatch_* cookies).
 * Not Noise RPC. Never logs invite codes, cookies, or tokens.
 */
import type { FetchFn } from "./controlPlane"

const ORIGIN = "https://muse.ai"

export interface MuseInviteReward {
  title: string | null
  body: string | null
}

export interface MuseInviteSnapshot {
  fetchedAt: number
  inviteState: string
  title: string | null
  subtitle: string | null
  code: string | null
  inviteLink: string | null
  shareText: string | null
  maxUses: number | null
  useCount: number | null
  usesRemaining: number | null
  hasRedeemedInviteCode: boolean
  /** When false, redeem input is shown disabled. */
  inviteCodeEntryAvailable: boolean
  reward: MuseInviteReward | null
  redeemSubtitle: string | null
  redeemDisclaimer: string | null
  error?: string
}

export class MuseInviteError extends Error {
  constructor(
    message: string,
    readonly code?: "signed_out" | "http" | "parse" | "unavailable"
  ) {
    super(message)
    this.name = "MuseInviteError"
  }
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

export function normalizeInvite(raw: unknown, fetchedAt = Date.now()): MuseInviteSnapshot {
  const json = obj(raw)
  const rewardRaw = obj(json["reward"])
  const redeemScreen = obj(json["redeem_invite_code_screen"] ?? json["redeemInviteCodeScreen"])
  const hasRedeemed =
    bool(json["has_redeemed_invite_code"] ?? json["hasRedeemedInviteCode"]) === true
  const entryFlag = bool(
    json["invite_code_entry_available"] ??
      json["inviteCodeEntryAvailable"] ??
      json["can_redeem_invite_code"] ??
      json["canRedeemInviteCode"]
  )
  const inviteCodeEntryAvailable = entryFlag == null ? !hasRedeemed : entryFlag
  const rewardTitle = str(rewardRaw["title"]) || null
  const rewardBody = str(rewardRaw["body"]) || null
  return {
    fetchedAt,
    inviteState: str(json["invite_state"] || json["inviteState"]) || "UNKNOWN",
    title: str(json["title"]) || null,
    subtitle: str(json["subtitle"]) || null,
    code: str(json["code"]) || null,
    inviteLink: str(json["invite_link"] || json["inviteLink"]) || null,
    shareText: str(json["share_text"] || json["shareText"]) || null,
    maxUses: num(json["max_uses"] ?? json["maxUses"]),
    useCount: num(json["use_count"] ?? json["useCount"]),
    usesRemaining: num(json["uses_remaining"] ?? json["usesRemaining"]),
    hasRedeemedInviteCode: hasRedeemed,
    inviteCodeEntryAvailable,
    reward: rewardTitle || rewardBody ? { title: rewardTitle, body: rewardBody } : null,
    redeemSubtitle: str(redeemScreen["subtitle"]) || null,
    redeemDisclaimer: str(redeemScreen["disclaimer"]) || null
  }
}

/** Full invite payload for the Invite panel. */
export async function fetchInvite(fetchFn: FetchFn): Promise<MuseInviteSnapshot> {
  const fetchedAt = Date.now()
  const res = await fetchFn(ORIGIN + "/api/hatch/invite", {
    method: "GET",
    headers: { Accept: "application/json", Origin: ORIGIN, Referer: ORIGIN + "/" }
  })
  if (res.status === 401 || res.status === 403) {
    throw new MuseInviteError(`invite: not signed in (${res.status})`, "signed_out")
  }
  if (!res.ok) {
    throw new MuseInviteError(`invite: HTTP ${res.status}`, "http")
  }
  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new MuseInviteError("invite: invalid JSON", "parse")
  }
  return normalizeInvite(json, fetchedAt)
}

/**
 * Best-effort redeem. Muse has no documented public Noise method for friend
 * invite codes; try HTTPS POST then degrade to open Settings.
 * Never logs the submitted code.
 */
export async function redeemInviteCode(
  fetchFn: FetchFn,
  code: string
): Promise<{ ok: boolean; message: string; openSettings?: boolean }> {
  const trimmed = code.trim().toUpperCase()
  if (!trimmed || trimmed.length < 4) {
    return { ok: false, message: "Enter a valid invite code" }
  }
  try {
    const res = await fetchFn(ORIGIN + "/api/hatch/invite", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Referer: ORIGIN + "/"
      },
      body: JSON.stringify({ code: trimmed, invite_code: trimmed })
    })
    if (res.status === 401 || res.status === 403) {
      throw new MuseInviteError(`invite redeem: not signed in (${res.status})`, "signed_out")
    }
    if (res.ok) {
      return { ok: true, message: "Code redeemed" }
    }
    if (res.status === 404 || res.status === 405) {
      return { ok: false, message: "Redeem this code in Muse Settings", openSettings: true }
    }
    let detail = `HTTP ${res.status}`
    try {
      const body = obj(await res.json())
      detail = str(body["error"] || body["message"] || body["detail"]) || detail
    } catch {
      /* ignore */
    }
    return { ok: false, message: detail.slice(0, 160) }
  } catch (error) {
    if (error instanceof MuseInviteError) throw error
    return { ok: false, message: "Could not redeem here — open Muse Settings", openSettings: true }
  }
}

/** Compact summary used by quota refresh (no code). */
export async function fetchInviteSummary(
  fetchFn: FetchFn
): Promise<{ usesRemaining: number | null; rewardLabel: string | null } | null> {
  try {
    const snap = await fetchInvite(fetchFn)
    return {
      usesRemaining: snap.usesRemaining,
      rewardLabel: snap.reward?.title || snap.subtitle
    }
  } catch {
    return null
  }
}
