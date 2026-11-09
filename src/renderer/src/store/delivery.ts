import type { BotAccount, ChatMessage } from "@/types"

/**
 * Upper bound for one adapter `sendMessage` call. Adapters wait for the reply
 * inside that call (Muse up to ~10 min, Dot 5 min, Grok/Hark 90 s), so this
 * only catches a call that never settles at all.
 */
export const SEND_HARD_TIMEOUT_MS = 12 * 60_000

export const SEND_TIMEOUT_TEXT = "发送超时，可能已经送达；重试前先确认对方是否收到"
export const INTERRUPTED_SEND_TEXT = "应用关闭时还没确认送达，可能已经发出；重试前先确认"
export const INTERRUPTED_REPLY_TEXT = "已送达，但应用关闭时回复还没收完"
export const ACCEPTED_THEN_FAILED_TEXT = "已送达，但等待回复时出错；重发前先确认对方是否已回复"

/**
 * Delivery state after `sendMessage` failed. Once the platform accepted the
 * message it is never "failed" (Retry would double-send), only "no-reply".
 */
export function deliveryAfterError(
  accepted: boolean,
  kind: "no-reply" | "timeout" | "other",
  detail: string
): { delivery: "failed" | "no-reply"; error: string } {
  if (kind === "no-reply") return { delivery: "no-reply", error: detail }
  if (accepted) return { delivery: "no-reply", error: kind === "timeout" ? ACCEPTED_THEN_FAILED_TEXT : `${ACCEPTED_THEN_FAILED_TEXT}（${detail}）` }
  return { delivery: "failed", error: detail }
}

export const ATTACHMENTS_LOST_TEXT = "附件在重启后已不在内存中，请重新添加后再发送"

/** Attachments whose bytes were not persisted cannot be re-sent after a restart. */
export function hasLostAttachments(message: Pick<ChatMessage, "attachments">): boolean {
  return Boolean(message.attachments?.some((a) => !a.dataBase64))
}

/** One delivery per message at a time: a double-clicked Retry must not send twice. */
export function createInFlightSet(): { enter(id: string): boolean; leave(id: string): void } {
  const ids = new Set<string>()
  return {
    enter(id) {
      if (ids.has(id)) return false
      ids.add(id)
      return true
    },
    leave(id) {
      ids.delete(id)
    }
  }
}

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
        if (m.delivery === "accepted") {
          changed = true
          return { ...m, delivery: "no-reply" as const, error: INTERRUPTED_REPLY_TEXT }
        }
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

/** Most recent messages kept on disk per bot; older ones reload from the platform. */
export const PERSISTED_MESSAGES_PER_BOT = 400

/**
 * What goes to localStorage: no attachment bytes (a single 5 MB image used
 * to blow the ~5 MB quota, making every later save throw) and only the
 * newest messages per bot.
 */
export function toPersistedMessages(
  messages: Record<string, ChatMessage[]>,
  maxPerBot = PERSISTED_MESSAGES_PER_BOT
): Record<string, ChatMessage[]> {
  const out: Record<string, ChatMessage[]> = {}
  for (const [botId, list] of Object.entries(messages)) {
    const recent = list.length > maxPerBot ? list.slice(-maxPerBot) : list
    out[botId] = recent.map((m) =>
      m.attachments?.some((a) => a.dataBase64)
        ? { ...m, attachments: m.attachments.map(({ dataBase64: _bytes, ...rest }) => rest) }
        : m
    )
  }
  return out
}

/**
 * localStorage that never throws out of zustand's `set()`. A quota error
 * there used to abort sendMessage before the message was delivered.
 */
export function createSafeStorage(
  backing: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined,
  onError: (error: unknown) => void = () => undefined
): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  return {
    getItem: (name) => {
      try {
        return backing()?.getItem(name) ?? null
      } catch (error) {
        onError(error)
        return null
      }
    },
    setItem: (name, value) => {
      try {
        backing()?.setItem(name, value)
      } catch (error) {
        onError(error)
      }
    },
    removeItem: (name) => {
      try {
        backing()?.removeItem(name)
      } catch (error) {
        onError(error)
      }
    }
  }
}

/**
 * A bot reply arrived: the newest user message still flagged `no-reply`
 * did get an answer after all.
 */
export function clearNoReplyFlag(list: ChatMessage[]): ChatMessage[] {
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]!
    if (m.role !== "user") continue
    if (m.delivery !== "no-reply" && m.delivery !== "accepted") return list
    const next = list.slice()
    next[i] = { ...m, delivery: "sent", error: undefined }
    return next
  }
  return list
}
