import { describe, expect, it } from 'vitest'
import { statusAfterSendFailure } from './sendFailure'
import { AdapterError } from './types'

describe('statusAfterSendFailure', () => {
  it('keeps the account usable for transient failures', () => {
    expect(statusAfterSendFailure(new Error('fetch failed'))).toBe('online')
    expect(statusAfterSendFailure(new Error('HTTP 502 Bad Gateway'))).toBe('online')
    expect(statusAfterSendFailure(new AdapterError('timeout', 'timed out'))).toBe('online')
    expect(statusAfterSendFailure(new AdapterError('network', 'socket hang up'))).toBe('online')
  })

  it('flags sign-in problems', () => {
    expect(statusAfterSendFailure(new Error('HTTP 401'))).toBe('error')
    expect(statusAfterSendFailure(new Error('Unauthorized'))).toBe('error')
    expect(statusAfterSendFailure(new Error('session expired, sign in again'))).toBe('error')
    expect(statusAfterSendFailure(new AdapterError('not-connected', 'x'))).toBe('error')
  })
})
