import type { GrokAuthSession } from './types'

/**
 * In-memory token store for the renderer/adapter process.
 * Tokens are never written to disk or git. Login/2FA still has to populate this
 * (paste or a future secure main-process vault).
 */
const sessions = new Map<string, GrokAuthSession>()

export function getGrokAuth(accountId: string): GrokAuthSession | undefined {
  return sessions.get(accountId)
}

export function setGrokAuth(session: GrokAuthSession): void {
  sessions.set(session.accountId, session)
}

export function clearGrokAuth(accountId: string): void {
  sessions.delete(accountId)
}

export function listGrokAuthAccountIds(): string[] {
  return [...sessions.keys()]
}
