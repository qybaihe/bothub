/**
 * Typing ("thinking…") is driven only by adapter events. If a stream dies
 * without its final event, the indicator used to stay on forever. The
 * watchdog clears it after a long quiet period.
 */

/** No event at all for this long while typing → give up waiting. */
export const REPLY_IDLE_LIMIT_MS = 3 * 60_000
/** Same, while the platform still reports the agent as busy (tools, long jobs). */
export const REPLY_BUSY_LIMIT_MS = 15 * 60_000

export function isReplyStalled(lastEventAt: number, now: number, busy: boolean): boolean {
  return now - lastEventAt >= (busy ? REPLY_BUSY_LIMIT_MS : REPLY_IDLE_LIMIT_MS)
}

/** Tracks the last sign of life per bot. */
export class ReplyWatchdog {
  private readonly lastEvent = new Map<string, number>()

  constructor(private readonly now: () => number = Date.now) {}

  touch(botId: string): void {
    this.lastEvent.set(botId, this.now())
  }

  forget(botId: string): void {
    this.lastEvent.delete(botId)
  }

  /**
   * Bots among `typingBotIds` that have been quiet too long. Bots seen for
   * the first time start their clock now.
   */
  stalled(typingBotIds: readonly string[], isBusy: (botId: string) => boolean): string[] {
    const now = this.now()
    const typing = new Set(typingBotIds)
    for (const id of [...this.lastEvent.keys()]) if (!typing.has(id)) this.lastEvent.delete(id)
    const out: string[] = []
    for (const id of typing) {
      const last = this.lastEvent.get(id)
      if (last === undefined) {
        this.lastEvent.set(id, now)
        continue
      }
      if (isReplyStalled(last, now, isBusy(id))) out.push(id)
    }
    return out
  }
}
