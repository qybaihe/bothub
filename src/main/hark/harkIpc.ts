import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  HARK_CHANNELS,
  type HarkAuthStatus,
  type HarkImportCredentialsRequest,
  type HarkOpenLoginRequest,
  type HarkRpcRequest,
  type HarkRpcResponse,
  type MuseMediaPartView,
  type MuseRichWidgetView,
  type MuseToolCallView
} from '@shared/ipc'
import {
  callHarkApi,
  cancelHarkWatch,
  clearHarkAccount,
  conversationIdFromPayload,
  downloadHarkArtifact,
  extractMessages,
  fetchConversationSnapshotSummary,
  getAuthSession,
  getConversationStatuses,
  getMainConversation,
  getProfile,
  importHarkCredentials,
  isHarkReplyDone,
  listConversations,
  listSessionCookieNames,
  sendMessage,
  timezoneName,
  uploadHarkAttachment,
  watchHarkConversationSync,
  extractHandle,
  HarkApiError,
  type HarkChatMessage,
  type HarkUploadedAttachment
} from './harkClient'
import { cancelHarkLogin, onHarkLoginEvent, openHarkLoginWindow } from './harkLogin'

function mapHarkTools(msg: HarkChatMessage): MuseToolCallView[] | undefined {
  if (!msg.toolCalls || msg.toolCalls.length === 0) return undefined
  return msg.toolCalls.map((tc) => ({
    id: tc.dispatchId,
    name: tc.name,
    status:
      /^(running|pending|active|started|waiting_for_input|awaiting_input)$/i.test(tc.status)
        ? 'running'
        : /^(failed|errored|error)$/i.test(tc.status)
          ? 'errored'
          : 'completed',
    summary: tc.url || tc.command || tc.result
  }))
}

function mapHarkMedia(msg: HarkChatMessage): MuseMediaPartView[] | undefined {
  if (!msg.artifacts || msg.artifacts.length === 0) return undefined
  return msg.artifacts.map((a) => {
    const path = a.downloadUrl || (a.s3Key ? `harkatt://${a.s3Key}` : a.path)
    const isImg =
      (a.mimeType && a.mimeType.startsWith('image/')) ||
      /\.(png|jpe?g|gif|webp|svg)$/i.test(a.name || a.path || '')
    return {
      kind: isImg ? 'image' : 'file',
      path,
      name: a.name || a.path.split('/').pop() || 'artifact',
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes
    }
  })
}

