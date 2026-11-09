import type { BotAccount, ChatMessage } from "@/types"

/**
 * Upper bound for one adapter `sendMessage` call. Adapters wait for the reply
 * inside that call (Muse up to ~10 min, Dot 5 min, Grok/Hark 90 s), so this
 * only catches a call that never settles at all.
 */
export const SEND_HARD_TIMEOUT_MS = 12 * 60_000

export const SEND_TIMEOUT_TEXT = "发送超时，可能已经送达；重试前先确认对方是否收到"
export const INTERRUPTED_SEND_TEXT = "应用关闭时还没确认送达，可能已经发出；重试前先确认"

export class SendTimeoutError extends Error {
  constructor() {
    super(SEND_TIMEOUT_TEXT)
    this.name = "SendTimeoutError"
  }
}

/**
 * Race `promise` against a timer. If the timer wins, reject with
 * SendTimeoutError; a late result still reaches `onLate` so the caller can
 * correct the state it already showed.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onLate?: (outcome: { ok: true; value: T } | { ok: false; error: unknown }) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      reject(new SendTimeoutError())
    }, ms)
    promise.then(
      (value) => {
        if (timedOut) return onLate?.({ ok: true, value })
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        if (timedOut) return onLate?.({ ok: false, error })
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/**
 * Clean state loaded from disk: nothing can still be in flight after a
 * restart, so a persisted `sending` message or `pending` account would
 * otherwise stay stuck forever (connectAccount bails while `pending`).
 */
export function sanitizePersisted<
  S extends { messages?: Record<string, ChatMessage[]>; accounts?: Record<string, BotAccount> }
>(state: S): S {
  let messages = state.messages
  if (messages) {
    let changed = false
    const next: Record<string, ChatMessage[]> = {}
    for (const [botId, list] of Object.entries(messages)) {
      if (!Array.isArray(list)) continue
      const fixed = list.map((m) => {
        if (m.delivery !== "sending") return m
        changed = true
        return { ...m, delivery: "failed" as const, error: INTERRUPTED_SEND_TEXT }
      })
      next[botId] = fixed
    }
    if (changed || Object.keys(next).length !== Object.keys(messages).length) messages = next
  }
  let accounts = state.accounts
  if (accounts) {
    let changed = false
    const next: Record<string, BotAccount> = {}
    for (const [id, acc] of Object.entries(accounts)) {
      if (acc && (acc.pending || acc.status === "busy")) {
        changed = true
        next[id] = { ...acc, pending: false, status: acc.status === "busy" ? "offline" : acc.status }
      } else if (acc) {
        next[id] = acc
      }
    }
    if (changed) accounts = next
  }
  if (messages === state.messages && accounts === state.accounts) return state
  return { ...state, messages, accounts }
}

/**
 * A bot reply arrived: the newest user message still flagged `no-reply`
 * did get an answer after all.
 */
export function clearNoReplyFlag(list: ChatMessage[]): ChatMessage[] {
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]!
    if (m.role !== "user") continue
    if (m.delivery !== "no-reply") return list
    const next = list.slice()
    next[i] = { ...m, delivery: "sent", error: undefined }
    return next
  }
  return list
}
