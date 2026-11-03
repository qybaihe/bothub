import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  HARK_CHANNELS,
  type HarkAuthStatus,
  type HarkOpenLoginRequest,
  type HarkRpcRequest,
  type HarkRpcResponse
} from '@shared/ipc'
import {
  conversationIdFromPayload,
  extractMessages,
  getAuthSession,
  getConversationStatuses,
  getMainConversation,
  getProfile,
  listConversations,
  listSessionCookieNames,
  sendMessage,
  timezoneName,
  extractHandle,
  HarkApiError
} from './harkClient'
import { cancelHarkLogin, onHarkLoginEvent, openHarkLoginWindow } from './harkLogin'

function ownerWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined
}

function broadcast(payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send(HARK_CHANNELS.event, payload)
  }
}

async function statusFor(accountId: string): Promise<HarkAuthStatus> {
  try {
    const session = await getAuthSession(accountId)
    if (session && (session.user || session.session)) {
      const { handle, displayName } = extractHandle(session)
      return { accountId, signedIn: true, handle, displayName }
    }
  } catch {
    /* fall through */
  }
  const cookies = await listSessionCookieNames(accountId)
  if (cookies.length > 0) {
    return { accountId, signedIn: true }
  }
  return { accountId, signedIn: false }
}

async function runHarkRpc(req: HarkRpcRequest): Promise<HarkRpcResponse> {
  try {
    switch (req.op) {
      case 'authStatus':
        return { ok: true, data: await statusFor(req.accountId) }
      case 'getSession': {
        const session = await getAuthSession(req.accountId)
        const { handle, displayName } = extractHandle(session)
        // Never return raw session tokens to renderer.
        return {
          ok: true,
          data: {
            accountId: req.accountId,
            signedIn: Boolean(session && (session.user || session.session)),
            handle,
            displayName,
            userId: session?.user?.id
          }
        }
      }
      case 'profile':
        return { ok: true, data: await getProfile(req.accountId) }
      case 'listConversations':
        return { ok: true, data: await listConversations(req.accountId) }
      case 'mainConversation': {
        const data = await getMainConversation(req.accountId, req.timezone ?? timezoneName())
        return {
          ok: true,
          data: {
            raw: data,
            conversationId: conversationIdFromPayload(data),
            messages: extractMessages(data)
          }
        }
      }
      case 'conversationStatus':
        return { ok: true, data: await getConversationStatuses(req.accountId) }
      case 'sendMessage': {
        if (typeof req.conversationId !== 'string' || !req.conversationId) {
          return { ok: false, status: 400, message: 'conversationId required' }
        }
        if (typeof req.text !== 'string' || !req.text.trim()) {
          return { ok: false, status: 400, message: 'text required' }
        }
        const sent = await sendMessage(
          req.accountId,
          req.conversationId,
          req.text.trim(),
          req.timezone ?? timezoneName()
        )
        return {
          ok: true,
          data: { result: sent.result, bodyKeys: sent.bodyKeys, conversationId: req.conversationId }
        }
      }
      case 'pollReply': {
        if (typeof req.conversationId !== 'string' || !req.conversationId) {
          return { ok: false, status: 400, message: 'conversationId required' }
        }
        const afterCount = typeof req.afterMessageCount === 'number' ? req.afterMessageCount : 0
        const afterIds = new Set(req.afterMessageIds ?? [])
        const deadline = Date.now() + (req.timeoutMs ?? 60_000)
        let lastMessages = extractMessages(
          (await getMainConversation(req.accountId, req.timezone ?? timezoneName())) as unknown
        )
        while (Date.now() < deadline) {
          try {
            await getConversationStatuses(req.accountId)
          } catch {
            /* status is best-effort */
          }
          const main = await getMainConversation(req.accountId, req.timezone ?? timezoneName())
          lastMessages = extractMessages(main)
          const assistant = [...lastMessages]
            .reverse()
            .find((m) => /assistant|bot|hark/i.test(m.role) && m.content.trim())
          const grew = lastMessages.length > afterCount
          const fresh =
            assistant &&
            !afterIds.has(assistant.id) &&
            (grew || Boolean(assistant.content.trim()))
          if (fresh && assistant) {
            return {
              ok: true,
              data: {
                conversationId: conversationIdFromPayload(main) ?? req.conversationId,
                messages: lastMessages,
                reply: assistant
              }
            }
          }
          await new Promise((r) => setTimeout(r, 1500))
        }
        return {
          ok: true,
          data: {
            conversationId: req.conversationId,
            messages: lastMessages,
            reply: null,
            timedOut: true
          }
        }
      }
      default:
        return { ok: false, status: 400, message: `Unknown op` }
    }
  } catch (error) {
    if (error instanceof HarkApiError) {
      return {
        ok: false,
        status: error.status,
        message: error.message,
        body: typeof error.body === 'string' ? error.body : JSON.stringify(error.body)
      }
    }
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

let registered = false

export function registerHarkIpc(): void {
  if (registered) return
  registered = true

  onHarkLoginEvent((event) => {
    if (event.signedIn) {
      broadcast({
        type: 'login',
        accountId: event.accountId,
        signedIn: true as const,
        handle: event.handle,
        displayName: event.displayName
      })
      // Cookie names only — never values — for local samples after e2e.
      if (event.sessionCookieNames.length) {
        console.info(
          '[hark] session cookie names:',
          event.sessionCookieNames.join(', ')
        )
      }
    } else {
      broadcast({
        type: 'login',
        accountId: event.accountId,
        signedIn: false as const,
        windowClosed: event.windowClosed
      })
    }
  })

  ipcMain.handle(HARK_CHANNELS.openLogin, async (event, request: unknown) => {
    if (typeof request !== 'object' || request === null) throw new TypeError('Invalid hark openLogin')
    const req = request as HarkOpenLoginRequest
    if (typeof req.accountId !== 'string') throw new TypeError('Invalid accountId')
    await openHarkLoginWindow(req.accountId, ownerWindow(event))
    return statusFor(req.accountId)
  })

  ipcMain.handle(HARK_CHANNELS.cancelLogin, async (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    await cancelHarkLogin(accountId)
    return statusFor(accountId)
  })

  ipcMain.handle(HARK_CHANNELS.authStatus, async (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return statusFor(accountId)
  })

  ipcMain.handle(HARK_CHANNELS.rpc, async (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null) {
      return { ok: false as const, status: 0, message: 'Invalid hark rpc request' }
    }
    const req = request as HarkRpcRequest
    if (typeof req.accountId !== 'string' || typeof req.op !== 'string') {
      return { ok: false as const, status: 0, message: 'accountId and op required' }
    }
    return runHarkRpc(req)
  })
}