function mapHarkRichWidgets(msg: HarkChatMessage): MuseRichWidgetView[] | undefined {
  if (!msg.actions || msg.actions.length === 0) return undefined
  return [
    {
      kind: 'text_with_button',
      widgetId: `hark_act_${msg.id}`,
      text: '',
      buttons: msg.actions.map((a) => ({
        label: a.label || `Connect ${a.connector ?? ''}`,
        actionText: a.connector ? `Connect ${a.connector}` : a.label
      }))
    }
  ]
}

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
        const convId = conversationIdFromPayload(data)
        const snap = convId ? await fetchConversationSnapshotSummary(req.accountId, convId) : null
        const rawMessages = snap && snap.messages.length > 0 ? snap.messages : extractMessages(data)
        const messages = rawMessages.map((m) => ({
          ...m,
          media: !/^user$/i.test(m.role) ? mapHarkMedia(m) : undefined,
          richWidgets: !/^user$/i.test(m.role) ? mapHarkRichWidgets(m) : undefined
        }))
        return {
          ok: true,
          data: {
            raw: data,
            conversationId: convId,
            messages,
            panels: snap?.panels ?? [],
            asks: snap?.asks ?? [],
            artifacts: snap?.artifacts ?? [],
            activeActivity: snap?.activeActivity ?? null,
            narration: snap?.narration ?? null
          }
        }
      }
      case 'conversationStatus':
        return { ok: true, data: await getConversationStatuses(req.accountId) }
      case 'sendMessage': {
        if (typeof req.conversationId !== 'string' || !req.conversationId) {
          return { ok: false, status: 400, message: 'conversationId required' }
        }
        const hasAttachments = Array.isArray(req.attachments) && req.attachments.length > 0
        if ((typeof req.text !== 'string' || !req.text.trim()) && !hasAttachments) {
          return { ok: false, status: 400, message: 'text or attachments required' }
        }
        let uploaded: HarkUploadedAttachment[] | undefined
        if (hasAttachments && req.attachments) {
          uploaded = []
          for (const a of req.attachments) {
            if (!a.dataBase64) continue
            uploaded.push(await uploadHarkAttachment(req.accountId, req.conversationId, a))
          }
        }
        const sent = await sendMessage(
          req.accountId,
          req.conversationId,
          (req.text ?? '').trim(),
          req.timezone ?? timezoneName(),
          uploaded
        )
        return {
          ok: true,
          data: {
            result: sent.result,
            idempotencyKey: sent.idempotencyKey,
            responseMessageId: sent.responseMessageId,
            conversationId: req.conversationId
          }
        }
      }
      case 'pollReply': {
        if (typeof req.conversationId !== 'string' || !req.conversationId) {
          return { ok: false, status: 400, message: 'conversationId required' }
        }
        const afterIds = new Set(req.afterMessageIds ?? [])
        const watched = await watchHarkConversationSync(req.accountId, req.conversationId, {
          responseMessageId: req.responseMessageId,
          afterMessageIds: afterIds,
          timeoutMs: req.timeoutMs ?? 90_000,
          onUpdate: (msg, syncState) => {
            const done = isHarkReplyDone(msg)
            const text = msg.content.trim()
            const tools = mapHarkTools(msg)
            const media = mapHarkMedia(msg)
            const richWidgets = mapHarkRichWidgets(msg)
            const activePhrase =
              msg.narration?.trim() ||
              msg.thought?.trim() ||
              syncState.narration?.trim() ||
              syncState.activeActivity?.trim() ||
              ''

            if (!done && activePhrase) {
              broadcast({
                type: 'activity',
                accountId: req.accountId,
                activityCode: 'thinking',
                activityText: activePhrase.slice(0, 120),
                busy: true
              })
            }

            if (!text && !tools?.length && !media?.length && !richWidgets?.length && !done) return
            broadcast({
              type: 'stream',
              accountId: req.accountId,
              conversationId: req.botId,
              messageId: `hark_${msg.id}`,
              text,
              done,
              ...(tools ? { tools } : {}),
              ...(media ? { media } : {}),
              ...(richWidgets ? { richWidgets } : {})
            })
          }
        })

        // Always clear activity when pollReply finishes
        broadcast({
          type: 'activity',
          accountId: req.accountId,
          activityCode: 'idle',
          busy: false
        })

        const finalReply = watched.reply
        if (
          finalReply &&
          (finalReply.content.trim() ||
            finalReply.toolCalls?.length ||
            finalReply.actions?.length ||
            finalReply.artifacts?.length)
        ) {
          const msgId = `hark_${finalReply.id}`
          const tools = mapHarkTools(finalReply)
          const media = mapHarkMedia(finalReply)
          const richWidgets = mapHarkRichWidgets(finalReply)
          broadcast({
            type: 'stream',
            accountId: req.accountId,
            conversationId: req.botId,
            messageId: msgId,
            text: finalReply.content.trim(),
            done: true,
            ...(tools ? { tools } : {}),
            ...(media ? { media } : {}),
            ...(richWidgets ? { richWidgets } : {})
          })
          return {
            ok: true,
            data: {
              conversationId: req.conversationId,
              messages: watched.messages,
              reply: {
                ...finalReply,
                id: msgId,
                tools,
                media,
                richWidgets
              }
            }
          }
        }
        if (req.botId) {
          broadcast({
            type: 'stream',
            accountId: req.accountId,
            conversationId: req.botId,
            messageId: req.responseMessageId ? `hark_${req.responseMessageId}` : 'hark_timeout',
            text: '',
            done: true
          })
        }
        return {
          ok: true,
          data: {
            conversationId: req.conversationId,
            messages: watched.messages,
            reply: null,
            timedOut: true
          }
        }
      }
      case 'downloadArtifact': {
        const downloaded = await downloadHarkArtifact(req.accountId, {
          url: req.url,
          fileId: req.fileId,
          name: req.name
        })
        return { ok: true, data: downloaded }
      }
      case 'call': {
        if (typeof req.path !== 'string' || !req.path.trim()) {
          return { ok: false, status: 400, message: 'path required' }
        }
        if (/pause-agent|stop-tool/i.test(req.path)) {
          cancelHarkWatch(req.accountId)
          broadcast({
            type: 'activity',
            accountId: req.accountId,
            activityCode: 'idle',
            busy: false
          })
        }
        const data = await callHarkApi(req.accountId, {
          method: req.method,
          path: req.path,
          query: req.query,
          body: req.body
        })
        return { ok: true, data }
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

  ipcMain.handle(HARK_CHANNELS.importCredentials, async (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null) {
      throw new TypeError('Invalid hark importCredentials request')
    }
    const req = request as HarkImportCredentialsRequest
    const targetId = typeof req.accountId === 'string' && req.accountId.trim() ? req.accountId.trim() : ''
    if (!targetId) throw new TypeError('accountId required')
    const imported = await importHarkCredentials(targetId, req.rawInput ?? '')
    if (!imported) {
      return { accountId: targetId, signedIn: false }
    }
    const st = await statusFor(targetId)
    if (st.signedIn) {
      broadcast({
        type: 'login',
        accountId: targetId,
        signedIn: true as const,
        handle: st.handle,
        displayName: st.displayName
      })
    }
    return st
  })

  ipcMain.handle(HARK_CHANNELS.clearAuth, async (_event, accountId: unknown) => {
    if (typeof accountId !== 'string' || !accountId.trim()) throw new TypeError('Invalid accountId')
    await clearHarkAccount(accountId.trim())
    broadcast({
      type: 'login',
      accountId: accountId.trim(),
      signedIn: false as const
    })
    return { accountId: accountId.trim(), signedIn: false }
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
