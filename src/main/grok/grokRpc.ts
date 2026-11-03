import { getGrokMainAuth, setGrokMainAuth } from './grokAuthStore'
import { GrokConnectClient, GrokConnectError } from './connectClient'
import { getOrCreateGrokMachineId } from './grokMachineId'
import { getValidSandAccessToken } from './grokSandAuth'
import type { GrokRpcRequest, GrokRpcResponse } from '@shared/ipc'

/**
 * Resolve the write-capable sand accessToken for an account.
 * Writes (Send/Transcript/approvals) require the PKCE sand token, not the
 * web WorkosCursorSessionToken. Falls back to the in-memory web token only
 * when no sand token exists (read-only ListAgents still works with it).
 */
async function resolveClientAuth(accountId: string): Promise<{
  accessToken: string
  teamId?: string
  machineId: string
  accountSlot?: string
}> {
  const stored = getGrokMainAuth(accountId)
  const machineId = stored?.machineId?.trim() || getOrCreateGrokMachineId(accountId)
  if (machineId !== stored?.machineId && stored) {
    setGrokMainAuth({ ...stored, machineId })
  }
  const sand = await getValidSandAccessToken(accountId)
  if (sand?.accessToken) {
    return {
      accessToken: sand.accessToken,
      teamId: sand.selectedTeamId ?? stored?.teamId,
      machineId,
      accountSlot: stored?.accountSlot
    }
  }
  if (stored?.accessToken) {
    // Legacy web token: reads only; writes will 401 until sand login runs.
    return {
      accessToken: stored.accessToken,
      teamId: stored.teamId,
      machineId,
      accountSlot: stored.accountSlot
    }
  }
  throw new GrokConnectError(401, 'Not signed in (no sand or web token)', 'not-connected')
}

async function clientFor(accountId: string, timeZone?: string): Promise<GrokConnectClient> {
  const auth = await resolveClientAuth(accountId)
  return new GrokConnectClient({
    auth,
    timeZone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  })
}

function fail(error: unknown): GrokRpcResponse {
  if (error instanceof GrokConnectError) {
    return {
      ok: false,
      status: error.status,
      code: error.code,
      message: error.message,
      body: error.body.slice(0, 2000)
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, status: 0, message }
}

/** Dispatch a typed Grok RPC using the account's sand (or web) token. */
export async function runGrokRpc(request: GrokRpcRequest): Promise<GrokRpcResponse> {
  try {
    const client = await clientFor(request.accountId, request.timeZone)
    const auth = await resolveClientAuth(request.accountId)
    // Sand treats a non-empty unknown session_id as agent-not-found (404).
    // Empty string is accepted for Send/Transcript/approvals; callers may override.
    const defaultSession = ""

    switch (request.op) {
      case 'listAgents': {
        const data = await client.listAgents({
          role: request.role,
          includeTeamAgents: request.includeTeamAgents
        })
        return { ok: true, data }
      }
      case 'listAgentStatuses': {
        const data = await client.listAgentStatuses({ agentIds: request.agentIds })
        return { ok: true, data }
      }
      case 'sendUserMessage': {
        const data = await client.sendUserMessage({
          agentId: request.agentId,
          messageId: request.messageId,
          text: request.text,
          sessionId: request.sessionId ?? defaultSession,
          machineId: request.machineId ?? auth.machineId,
          sentAtMs: request.sentAtMs
        })
        return { ok: true, data }
      }
      case 'getSendStatus': {
        const data = await client.getSendStatus({
          agentId: request.agentId,
          messageId: request.messageId,
          sessionId: request.sessionId ?? defaultSession
        })
        return { ok: true, data }
      }
      case 'listTranscriptEntries': {
        const data = await client.listTranscriptEntries({
          agentId: request.agentId,
          sessionId: request.sessionId ?? defaultSession,
          limit: request.limit,
          beforeSeq: request.beforeSeq
        })
        return { ok: true, data }
      }
      case 'resolveAutoReview': {
        const data = await client.resolveAutoReview({
          agentId: request.agentId,
          requestId: request.requestId,
          resolution: request.resolution,
          sessionId: request.sessionId ?? defaultSession,
          approvalPlatform: request.approvalPlatform,
          approvedCommand: request.approvedCommand
        })
        return { ok: true, data }
      }
      case 'resolveLocalTool': {
        const data = await client.resolveLocalTool({
          agentId: request.agentId,
          requestId: request.requestId,
          resolution: request.resolution,
          sessionId: request.sessionId ?? defaultSession
        })
        return { ok: true, data }
      }
      case 'resolveConnectorGrant': {
        const data = await client.resolveConnectorGrant({
          agentId: request.agentId,
          requestId: request.requestId,
          resolution: request.resolution,
          sessionId: request.sessionId ?? defaultSession
        })
        return { ok: true, data }
      }
      default: {
        const _exhaustive: never = request
        return {
          ok: false,
          status: 0,
          message: `Unknown grok op: ${String((_exhaustive as { op?: string }).op)}`
        }
      }
    }
  } catch (error) {
    return fail(error)
  }
}
