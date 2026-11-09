/**
 * muse.ai HTTPS control plane: wake / lease / token / notary.
 * Uses the account partition's own cookies via `session.fetch` — this module
 * never reads, stores or logs cookie or token values.
 */

const ORIGIN = 'https://muse.ai'
const MUSE_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export interface GatewayCreds {
  vmId: string
  vmName: string
  gatewayUrl: string
  authToken: string
  notaryToken?: string
}

export class MuseControlPlaneError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: 'signed_out' | 'vm_unavailable' | 'cvm_required' | 'http'
  ) {
    super(message)
    this.name = 'MuseControlPlaneError'
  }
}

function vmIdFromGateway(url: string): string | null {
  const m = /^wss:\/\/([a-z0-9-]{8,64})\.metaaivm\.com\/?/i.exec(url.trim())
  return m ? m[1]!.toLowerCase() : null
}

export class MuseControlPlane {
  private lease: { vmId: string; vmName: string; gatewayUrl: string } | null = null
  private wakeRetry = 0

  constructor(private readonly fetchFn: FetchFn) {}

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 300 * attempt))
      }
      try {
        const res = await this.fetchFn(ORIGIN + path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
            Origin: ORIGIN,
            Referer: ORIGIN + '/',
            'User-Agent': MUSE_UA,
            'Sec-Ch-Ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty'
          },
          body: JSON.stringify(body ?? {})
        })
        let json: Record<string, unknown> = {}
        try {
          json = (await res.json()) as Record<string, unknown>
        } catch {
          /* non-JSON */
        }
        if (res.status === 401 || res.status === 403) {
          throw new MuseControlPlaneError(`${path}: not signed in (${res.status})`, res.status, 'signed_out')
        }
        if ((res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) && attempt < 2) {
          lastErr = new MuseControlPlaneError(`${path}: HTTP ${res.status}`, res.status, 'http')
          continue
        }
        if (!res.ok) {
          const err = typeof json['error'] === 'string' ? (json['error'] as string).slice(0, 120) : ''
          throw new MuseControlPlaneError(`${path}: HTTP ${res.status}${err ? ` ${err}` : ''}`, res.status, 'http')
        }
        return json
      } catch (err) {
        lastErr = err
        if (err instanceof MuseControlPlaneError) throw err
        if (attempt >= 2) throw err
      }
    }
    throw lastErr instanceof Error ? lastErr : new MuseControlPlaneError(`${path}: failed`, undefined, 'http')
  }

  async authCheck(): Promise<{ ok: boolean; viewerId: string }> {
    const d = await this.post('/api/auth/check', {})
    return { ok: d['ok'] === true, viewerId: String(d['viewer_id'] ?? '') }
  }

  async wake(): Promise<void> {
    try {
      await this.post('/api/hatch/vm/wake', { vm_id: this.lease?.vmId, retry_count: this.wakeRetry++ })
    } catch {
      /* best effort */
    }
  }

  async leaseVm(): Promise<{ vmId: string; vmName: string; gatewayUrl: string }> {
    let last: unknown
    for (const vmType of ['standard', 'hatch_vm']) {
      try {
        const d = await this.post('/api/hatch/lease-vm', { vmType })
        const gatewayUrl = typeof d['gatewayUrl'] === 'string' ? (d['gatewayUrl'] as string) : ''
        const vmName = typeof d['vmName'] === 'string' ? (d['vmName'] as string) : ''
        const vmId = (typeof d['vmId'] === 'string' && d['vmId']) || vmIdFromGateway(gatewayUrl) || vmName
        if (d['status'] === 'assigned' && gatewayUrl && vmId) {
          this.lease = { vmId: String(vmId), vmName: vmName || String(vmId), gatewayUrl }
          return this.lease
        }
        last = new MuseControlPlaneError(`lease-vm: status ${String(d['status'] ?? 'unknown')}`, undefined, 'vm_unavailable')
      } catch (e) {
        if (e instanceof MuseControlPlaneError && e.code === 'signed_out') throw e
        last = e
      }
    }
    throw last instanceof Error ? last : new MuseControlPlaneError('lease-vm failed', undefined, 'vm_unavailable')
  }

  /** Full credential fetch for a Noise connect. */
  async credentials(opts: { forceRefresh?: boolean } = {}): Promise<GatewayCreds> {
    await this.wake()
    const lease = this.lease && !opts.forceRefresh ? this.lease : await this.leaseVm()
    const body: Record<string, unknown> = { vmAddress: lease.gatewayUrl, vmName: lease.vmName }
    if (opts.forceRefresh) body['force_refresh'] = true
    const t = await this.post('/api/hatch/token', body)
    const authToken = typeof t['token'] === 'string' ? (t['token'] as string) : ''
    if (!authToken) throw new MuseControlPlaneError('hatch/token: no token', undefined, 'http')
    let notaryToken = typeof t['notary_token'] === 'string' ? (t['notary_token'] as string) : undefined
    if (!notaryToken) {
      try {
        const n = await this.post('/api/hatch/noise-notary-token', { vmName: lease.vmName })
        const v = n['notaryToken'] ?? n['notary_token']
        if (typeof v === 'string' && v.trim()) notaryToken = v.trim()
      } catch {
        /* optional */
      }
    }
    // delegation.* notary tokens need a client-side endorsement (CVM path); skip them.
    if (notaryToken?.startsWith('delegation.')) notaryToken = undefined
    return { ...lease, authToken, notaryToken }
  }
}
