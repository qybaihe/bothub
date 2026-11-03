import { getGrokMainAuth, setGrokMainAuth } from './grokAuthStore'
import { GrokConnectClient, GrokConnectError } from './connectClient'
import { getOrCreateGrokMachineId } from './grokMachineId'
import type { GrokRpcRequest, GrokRpcResponse } from '@shared/ipc'

function ensureAuth(accountId: string) {
  const auth = getGrokMainAuth(accountId)
  if (!auth?.accessToken) {
    throw new GrokConnectError(401, 'Not signed in', 'not-connected')
  }
  const machineId = auth.machineId?.trim() || getOrCreateGrokMachineId(accountId)
  if (machineId !== auth.machineId) {
    setGrokMainAuth({ ...auth, machineId })
  }
  return { ...auth, machineId }
}

function clientFor(accountId: string, timeZone?: string): GrokConnectClient {
  const auth = ensureAuth(accountId)
  return new GrokConnectClient({
    auth: {
      accessToken: auth.accessToken,
      teamId: auth.teamId,
      machineId: auth.machineId,
      accountSlot: auth.accountSlot
    },
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

/** Dispatch a typed Grok RPC using the account's in-memory Hub token. */
export async function runGrokRpc(request: GrokRpcRequest): Promise<GrokRpcResponse> {
  try {
    const client = clientFor(request.accountId, request.timeZone)
    const auth = ensureAuth(request.accountId)
    const defaultSession = auth.accountSlot ?? request.accountId

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
