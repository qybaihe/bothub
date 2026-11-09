import { BrowserWindow } from 'electron'
import {
  GROK_CHANNELS,
  type GrokMainEvent,
  type GrokRpcRequest,
  type GrokRpcResponse,
  type MuseMediaPartView,
  type MuseOptionWidgetView,
  type MuseToolCallView
} from '@shared/ipc'
import { getGrokMainAuth, setGrokMainAuth } from './grokAuthStore'
import { GrokConnectClient, GrokConnectError } from './connectClient'
import { getOrCreateGrokMachineId } from './grokMachineId'
import { forceRefreshSandAccessToken, getValidSandAccessToken } from './grokSandAuth'

function broadcastGrokEvent(event: GrokMainEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send(GROK_CHANNELS.event, event)
  }
}

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


function decodeTranscriptBody(raw: Record<string, unknown>): Record<string, unknown> {
  const body = raw['body']
  if (typeof body === 'string' && body.length > 0) {
    try {
      const parsed = JSON.parse(Buffer.from(body, 'base64').toString('utf8')) as Record<string, unknown>
      return { ...raw, ...parsed }
    } catch {
      return raw
    }
  }
  return raw
}

function textFromEntry(e: Record<string, unknown>): string {
  const msg = e['message'] as Record<string, unknown> | undefined
  const widget = msg?.['widget'] as Record<string, unknown> | undefined
  const t =
    (typeof e['text'] === 'string' && e['text']) ||
    (typeof e['content'] === 'string' && e['content']) ||
    (typeof msg?.['text'] === 'string' && (msg['text'] as string)) ||
    (typeof msg?.['content'] === 'string' && (msg['content'] as string)) ||
    (typeof widget?.['prompt'] === 'string' && (widget['prompt'] as string)) ||
    (typeof widget?.['title'] === 'string' && (widget['title'] as string)) ||
    ''
  return t.trim()
}

function extractGrokWidgets(e: Record<string, unknown>): MuseOptionWidgetView[] | undefined {
  const msg = e['message'] as Record<string, unknown> | undefined
  const widget = msg?.['widget'] as Record<string, unknown> | undefined
  if (!widget || !Array.isArray(widget['options'])) return undefined
  const options = (widget['options'] as Array<Record<string, unknown>>)
    .map((o) => String(o['label'] ?? o['text'] ?? o['id'] ?? '').trim())
    .filter(Boolean)
  if (options.length === 0) return undefined
  const resp = widget['response'] as Record<string, unknown> | undefined
  return [
    {
      kind: 'option',
      widgetId: String(widget['id'] ?? e['id'] ?? 'grok_w'),
      options,
      buttonStyle: 'center_aligned_filled',
      baseVersion: 1,
      selectedText: resp?.['optionId'] ? String(resp['optionId']) : undefined
    }
  ]
}

function extractGrokMedia(e: Record<string, unknown>): MuseMediaPartView[] | undefined {
  const msg = e['message'] as Record<string, unknown> | undefined
  const att = (msg?.['attachment'] ?? e['attachment']) as Record<string, unknown> | undefined
  if (!att || typeof att !== 'object') return undefined
  const path = String(att['path'] ?? att['url'] ?? '').trim()
  if (!path) return undefined
  const mime = typeof att['mimeType'] === 'string' ? att['mimeType'] : undefined
  return [
    {
      kind: mime?.startsWith('image/') ? 'image' : 'file',
      path,
      name: String(att['name'] ?? path.split('/').pop() ?? 'attachment'),
      mimeType: mime
    }
  ]
}

function isAssistantEntry(e: Record<string, unknown>, afterMessageId?: string): boolean {
  const id = String(e['id'] ?? e['message_id'] ?? e['messageId'] ?? e['clientNonce'] ?? '')
  if (afterMessageId && (id === afterMessageId || String(e['clientNonce'] ?? '') === afterMessageId)) {
    return false
  }
  const role = String(e['role'] ?? '')
  const kind = String(e['kind'] ?? e['entryKind'] ?? e['type'] ?? '')
  if (/^user$/i.test(role) || /^user-attachment$/i.test(kind) || /^event$/i.test(kind)) return false
  return Boolean(textFromEntry(e) || extractGrokWidgets(e)?.length || extractGrokMedia(e)?.length)
}

const GROK_REPLY_SETTLE_MS = 15_000

