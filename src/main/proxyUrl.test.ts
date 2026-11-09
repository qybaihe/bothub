import { describe, expect, it } from 'vitest'
import { normalizeProxyUrl, proxyKind, requireValidProxyUrl, undiciProxyUrl } from './proxyUrl'

describe('proxy URLs', () => {
  it('normalizes user input', () => {
    expect(normalizeProxyUrl(' 1.2.3.4:8080 ')).toBe('http://1.2.3.4:8080')
    expect(normalizeProxyUrl('socks5h://u:p@h.test:1080')).toBe('socks5h://u:p@h.test:1080')
    expect(normalizeProxyUrl('')).toBeNull()
    expect(normalizeProxyUrl('ftp://h.test:21')).toBeNull()
    expect(normalizeProxyUrl('http://h.test')).toBeNull()
  })

  it('classifies and maps for undici', () => {
    expect(proxyKind('http://h.test:1')).toBe('http')
    expect(proxyKind('socks5h://h.test:1')).toBe('socks')
    expect(undiciProxyUrl('socks5h://u:p@h.test:1080')).toBe('socks5://u:p@h.test:1080')
  })

  it('refuses to save an unusable proxy', () => {
    expect(requireValidProxyUrl('  ')).toBeUndefined()
    expect(() => requireValidProxyUrl('not a proxy')).toThrow()
  })
})
