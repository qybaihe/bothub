import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  GROK_CHANNELS,
  type GrokAuthStatus,
  type GrokOpenLoginRequest,
  type GrokSetAccessTokenRequest
} from '@shared/ipc'
import { clearGrokMainAuth, getGrokMainAuth, setGrokMainAuth } from './grokAuthStore'
import { openGrokLoginWindow } from './grokLogin'

function ownerWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined
}

function statusFor(accountId: string): GrokAuthStatus {
  const auth = getGrokMainAuth(accountId)
  return {
    accountId,
    signedIn: Boolean(auth?.accessToken),
    accountSlot: auth?.accountSlot
  }
}

let registered = false

export function registerGrokIpc(): void {
  if (registered) return
  registered = true

  ipcMain.handle(GROK_CHANNELS.openLogin, async (event, request: unknown) => {
    if (typeof request !== 'object' || request === null) throw new TypeError('Invalid grok openLogin')
    const req = request as GrokOpenLoginRequest
    if (typeof req.accountId !== 'string') throw new TypeError('Invalid accountId')
    await openGrokLoginWindow(req.accountId, ownerWindow(event))
    return { ok: true as const }
  })

  ipcMain.handle(GROK_CHANNELS.setAccessToken, (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null) throw new TypeError('Invalid setAccessToken')
    const req = request as GrokSetAccessTokenRequest
    if (typeof req.accountId !== 'string' || typeof req.accessToken !== 'string' || !req.accessToken.trim()) {
      throw new TypeError('accountId and accessToken required')
    }
    setGrokMainAuth({
      accountId: req.accountId,
      accessToken: req.accessToken.trim(),
      accountSlot: req.accountSlot,
      teamId: req.teamId,
      machineId: req.machineId
    })
    return statusFor(req.accountId)
  })

  ipcMain.handle(GROK_CHANNELS.clearAuth, (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    clearGrokMainAuth(accountId)
    return statusFor(accountId)
  })

  ipcMain.handle(GROK_CHANNELS.authStatus, (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return statusFor(accountId)
  })
}
