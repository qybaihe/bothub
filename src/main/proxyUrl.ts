/** Pure helpers for user-entered proxy URLs (no Electron/undici imports: testable). */

export type ProxyKind = 'http' | 'socks'

/** `host:port` → `http://host:port`; trims; returns null for anything unusable. */
export function normalizeProxyUrl(raw: string | undefined | null): string | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (!url.hostname || !url.port) return null
  if (!proxyKindOf(url.protocol)) return null
  return url.toString().replace(/\/$/, '')
}

function proxyKindOf(protocol: string): ProxyKind | null {
  switch (protocol) {
    case 'http:':
    case 'https:':
      return 'http'
    case 'socks:':
    case 'socks5:':
    case 'socks5h:':
      return 'socks'
    default:
      return null
  }
}

export function proxyKind(normalizedUrl: string): ProxyKind | null {
  try {
    return proxyKindOf(new URL(normalizedUrl).protocol)
  } catch {
    return null
  }
}

/** undici only knows socks5://; the proxy resolves names either way. */
export function undiciProxyUrl(normalizedUrl: string): string {
  return normalizedUrl.replace(/^socks5h:\/\//i, 'socks5://').replace(/^socks:\/\//i, 'socks5://')
}

/** For saving user input: empty → undefined, invalid → throw (never store junk that later goes direct). */
export function requireValidProxyUrl(raw: string | undefined | null): string | undefined {
  if (!(raw ?? '').trim()) return undefined
  const url = normalizeProxyUrl(raw)
  if (!url) throw new Error('代理地址无效：需要 http:// 或 socks5:// 加 主机:端口')
  return url
}
