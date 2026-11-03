/**
 * Minimal ConnectRPC-JSON client for aiserver.v1.GrokBotService.
 *
 * Auth headers observed in Grok Bot.app asar (createSandCursorBackendClient /
 * getSandBackendClientHeaders / createXaiBearerInterceptor):
 *   Authorization: Bearer <accessToken>
 *   x-cursor-client-type / x-cursor-client-version / x-cursor-client-os
 *   x-ghost-mode
 *   x-cursor-checksum (createCursorChecksum(machineId) — exact algo TBD)
 *   x-cursor-team-id (optional)
 *   x-cursor-timezone (optional)
 *   connect-protocol-version: 1
 *
 * Without full protobuf codegen we speak Connect JSON unary. Streaming
 * (WatchGrokBotTranscripts) is left for a follow-up; callers can poll
 * ListGrokBotTranscriptEntries meanwhile.
 */

import type { GrokAuthSession } from './types'

export const GROK_API_BASE = 'https://api2.cursor.sh'
export const GROK_SERVICE = 'aiserver.v1.GrokBotService'

export interface GrokConnectClientOptions {
  baseUrl?: string
  auth: GrokAuthSession
  /** Override fetch (Electron net / undici). */
  fetchImpl?: typeof fetch
  clientVersion?: string
  clientOs?: string
  ghostMode?: boolean
  timeZone?: string
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

/**
 * Placeholder checksum. Official createCursorChecksum(machineId) lives in asar
 * as T_; until we port it, send the raw machine id so servers that only check
 * presence may still accept — callers must treat 401/403 as checksum gaps.
 */
export function approximateCursorChecksum(machineId: string): string {
  return machineId
}

function buildHeaders(opts: GrokConnectClientOptions): Headers {
  const headers = new Headers({
    'content-type': 'application/json',
    'connect-protocol-version': '1',
    authorization: `Bearer ${opts.auth.accessToken}`,
    'x-cursor-client-type': 'sand',
    'x-cursor-client-version': opts.clientVersion ?? 'sand-desktop',
    'x-cursor-client-os': opts.clientOs ?? processPlatform(),
    'x-ghost-mode': opts.ghostMode === true ? 'true' : 'false'
  })
  if (opts.auth.teamId) headers.set('x-cursor-team-id', String(opts.auth.teamId))
  if (opts.auth.machineId) headers.set('x-cursor-checksum', approximateCursorChecksum(opts.auth.machineId))
  if (opts.timeZone) headers.set('x-cursor-timezone', opts.timeZone)
  return headers
}

function processPlatform(): string {
  try {
    const p = (globalThis as { process?: { platform?: string } }).process?.platform
    if (p === 'darwin') return 'darwin'
    if (p === 'win32') return 'win32'
    if (p === 'linux') return 'linux'
  } catch {
    /* ignore */
  }
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
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: buildHeaders(this.opts),
      body: JSON.stringify(body ?? {})
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
      throw new GrokConnectError(res.status, text, code)
    }
    if (!text) return {} as TRes
    try {
      return JSON.parse(text) as TRes
    } catch {
      throw new GrokConnectError(res.status, `non-JSON response: ${text.slice(0, 200)}`)
    }
  }

  listAgents(req: { role?: string; includeTeamAgents?: boolean } = {}) {
    return this.unary<Record<string, unknown>, { agents?: unknown[]; rows?: unknown[] }>(
      'ListGrokBotAgents',
      {
        role: req.role,
        include_team_agents: req.includeTeamAgents ?? false,
        added_team_agents_only: false
      }
    )
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
}
