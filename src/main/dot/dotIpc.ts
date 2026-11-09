import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  DOT_CHANNELS,
  type DotImportCredentialsRequest,
  type DotMainEvent,
  type DotOpenLoginRequest,
  type DotRpcRequest,
  type DotRpcResponse
} from '@shared/ipc'
import {
  callDotApi,
  cancelDotTurn,
  clearAllStoredDotAccounts,
  clearDotThreadGoal,
  clearStoredDotAccount,
  createDot,
  createDotPage,
  deleteDot,
  deleteDotPage,
  DotApiError,
  dotAttachmentsToMedia,
  downloadDotFile,
  ensureCelsiusWatcher,
  exportDotMemorySnapshot,
  getDot,
  getDotAuthStatus,
  getDotRateLimits,
  getDotThreadGoal,
  getStoredDotAccount,
  importDotCredentialsFromRaw,
  importDotMemorySnapshot,
  isDotAckMessage,
  listDotLibraryNodes,
  listDotModels,
  listDots,
  listDotThreads,
  listRoomMessages,
  listStoredDotAccounts,
  onDotRealtimeEvent,
  patchStoredDotAccount,
  pauseDotRuntime,
  resumeDotRuntime,
  sendAndWatchDotRoomReply,
  setDotThreadGoal,
  streamDotNativeTurn
} from './dotClient'
import { cancelDotLogin, onDotLoginEvent, openDotLoginWindow } from './dotLogin'
import { resolveDotTarget } from '@shared/dotTarget'

function ownerWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined
}

function broadcast(payload: DotMainEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue
    win.webContents.send(DOT_CHANNELS.event, payload)
  }
}