async function watchUntilReply(
  client: GrokConnectClient,
  args: {
    accountId: string
    conversationId?: string
    agentId: string
    sessionId: string
    afterUpdatedSeq?: string
    afterMessageId?: string
    timeoutMs?: number
  }
): Promise<{
  text: string
  messageId?: string
  entry?: Record<string, unknown>
  widgets?: MuseOptionWidgetView[]
  tools?: MuseToolCallView[]
  media?: MuseMediaPartView[]
}> {
  const timeoutMs = args.timeoutMs ?? 90_000
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  let latestText = ''
  let latestId = ''
  let latestEntry: Record<string, unknown> | undefined
  let latestWidgets: MuseOptionWidgetView[] | undefined
  let latestMedia: MuseMediaPartView[] | undefined
  const collectedTools = new Map<string, MuseToolCallView>()
  let idleSettleTimer: ReturnType<typeof setTimeout> | undefined

  // Agents often post a short ack, keep working, then post the real answer.
  // Stopping 1.6 s after the first finished entry dropped those later
  // messages, so wait for a quiet period instead.
  const armSettle = () => {
    if (idleSettleTimer) clearTimeout(idleSettleTimer)
    idleSettleTimer = setTimeout(() => ac.abort(), GROK_REPLY_SETTLE_MS)
  }

  try {
    const cursors = [
      {
        agent_id: args.agentId,
        generation: 0,
        after_updated_seq: args.afterUpdatedSeq ?? '0',
        session_id: args.sessionId
      }
    ]
    for await (const frame of client.watchTranscripts({ cursors }, ac.signal)) {
      const rows =
        (frame['rows'] as Record<string, unknown> | undefined) ??
        (frame['Rows'] as Record<string, unknown> | undefined) ??
        (Array.isArray(frame['entries']) ? frame : undefined)
      if (!rows) continue
      const entries = (Array.isArray(rows['entries']) ? rows['entries'] : []) as Record<
        string,
        unknown
      >[]
      for (const raw of entries) {
        const e = decodeTranscriptBody(raw)
        const kind = String(e['kind'] ?? e['entryKind'] ?? '')
        if (/^event$/i.test(kind)) {
          const evId = String(e['id'] ?? `ev_${collectedTools.size}`)
          const evName = String(e['eventType'] ?? e['toolName'] ?? e['title'] ?? 'Tool')
          const evSummary = String(e['summary'] ?? e['text'] ?? '').trim() || undefined
          collectedTools.set(evId, {
            id: evId,
            name: evName,
            status: 'completed',
            summary: evSummary
          })
          continue
        }
        if (!isAssistantEntry(e, args.afterMessageId)) continue
        const text = textFromEntry(e)
        const widgets = extractGrokWidgets(e)
        const media = extractGrokMedia(e)
        if (!text && !widgets?.length && !media?.length) continue
        const rawId = String(e['id'] ?? e['message_id'] ?? e['messageId'] ?? 'reply')
        const msgId = `grok_${rawId}`
        const isStreaming = e['isStreaming'] === true || e['is_streaming'] === true
        latestText = text
        latestId = msgId
        latestEntry = e
        if (widgets?.length) latestWidgets = widgets
        if (media?.length) latestMedia = media
        const toolsArr = collectedTools.size > 0 ? [...collectedTools.values()] : undefined

        broadcastGrokEvent({
          type: 'stream',
          accountId: args.accountId,
          conversationId: args.conversationId,
          agentId: args.agentId,
          messageId: msgId,
          text,
          done: !isStreaming,
          ...(latestWidgets ? { widgets: latestWidgets } : {}),
          ...(toolsArr ? { tools: toolsArr } : {}),
          ...(latestMedia ? { media: latestMedia } : {})
        })

        if (!isStreaming) {
          armSettle()
        } else if (idleSettleTimer) {
          clearTimeout(idleSettleTimer)
        }
      }
    }
    const toolsArr = collectedTools.size > 0 ? [...collectedTools.values()] : undefined
    return {
      text: latestText,
      messageId: latestId || undefined,
      entry: latestEntry,
      widgets: latestWidgets,
      tools: toolsArr,
      media: latestMedia
    }
  } catch (error) {
    // Our own timers end the watch by aborting; anything else (4xx/5xx,
    // server close) with nothing collected must surface so the caller can
    // refresh auth or fall back to polling instead of showing no reply.
    if (!ac.signal.aborted && !latestText && !latestWidgets?.length && !latestMedia?.length) throw error
    const toolsArr = collectedTools.size > 0 ? [...collectedTools.values()] : undefined
    return {
      text: latestText,
      messageId: latestId || undefined,
      entry: latestEntry,
      widgets: latestWidgets,
      tools: toolsArr,
      media: latestMedia
    }
  } finally {
    clearTimeout(timer)
    if (idleSettleTimer) clearTimeout(idleSettleTimer)
  }
}

/** One attempt of a typed Grok RPC. */
async function runGrokRpcOnce(request: GrokRpcRequest): Promise<GrokRpcResponse> {
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
      case 'watchUntilReply': {
        const data = await watchUntilReply(client, {
          accountId: request.accountId,
          conversationId: request.conversationId,
          agentId: request.agentId,
          sessionId: request.sessionId ?? defaultSession,
          afterUpdatedSeq: request.afterUpdatedSeq,
          afterMessageId: request.afterMessageId,
          timeoutMs: request.timeoutMs
        })
        return { ok: true, data }
      }
      case 'call': {
        if (!request.method || !/^[A-Za-z0-9_]+$/.test(request.method)) {
          throw new Error('Invalid GrokBotService method name')
        }
        const data = await client.unary(request.method, request.params ?? {})
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

/** Dispatch a typed Grok RPC; on 401 refresh sand token once and retry. */
export async function runGrokRpc(request: GrokRpcRequest): Promise<GrokRpcResponse> {
  const first = await runGrokRpcOnce(request)
  if (first.ok || first.status !== 401) return first
  const refreshed = await forceRefreshSandAccessToken(request.accountId).catch(() => null)
  if (!refreshed?.accessToken) return first
  const stored = getGrokMainAuth(request.accountId)
  setGrokMainAuth({
    accountId: request.accountId,
    accessToken: refreshed.accessToken,
    accountSlot: stored?.accountSlot,
    teamId: refreshed.selectedTeamId ?? stored?.teamId,
    machineId: stored?.machineId ?? getOrCreateGrokMachineId(request.accountId)
  })
  return runGrokRpcOnce(request)
}
