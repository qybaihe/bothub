/**
 * Reply watches per Hark account. Several sends can be in flight; a new one
 * used to cancel the previous watch, cutting the first reply short.
 */
export class HarkWatchRegistry {
  private readonly byAccount = new Map<string, Map<string, { abort: () => void; target?: string }>>()
  private seq = 0

  add(accountId: string, abort: () => void, target?: string): string {
    const token = `w${++this.seq}`
    let map = this.byAccount.get(accountId)
    if (!map) this.byAccount.set(accountId, (map = new Map()))
    map.set(token, { abort, target })
    return token
  }

  remove(accountId: string, token: string): void {
    const map = this.byAccount.get(accountId)
    if (!map) return
    map.delete(token)
    if (map.size === 0) this.byAccount.delete(accountId)
  }

  /** Stop every watch of the account (stop-tool, sign-out). */
  cancelAll(accountId: string): void {
    const map = this.byAccount.get(accountId)
    if (!map) return
    this.byAccount.delete(accountId)
    for (const { abort } of map.values()) abort()
  }

  /** Reply ids other watches are waiting for: never take them as our reply. */
  claimedByOthers(accountId: string, token: string): Set<string> {
    const out = new Set<string>()
    for (const [t, w] of this.byAccount.get(accountId) ?? []) if (t !== token && w.target) out.add(w.target)
    return out
  }

  size(accountId: string): number {
    return this.byAccount.get(accountId)?.size ?? 0
  }
}