export async function runDotRpc(req: DotRpcRequest): Promise<DotRpcResponse> {
  try {
    switch (req.op) {
      case 'authStatus':
        return { ok: true, data: await getDotAuthStatus(req.accountId) }
      case 'listStoredAccounts':
        return {
          ok: true,
          data: listStoredDotAccounts().map((a) => ({
            accountId: a.accountId,
            handle: a.email || a.displayName || a.accountId,
            displayName: a.displayName || a.email || a.accountId,
            planType: a.planType,
            activeDotId: a.activeDotId,
            roomId: a.roomId,
            mode: a.mode ?? 'dot',
            model: a.model ?? 'gpt-6-astra',
            effort: a.effort ?? 'medium',
            hasRefreshToken: Boolean(a.refreshToken),
            expiresAtMs: a.expiresAtMs,
            updatedAt: a.updatedAtMs,
            hasProxy: Boolean(a.proxyUrl)
          }))
        }
      case 'listDots':
        return { ok: true, data: await listDots(req.accountId, req.ensureDefault ?? true) }
      case 'createDot':
        return {
          ok: true,
          data: await createDot(req.accountId, {
            displayName: req.displayName,
            color: req.color
          })
        }
      case 'getDot':
        return { ok: true, data: await getDot(req.accountId, req.dotId) }
      case 'deleteDot':
        return { ok: true, data: await deleteDot(req.accountId, req.dotId) }
      case 'selectDot': {
        const dot = await getDot(req.accountId, req.dotId)
        patchStoredDotAccount(req.accountId, {
          activeDotId: dot.id,
          roomId: dot.messagingRoomId,
          threadId: dot.activeRootThreadId,
          ...(req.botId ? { botId: req.botId } : {})
        })
        void ensureCelsiusWatcher(req.accountId, dot.messagingRoomId)
        const history = await listRoomMessages(req.accountId, {
          roomId: dot.messagingRoomId,
          dotId: dot.id,
          limit: 32
        })
        return {
          ok: true,
          data: {
            dot,
            roomId: history.roomId,
            messages: history.messages.map((m) => ({
              ...m,
              media: dotAttachmentsToMedia(m.attachments)
            }))
          }
        }
      }
      case 'pauseRuntime':
        broadcast({
          type: 'activity',
          accountId: req.accountId,
          activityCode: 'idle',
          busy: false
        })
        return { ok: true, data: await pauseDotRuntime(req.accountId, req.dotId) }
      case 'resumeRuntime':
        return { ok: true, data: await resumeDotRuntime(req.accountId, req.dotId) }
      case 'cancelTurn':
        broadcast({
          type: 'activity',
          accountId: req.accountId,
          activityCode: 'idle',
          busy: false
        })
        return { ok: true, data: await cancelDotTurn(req.accountId, req.dotId) }
      case 'listThreads':
        return { ok: true, data: await listDotThreads(req.accountId, req.dotId) }
      case 'listRoomMessages': {
        const listed = await listRoomMessages(req.accountId, {
          roomId: req.roomId,
          dotId: req.dotId,
          limit: req.limit ?? 32,
          after: req.after
        })
        return {
          ok: true,
          data: {
            roomId: listed.roomId,
            messages: listed.messages.map((m) => ({
              ...m,
              media: dotAttachmentsToMedia(m.attachments)
            }))
          }
        }
      }
      case 'setMode': {
        const updated = patchStoredDotAccount(req.accountId, {
          mode: req.mode,
          ...(req.model ? { model: req.model } : {}),
          ...(req.effort ? { effort: req.effort } : {})
        })
        return { ok: true, data: updated ?? (await getDotAuthStatus(req.accountId)) }
      }
      case 'sendMessage': {
        const acc = getStoredDotAccount(req.accountId)
        // After a profile switch the renderer can still name the old dot/room.
        const target = resolveDotTarget(req, acc)
        const mode = req.mode ?? acc?.mode ?? 'dot'
        if (req.botId) {
          patchStoredDotAccount(req.accountId, { botId: req.botId })
        }

        const runNativeTurn = async () => {
          const out = await streamDotNativeTurn(req.accountId, {
            text: req.text,
            model: req.model ?? acc?.model ?? 'gpt-6-astra',
            effort: req.effort ?? acc?.effort ?? 'medium',
            onActivity: (code, text, busy) => {
              broadcast({
                type: 'activity',
                accountId: req.accountId,
                activityCode: code,
                activityText: text,
                busy
              })
            },
            onDelta: ({ messageId, text, done, tools, richWidgets }) => {
              broadcast({
                type: 'stream',
                accountId: req.accountId,
                conversationId: req.botId,
                messageId,
                text,
                done,
                ...(tools ? { tools } : {}),
                ...(richWidgets ? { richWidgets } : {})
              })
            }
          })
          return {
            ok: true as const,
            data: {
              mode: 'native',
              threadId: out.threadId,
              reply: {
                id: out.messageId,
                text: out.text,
                tools: out.tools
              }
            }
          }
        }

        if (mode === 'native') {
          return await runNativeTurn()
        }

        // Default: Calpico Room + Celsius WS mode (`mode === 'dot'`)
        const result = await sendAndWatchDotRoomReply(req.accountId, {
          botId: req.botId,
          dotId: target.dotId,
          roomId: target.roomId,
          text: req.text,
          onActivity: (code, text, busy) => {
            broadcast({
              type: 'activity',
              accountId: req.accountId,
              activityCode: code,
              activityText: text,
              busy
            })
          },
          onMessage: (msg, done, stillBusy) => {
            const media = dotAttachmentsToMedia(msg.attachments)
            const msgId = msg.id.startsWith('dot_') ? msg.id : `dot_${msg.id}`
            broadcast({
              type: 'stream',
              accountId: req.accountId,
              conversationId: req.botId ?? acc?.botId,
              dotId: target.dotId ?? acc?.activeDotId,
              messageId: msgId,
              text: msg.text,
              done,
              ...(stillBusy ? { stillBusy: true } : {}),
              ...(media ? { media } : {})
            })
          }
        })

        // Always ensure idle state after sendAndWatchDotRoomReply resolves
        broadcast({
          type: 'activity',
          accountId: req.accountId,
          activityCode: 'idle',
          busy: false
        })

        const hydratedReplies = result.replies.map((r) => ({
          ...r,
          id: r.id.startsWith('dot_') ? r.id : `dot_${r.id}`,
          media: dotAttachmentsToMedia(r.attachments)
        }))
        const lastReply = hydratedReplies[hydratedReplies.length - 1] ?? null
        return {
          ok: true,
          data: {
            mode: 'dot',
            roomId: result.roomId,
            sentMessage: result.sentMessage,
            replies: hydratedReplies,
            reply: lastReply
          }
        }
      }
      case 'rateLimits':
        return { ok: true, data: await getDotRateLimits(req.accountId) }
      case 'listModels':
        return { ok: true, data: await listDotModels(req.accountId) }
      case 'listLibrary':
        return { ok: true, data: await listDotLibraryNodes(req.accountId, req.limit ?? 25) }
      case 'createPage':
        return { ok: true, data: await createDotPage(req.accountId, req.title, req.layout ?? 'document') }
      case 'deletePage':
        return { ok: true, data: await deleteDotPage(req.accountId, req.pageId) }
      case 'getGoal':
        return { ok: true, data: await getDotThreadGoal(req.accountId, req.threadId) }
      case 'setGoal':
        return { ok: true, data: await setDotThreadGoal(req.accountId, req.goal, req.threadId) }
      case 'clearGoal':
        return { ok: true, data: await clearDotThreadGoal(req.accountId, req.threadId) }
      case 'exportMemory': {
        const snap = await exportDotMemorySnapshot(req.accountId, {
          mode: req.mode ?? 'fast',
          dotId: req.dotId,
          roomId: req.roomId,
          onActivity: (code, text, busy) => {
            broadcast({
              type: 'activity',
              accountId: req.accountId,
              activityCode: code,
              activityText: text,
              busy
            })
          }
        })
        broadcast({
          type: 'activity',
          accountId: req.accountId,
          activityCode: 'idle',
          busy: false
        })
        return { ok: true, data: snap }
      }
      case 'importMemory': {
        const acc = getStoredDotAccount(req.accountId)
        const targetBotId = req.botId ?? acc?.botId
        const res = await importDotMemorySnapshot(req.accountId, {
          markdown: req.markdown,
          goal: req.goal,
          botId: targetBotId,
          dotId: req.dotId,
          roomId: req.roomId,
          onActivity: (code, text, busy) => {
            broadcast({
              type: 'activity',
              accountId: req.accountId,
              activityCode: code,
              activityText: text,
              busy
            })
          },
          onMessage: (msg, done) => {
            broadcast({
              type: 'stream',
              accountId: req.accountId,
              conversationId: targetBotId,
              dotId: req.dotId ?? acc?.activeDotId,
              messageId: msg.id.startsWith('dot_') ? msg.id : `dot_${msg.id}`,
              text: msg.text,
              done
            })
          }
        })
        broadcast({
          type: 'activity',
          accountId: req.accountId,
          activityCode: 'idle',
          busy: false
        })
        const lastReply = res.replies[res.replies.length - 1] ?? null
        return {
          ok: true,
          data: {
            roomId: res.roomId,
            goalRestored: res.goalRestored,
            replies: res.replies,
            reply: lastReply
              ? { ...lastReply, id: lastReply.id.startsWith('dot_') ? lastReply.id : `dot_${lastReply.id}` }
              : null
          }
        }
      }
      case 'downloadFile':
        return {
          ok: true,
          data: await downloadDotFile(req.accountId, {
            fileId: req.fileId,
            url: req.downloadUrl || req.url,
            roomId: req.roomId,
            name: req.name
          })
        }
      case 'call':
        return {
          ok: true,
          data: await callDotApi(req.accountId, {
            method: req.method,
            path: req.path,
            query: req.query,
            body: req.body
          })
        }
      default:
        return { ok: false, status: 400, message: 'Unknown Dot RPC op' }
    }
  } catch (error) {
    if (error instanceof DotApiError) {
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

export function registerDotIpc(): void {
  if (registered) return
  registered = true

  onDotLoginEvent((event) => {
    if (event.signedIn) {
      broadcast({
        type: 'login',
        accountId: event.accountId,
        signedIn: true,
        handle: event.handle,
        displayName: event.displayName,
        planType: event.planType,
        chatgptAccountId: event.chatgptAccountId
      })
    } else {
      broadcast({
        type: 'login',
        accountId: event.accountId,
        signedIn: false,
        windowClosed: event.windowClosed
      })
    }
  })

  // Forward asynchronous / autonomous Dot messages (e.g., clock triggers, delayed Phase-2 file replies) to renderer
  onDotRealtimeEvent((ev) => {
    if (
      ev.type === 'message' &&
      ev.message.role === 'bot' &&
      (ev.message.text || (ev.message.attachments && ev.message.attachments.length > 0))
    ) {
      const media = dotAttachmentsToMedia(ev.message.attachments)
      const stillBusy = isDotAckMessage(ev.message)
      const msgId = ev.message.id.startsWith('dot_') ? ev.message.id : `dot_${ev.message.id}`
      broadcast({
        type: 'stream',
        accountId: ev.accountId,
        conversationId: ev.botId,
        dotId: ev.dotId,
        messageId: msgId,
        text: ev.message.text,
        done: ev.done,
        ...(stillBusy ? { stillBusy: true } : {}),
        ...(media ? { media } : {})
      })
    } else if (ev.type === 'activity') {
      broadcast({
        type: 'activity',
        accountId: ev.accountId,
        activityCode: ev.code,
        activityText: ev.text,
        busy: ev.busy
      })
    }
  })

  ipcMain.handle(DOT_CHANNELS.openLogin, async (event, request: unknown) => {
    if (typeof request !== 'object' || request === null) throw new TypeError('Invalid dot openLogin')
    const req = request as DotOpenLoginRequest
    if (typeof req.accountId !== 'string') throw new TypeError('Invalid accountId')
    await openDotLoginWindow(req.accountId, ownerWindow(event))
    return getDotAuthStatus(req.accountId)
  })

  ipcMain.handle(DOT_CHANNELS.cancelLogin, async (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    await cancelDotLogin(accountId)
    return getDotAuthStatus(accountId)
  })

  ipcMain.handle(DOT_CHANNELS.authStatus, async (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return getDotAuthStatus(accountId)
  })

  ipcMain.handle(DOT_CHANNELS.importCredentials, async (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null) {
      throw new TypeError('Invalid dot importCredentials request')
    }
    const req = request as DotImportCredentialsRequest
    let preExported: Awaited<ReturnType<typeof exportDotMemorySnapshot>> | null = null
    if (req.migrateDataFromAccountId) {
      const prevAcc = getStoredDotAccount(req.migrateDataFromAccountId)
      if (prevAcc?.accessToken) {
        preExported = await exportDotMemorySnapshot(req.migrateDataFromAccountId, {
          mode: 'fast'
        }).catch(() => null)
      }
    }
    const stored = await importDotCredentialsFromRaw(req.accountId, req.rawInput ?? '', {
      refreshToken: req.refreshToken,
      chatgptAccountId: req.chatgptAccountId,
      proxyUrl: req.proxyUrl
    })
    let migration: { goalCopied: boolean; memoriesCopied: number } | undefined
    if (
      preExported &&
      (preExported.goal || preExported.globalMemoriesCount > 0 || preExported.roomMessagesCount > 0)
    ) {
      let goalCopied = false
      if (preExported.goal) {
        await setDotThreadGoal(req.accountId, preExported.goal)
          .then(() => {
            goalCopied = true
          })
          .catch(() => undefined)
      }
      const memoriesCopied = preExported.globalMemoriesCount + preExported.roomMessagesCount
      if (memoriesCopied > 0 && preExported.markdown) {
        void importDotMemorySnapshot(req.accountId, {
          markdown: preExported.markdown,
          goal: preExported.goal
        }).catch(() => undefined)
      }
      migration = { goalCopied, memoriesCopied }
    }
    const st = await getDotAuthStatus(req.accountId)
    broadcast({
      type: 'login',
      accountId: req.accountId,
      signedIn: true,
      handle: st.handle,
      displayName: st.displayName,
      planType: stored.planType,
      chatgptAccountId: stored.chatgptAccountId
    })
    return {
      ...st,
      ...(migration ? { migration } : {})
    }
  })

  ipcMain.handle(DOT_CHANNELS.clearAuth, async (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    if (accountId === '*') {
      clearAllStoredDotAccounts()
      return { accountId: '*', signedIn: false }
    }
    clearStoredDotAccount(accountId)
    broadcast({
      type: 'login',
      accountId,
      signedIn: false
    })
    return getDotAuthStatus(accountId)
  })

  ipcMain.handle(DOT_CHANNELS.rpc, async (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null) {
      return { ok: false as const, status: 0, message: 'Invalid dot rpc request' }
    }
    const req = request as DotRpcRequest
    if (typeof req.accountId !== 'string' || typeof req.op !== 'string') {
      return { ok: false as const, status: 0, message: 'accountId and op required' }
    }
    return runDotRpc(req)
  })
}
