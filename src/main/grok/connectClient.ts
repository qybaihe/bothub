/**
 * Main-process ConnectRPC-JSON client for aiserver.v1.GrokBotService.
 * Runs in Electron main (Node fetch) so the renderer never hits api2 CORS.
 *
 * Checksum: createCursorChecksum from Grok Bot.app asar (see
 * docs/grokbot-protocol/asar-scan/checksum-and-headers.md). Still injectable
 * via setGrokChecksumCalculator for overrides.
 */

import { randomUUID } from 'node:crypto'

export const GROK_API_BASE = 'https://api2.cursor.sh'
export const GROK_SERVICE = 'aiserver.v1.GrokBotService'

/** Match Grok Bot.app (~0.78.x) sand client identity. */
export const GROK_SAND_CLIENT_VERSION = '0.78.1'

export interface GrokMainAuthLike {
  accessToken: string
  teamId?: string
  machineId?: string
  accountSlot?: string
}

export interface GrokConnectClientOptions {
  baseUrl?: string
  auth: GrokMainAuthLike
  fetchImpl?: typeof fetch
  clientVersion?: string
  clientOs?: string
  ghostMode?: boolean
  timeZone?: string
  /** Optional sand box namespace header (omit when unknown). */
  boxNamespace?: string
  /** Override checksum for this client instance. */
  checksumFn?: (machineId: string) => string
}

export class GrokConnectError extends Error {
  readonly status: number
  readonly code?: string
  readonly body: string

  constructor(status: number, body: string, code?: string) {
    super(`Grok ConnectRPC ${status}${code ? ` (${code})` : ''}: ${body.slice(0, 240)}`)
    this.name = 'GrokConnectError'
    this.status = status
    this.body = body
    this.code = code
  }
}

type ChecksumFn = (machineId: string) => string

/** asar F9t — mutates the 6-byte timestamp buffer in place. */
export function obfuscateTimestampBytes(bytes: Uint8Array): Uint8Array {
  let t = 165
  for (let n = 0; n < bytes.length; n++) {
    bytes[n] = (((bytes[n]! ^ t) + (n % 256)) & 255) as number
    t = bytes[n]!
  }
  return bytes
}

/**
 * asar createCursorChecksum / T_.
 * Only call when machineId is non-empty — otherwise omit the header.
 */
export function createCursorChecksum(machineId: string, nowMs: number = Date.now()): string {
  const ts = Math.floor(nowMs / 1e6)
  const n = new Uint8Array([
    (ts >> 40) & 255,
    (ts >> 32) & 255,
    (ts >> 24) & 255,
    (ts >> 16) & 255,
    (ts >> 8) & 255,
    ts & 255
  ])
  obfuscateTimestampBytes(n)
  return Buffer.from(n).toString('base64url') + machineId
}

let globalChecksumFn: ChecksumFn = createCursorChecksum

/** Plug in an alternate checksum without rewriting callers. */
export function setGrokChecksumCalculator(fn: ChecksumFn): void {
  globalChecksumFn = fn
}

export function getGrokChecksumCalculator(): ChecksumFn {
  return globalChecksumFn
}

/** @deprecated use createCursorChecksum — kept as alias for older imports. */
export function approximateCursorChecksum(machineId: string): string {
  return globalChecksumFn(machineId)
}

function sandUserAgent(clientOs: string, clientVersion: string): string {
  const osUa =
    clientOs === 'win32'
      ? '(Windows NT 10.0; Win64; x64)'
      : clientOs === 'linux'
        ? '(X11; Linux x86_64)'
        : '(Macintosh; Intel Mac OS X 10_15_7)'
  return `Mozilla/5.0 ${osUa} AppleWebKit/537.36 (KHTML, like Gecko) Sand/${clientVersion} Chrome/132.0.6834.210 Electron/34.3.0 Safari/537.36`
}

function defaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function buildHeaders(opts: GrokConnectClientOptions): Record<string, string> {
  const checksum = opts.checksumFn ?? globalChecksumFn
  const clientOs = opts.clientOs ?? processPlatform()
  const clientVersion = opts.clientVersion ?? GROK_SAND_CLIENT_VERSION
  const reqId = randomUUID()
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'connect-protocol-version': '1',
    accept: 'application/json',
    'accept-language': 'en-US,en;q=0.9',
    authorization: `Bearer ${opts.auth.accessToken}`,
    'user-agent': sandUserAgent(clientOs, clientVersion),
    'x-cursor-client-type': 'sand',
    'x-cursor-client-version': clientVersion,
    'x-cursor-client-os': clientOs,
    'x-cursor-client-arch': process.arch === 'x64' ? 'x64' : 'arm64',
    'x-cursor-client-device-type': 'desktop',
    'x-ghost-mode': opts.ghostMode === true ? 'true' : 'false',
    'x-request-id': reqId,
    'x-amzn-trace-id': `Root=${reqId}`,
    'x-cursor-timezone': opts.timeZone || defaultTimeZone(),
    'sec-fetch-site': 'cross-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty'
  }
  if (opts.boxNamespace) headers['x-sand-box-namespace'] = opts.boxNamespace
  if (opts.auth.teamId) headers['x-cursor-team-id'] = String(opts.auth.teamId)
  // Only when machineId non-empty (asar behavior).
  const machineId = opts.auth.machineId?.trim()
  if (machineId) headers['x-cursor-checksum'] = checksum(machineId)
  return headers
}

function processPlatform(): string {
  const p = process.platform
  if (p === 'darwin' || p === 'win32' || p === 'linux') return p
  return 'darwin'
}

export class GrokConnectClient {
  private readonly baseUrl: string
  private readonly opts: GrokConnectClientOptions
  private readonly fetchImpl: typeof fetch

