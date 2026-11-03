import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  GROK_CHANNELS,
  type GrokAuthStatus,
  type GrokOpenLoginRequest,
  type GrokRpcRequest,
  type GrokSetAccessTokenRequest
} from '@shared/ipc'
import { clearGrokMainAuth, getGrokMainAuth, setGrokMainAuth } from './grokAuthStore'
import { onGrokAuthCaptured, openGrokLoginWindow } from './grokLogin'
import { runGrokRpc } from './grokRpc'
import { getOrCreateGrokMachineId } from './grokMachineId'
import {
  clearSandTokens,
  loadSandTokens,
  persistSandTokens,
  type SandTokens
} from './grokSandAuth'

function ownerWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined
}

async function hydrateFromDisk(accountId: string): Promise<void> {
  if (getGrokMainAuth(accountId)?.accessToken) return
  const sand = await loadSandTokens(accountId)
  if (!sand?.accessToken) return
  setGrokMainAuth({
    accountId,
    accessToken: sand.accessToken,
    accountSlot: sand.authId ?? sand.selectedTeamId,
    teamId: sand.selectedTeamId,
    machineId: getOrCreateGrokMachineId(accountId)
  })
}

async function statusFor(accountId: string): Promise<GrokAuthStatus> {
  await hydrateFromDisk(accountId)
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

  onGrokAuthCaptured((auth) => {
    // Broadcast to all BotHub windows so renderer can setAuth + connect.
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.webContents.send(GROK_CHANNELS.event, {
        type: 'auth',
        accountId: auth.accountId,
        signedIn: true as const,
        accessToken: auth.accessToken,
        accountSlot: auth.accountSlot,
        machineId: auth.machineId
      })
    }
  })

  ipcMain.handle(GROK_CHANNELS.openLogin, async (event, request: unknown) => {
    if (typeof request !== 'object' || request === null) throw new TypeError('Invalid grok openLogin')
    const req = request as GrokOpenLoginRequest
    if (typeof req.accountId !== 'string') throw new TypeError('Invalid accountId')
    await openGrokLoginWindow(req.accountId, ownerWindow(event))
    return { ok: true as const }
  })

  ipcMain.handle(GROK_CHANNELS.setAccessToken, async (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null) throw new TypeError('Invalid setAccessToken')
    const req = request as GrokSetAccessTokenRequest
    if (typeof req.accountId !== 'string' || typeof req.accessToken !== 'string' || !req.accessToken.trim()) {
      throw new TypeError('accountId and accessToken required')
    }
    const accessToken = req.accessToken.trim()
    setGrokMainAuth({
      accountId: req.accountId,
      accessToken,
      accountSlot: req.accountSlot,
      teamId: req.teamId,
      machineId: req.machineId?.trim() || getOrCreateGrokMachineId(req.accountId)
    })
    const existing = await loadSandTokens(req.accountId)
    const next: SandTokens = {
      accessToken,
      refreshToken: existing?.refreshToken,
      authId: existing?.authId ?? req.accountSlot,
      selectedTeamId: req.teamId ?? existing?.selectedTeamId
    }
    try {
      await persistSandTokens(req.accountId, next)
    } catch (error) {
      // Fail closed for disk (no plaintext). Keep in-memory session for this run.
      console.warn('[grok] safeStorage persist failed; session is memory-only until restart', error)
    }
    return statusFor(req.accountId)
  })

  ipcMain.handle(GROK_CHANNELS.clearAuth, async (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    clearGrokMainAuth(accountId)
    clearSandTokens(accountId)
    return statusFor(accountId)
  })

  ipcMain.handle(GROK_CHANNELS.authStatus, async (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    return statusFor(accountId)
  })

  ipcMain.handle(GROK_CHANNELS.getSession, async (_event, accountId: unknown) => {
    if (typeof accountId !== 'string') throw new TypeError('Invalid accountId')
    await hydrateFromDisk(accountId)
    const auth = getGrokMainAuth(accountId)
    if (!auth?.accessToken) {
      return { accountId, signedIn: false as const }
    }
    return {
      accountId,
      signedIn: true as const,
      accessToken: auth.accessToken,
      accountSlot: auth.accountSlot,
      teamId: auth.teamId,
      machineId: auth.machineId
    }
  })

  ipcMain.handle(GROK_CHANNELS.rpc, async (_event, request: unknown) => {
    if (typeof request !== 'object' || request === null) {
      return { ok: false as const, status: 0, message: 'Invalid grok rpc request' }
    }
    const req = request as GrokRpcRequest
    if (typeof req.accountId !== 'string' || typeof req.op !== 'string') {
      return { ok: false as const, status: 0, message: 'accountId and op required' }
    }
    return runGrokRpc(req)
  })
}

/** Re-export so bothub can plug checksum without hunting imports. */
export { setGrokChecksumCalculator, getGrokChecksumCalculator, createCursorChecksum } from './connectClient'
