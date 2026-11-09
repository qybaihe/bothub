/** Pure proxy-pool bookkeeping, shared by the main process and tests. */

export interface PoolSlot {
  id: string
  assignedAccountId?: string
}

/**
 * Give every account in `accountIds` one pool slot (1-to-1, never shared).
 *
 * A slot is released only when its account is neither listed nor kept
 * alive by `keep` (e.g. a login still in flight). Callers used to pass
 * partial lists (Muse ids only, or saved accounts without rows still
 * logging in), which freed live accounts' slots and handed the same proxy
 * to a second account.
 */
export function planPoolAssignment<T extends PoolSlot>(
  pool: readonly T[],
  accountIds: readonly string[],
  keep: (accountId: string) => boolean = () => false
): { pool: T[]; assigned: Array<{ accountId: string; slot: T }> } {
  const listed = new Set(accountIds)
  const next = pool.map((slot) =>
    slot.assignedAccountId && !listed.has(slot.assignedAccountId) && !keep(slot.assignedAccountId)
      ? { ...slot, assignedAccountId: undefined }
      : { ...slot }
  )
  const assigned: Array<{ accountId: string; slot: T }> = []
  for (const accountId of new Set(accountIds)) {
    let slot = next.find((s) => s.assignedAccountId === accountId)
    if (!slot) slot = next.find((s) => !s.assignedAccountId)
    if (!slot) continue // pool exhausted: this account stays on its current setting
    slot.assignedAccountId = accountId
    assigned.push({ accountId, slot })
  }
  return { pool: next, assigned }
}

/** Free the slot held by one account (failed/cancelled login, deleted account). */
export function releasePoolSlot<T extends PoolSlot>(pool: readonly T[], accountId: string): T[] {
  return pool.map((slot) => (slot.assignedAccountId === accountId ? { ...slot, assignedAccountId: undefined } : slot))
}

/** Serialize async read-modify-write sections (JSON stores on disk). */
export function createMutex(): <R>(fn: () => Promise<R> | R) => Promise<R> {
  let tail: Promise<unknown> = Promise.resolve()
  return <R>(fn: () => Promise<R> | R): Promise<R> => {
    const run = tail.then(fn, fn)
    tail = run.catch(() => undefined)
    return run
  }
}