  constructor(opts: GrokConnectClientOptions) {
    this.opts = opts
    this.baseUrl = (opts.baseUrl ?? GROK_API_BASE).replace(/\/$/, '')
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  async unary<TReq extends object, TRes = unknown>(method: string, body: TReq): Promise<TRes> {
    const url = `${this.baseUrl}/${GROK_SERVICE}/${method}`
    const maxAttempts = 3
    let lastErr: unknown
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const delayMs = Math.round(350 * Math.pow(1.8, attempt - 1) * (0.85 + Math.random() * 0.3))
        await new Promise((r) => setTimeout(r, delayMs))
      }
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: buildHeaders(this.opts),
          body: JSON.stringify(body ?? {}),
          signal: AbortSignal.timeout(25_000)
        })
        const text = await res.text()
        if (!res.ok) {
          let code: string | undefined
          try {
            const parsed = JSON.parse(text) as { code?: string; error?: { code?: string } }
            code = parsed.code ?? parsed.error?.code
          } catch {
            /* plain body */
          }
          const err = new GrokConnectError(res.status, text, code)
          if ((res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) && attempt + 1 < maxAttempts) {
            lastErr = err
            continue
          }
          throw err
        }
        if (!text) return {} as TRes
        try {
          return JSON.parse(text) as TRes
        } catch {
          throw new GrokConnectError(res.status, `non-JSON response: ${text.slice(0, 200)}`)
        }
      } catch (err) {
        lastErr = err
        if (err instanceof GrokConnectError) throw err
        if (attempt + 1 >= maxAttempts) throw err
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Grok ConnectRPC request failed')
  }

  listAgents(req: { role?: string; includeTeamAgents?: boolean } = {}) {
    return this.unary<Record<string, unknown>>('ListGrokBotAgents', {
      role: req.role,
      include_team_agents: req.includeTeamAgents ?? false,
      added_team_agents_only: false
    })
  }

  listAgentStatuses(req: { agentIds?: string[] } = {}) {
    return this.unary('ListGrokBotAgentStatuses', {
      agent_ids: req.agentIds ?? []
    })
  }

  sendUserMessage(req: {
    agentId: string
    messageId: string
    text: string
    sessionId: string
    machineId?: string
    sentAtMs?: number
  }) {
    return this.unary('SendGrokBotUserMessage', {
      agent_id: req.agentId,
      message_id: req.messageId,
      text: req.text,
      sent_at_ms: req.sentAtMs ?? Date.now(),
      is_fork: false,
      attachment_paths: [],
      attachment_names: [],
      session_id: req.sessionId,
      machine_id: req.machineId ?? this.opts.auth.machineId,
      initiator: 'composer'
    })
  }

  getSendStatus(req: { agentId: string; messageId: string; sessionId: string }) {
    return this.unary('GetGrokBotSendStatus', {
      agent_id: req.agentId,
      message_id: req.messageId,
      session_id: req.sessionId
    })
  }

  listTranscriptEntries(req: {
    agentId: string
    sessionId: string
    limit?: number
    beforeSeq?: string
  }) {
    return this.unary('ListGrokBotTranscriptEntries', {
      agent_id: req.agentId,
      session_id: req.sessionId,
      limit: req.limit ?? 30,
      before_seq: req.beforeSeq
    })
  }

  resolveAutoReview(req: {
    agentId: string
    requestId: string
    resolution: number
    sessionId?: string
    approvalPlatform?: string
    approvedCommand?: string
  }) {
    return this.unary('ResolveGrokBotAutoReviewApproval', {
      agent_id: req.agentId,
      request_id: req.requestId,
      resolution: req.resolution,
      approval_platform: req.approvalPlatform,
      approved_command: req.approvedCommand,
      session_id: req.sessionId
    })
  }

  resolveLocalTool(req: {
    agentId: string
    requestId: string
    resolution: number
    sessionId?: string
  }) {
    return this.unary('ResolveGrokBotLocalToolPermission', {
      agent_id: req.agentId,
      request_id: req.requestId,
      resolution: req.resolution,
      session_id: req.sessionId
    })
  }

  resolveConnectorGrant(req: {
    agentId: string
    requestId: string
    resolution: number
    sessionId?: string
  }) {
    return this.unary('ResolveGrokBotConnectorGrant', {
      agent_id: req.agentId,
      request_id: req.requestId,
      resolution: req.resolution,
      session_id: req.sessionId
    })
  }

  /**
   * Server-streaming WatchGrokBotTranscripts (Connect JSON envelopes).
   * Yields decoded JSON objects from the stream until aborted or ended.
   */
  async *watchTranscripts(
    req: {
      cursors: Array<{
        agent_id: string
        generation?: number
        after_updated_seq?: string | number
        session_id?: string
      }>
      includeUnlistedAgents?: boolean
      inlineBodyMaxBytes?: number
    },
    signal?: AbortSignal
  ): AsyncGenerator<Record<string, unknown>, void, void> {
    const url = `${this.baseUrl}/${GROK_SERVICE}/WatchGrokBotTranscripts`
    const headers = {
      ...buildHeaders(this.opts),
      'content-type': 'application/connect+json',
      accept: 'application/connect+json'
    }
    const body = {
      cursors: req.cursors,
      include_unlisted_agents: req.includeUnlistedAgents ?? true,
      inline_body_max_bytes: req.inlineBodyMaxBytes ?? 65536
    }
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let code: string | undefined
      try {
        const parsed = JSON.parse(text) as { code?: string }
        code = parsed.code
      } catch {
        /* ignore */
      }
      throw new GrokConnectError(res.status, text, code)
    }
    if (!res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = Buffer.alloc(0)
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer = Buffer.concat([buffer, Buffer.from(value)])
        while (buffer.length >= 5) {
          const flags = buffer[0]!
          const len = buffer.readUInt32BE(1)
          if (buffer.length < 5 + len) break
          const payload = buffer.subarray(5, 5 + len)
          buffer = buffer.subarray(5 + len)
          if (flags & 0x02) {
            // end-stream trailer
            if (payload.length) {
              try {
                const trailer = JSON.parse(payload.toString('utf8')) as {
                  error?: { code?: string; message?: string }
                }
                if (trailer.error) {
                  throw new GrokConnectError(
                    0,
                    trailer.error.message ?? 'watch ended with error',
                    trailer.error.code
                  )
                }
              } catch (error) {
                if (error instanceof GrokConnectError) throw error
              }
            }
            return
          }
          if (!payload.length) continue
          try {
            yield JSON.parse(decoder.decode(payload)) as Record<string, unknown>
          } catch {
            /* skip malformed frame */
          }
        }
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        /* ignore */
      }
    }
  }

}

