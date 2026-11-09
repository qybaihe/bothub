import { createServer, type Server } from 'node:http'
import { connect, type AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { proxyFetch, proxyWsAgent } from './proxyTransport'

let target: Server
let proxy: Server
const tunnels: string[] = []
const port = (s: Server) => (s.address() as AddressInfo).port

beforeAll(async () => {
  target = createServer((_req, res) => res.end('hello'))
  // Plain HTTP targets may be sent as absolute-URL requests instead of CONNECT.
  proxy = createServer((req, res) => {
    const url = new URL(String(req.url))
    tunnels.push(url.host)
    fetch(url).then(async (r) => res.end(await r.text()), () => res.destroy())
  })
  proxy.on('connect', (req, client, head) => {
    tunnels.push(String(req.url))
    const [host, p] = String(req.url).split(':')
    const upstream = connect(Number(p), host, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
      upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
    upstream.on('error', () => client.destroy())
  })
  await new Promise<void>((r) => target.listen(0, '127.0.0.1', r))
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r))
})

afterAll(() => {
  target.close()
  proxy.close()
})

describe('proxyFetch', () => {
  it('goes through the configured HTTP proxy', async () => {
    const res = await proxyFetch(`127.0.0.1:${port(proxy)}`, `http://127.0.0.1:${port(target)}/x`)
    expect(await res.text()).toBe('hello')
    expect(tunnels).toContain(`127.0.0.1:${port(target)}`)
  })

  it('refuses an unusable proxy instead of going direct', () => {
    expect(() => proxyFetch('nonsense proxy', 'http://127.0.0.1:1/')).toThrow()
    expect(() => proxyWsAgent('ftp://h.test:21')).toThrow()
  })

  it('goes direct only when no proxy is set', async () => {
    const res = await proxyFetch(undefined, `http://127.0.0.1:${port(target)}/`)
    expect(await res.text()).toBe('hello')
  })
})
