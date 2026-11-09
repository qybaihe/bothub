import { describe, expect, it } from 'vitest'
import { checkFailedMessage, interpretLatestRelease } from './updateCheck'

const newer = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }) > 0

describe('interpretLatestRelease', () => {
  it('says "up to date" only when GitHub really says so', () => {
    expect(interpretLatestRelease({ status: 404, ok: false }, null, '1.0.0', newer)).toEqual({ type: 'not-available' })
    expect(interpretLatestRelease({ status: 200, ok: true }, { tag_name: 'v1.0.0' }, '1.0.0', newer)).toEqual({ type: 'not-available' })
  })
  it('reports rate limits and server errors as errors', () => {
    expect(interpretLatestRelease({ status: 403, ok: false }, null, '1.0.0', newer).type).toBe('error')
    expect(interpretLatestRelease({ status: 502, ok: false }, null, '1.0.0', newer).type).toBe('error')
  })
  it('finds a newer release', () => {
    expect(interpretLatestRelease({ status: 200, ok: true }, { tag_name: 'v1.2.0', body: 'n' }, '1.0.0', newer)).toEqual({
      type: 'available',
      version: '1.2.0',
      releaseNotes: 'n'
    })
  })
  it('words network failures', () => {
    expect(checkFailedMessage(new Error('The operation was aborted due to timeout'))).toContain('超时')
  })
})
