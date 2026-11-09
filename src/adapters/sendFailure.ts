import { AdapterError, type ConnectionStatus } from './types'

const AUTH_FAILURE_RE =
  /\b(401|403)\b|unauthori[sz]ed|unauthenticated|forbidden|not signed in|sign in (first|again)|log ?in again|session (has )?expired|token (has )?expired|invalid[_ ]token|refresh token/i

/**
 * Account status after a send failed. Only a sign-in problem should flip the
 * account to `error`: the composer treats `error` as disconnected, so a
 * timeout or a 5xx used to lock typing until the user pressed Connect.
 */
export function statusAfterSendFailure(error: unknown): ConnectionStatus {
  if (error instanceof AdapterError && (error.code === 'not-connected' || error.code === 'unknown-account')) {
    return 'error'
  }
  const detail = error instanceof Error ? error.message : String(error ?? '')
  return AUTH_FAILURE_RE.test(detail) ? 'error' : 'online'
}
