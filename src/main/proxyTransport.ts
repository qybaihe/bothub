import type { Agent } from 'node:http'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { fetch as undiciFetch, ProxyAgent, Socks5ProxyAgent, type Dispatcher } from 'undici'
import { normalizeProxyUrl, proxyKind, undiciProxyUrl } from './proxyUrl'

/**
 * Node-side requests (fetch / ws) through a per-account proxy URL.
 * A configured but unusable proxy throws instead of silently going direct.
 */
const dispatchers = new Map<string, Dispatcher>()

function requireProxy(raw: string): { url: string; kind: 'http' | 'socks' } {
  const url = normalizeProxyUrl(raw)
  const kind = url ? proxyKind(url) : null
  if (!url || !kind) throw new Error('代理地址无效，已拒绝直连发送（请检查账号的代理设置）')
  return { url, kind }
}

function dispatcherFor(raw: string): Dispatcher {
  const { url, kind } = requireProxy(raw)
  let d = dispatchers.get(url)
  if (!d) {
    d = kind === 'http' ? new ProxyAgent(url) : new Socks5ProxyAgent(undiciProxyUrl(url))
    dispatchers.set(url, d)
  }
  return d
}

export function proxyFetch(proxyUrl: string | undefined, input: string, init?: RequestInit): Promise<Response> {
  if (!proxyUrl?.trim()) return fetch(input, init)
  return undiciFetch(input, { ...(init as object), dispatcher: dispatcherFor(proxyUrl) } as never) as unknown as Promise<Response>
}

export function proxyWsAgent(proxyUrl: string | undefined): Agent | undefined {
  if (!proxyUrl?.trim()) return undefined
  const { url, kind } = requireProxy(proxyUrl)
  return (kind === 'http' ? new HttpsProxyAgent(url) : new SocksProxyAgent(url)) as unknown as Agent
}
