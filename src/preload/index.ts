import { contextBridge, ipcRenderer } from 'electron'
import type { BotHubBridge } from '@shared/bridge'
import {
  DOT_CHANNELS,
  GROK_CHANNELS,
  HARK_CHANNELS,
  MUSE_CHANNELS,
  UPDATE_CHANNELS,
  WEB_VIEW_CHANNELS,
  type DotMainEvent,
  type GrokMainEvent,
  type HarkMainEvent,
  type MuseMainEvent,
  type UpdateStatusEvent
} from '@shared/ipc'

const bridge: BotHubBridge = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? ''
  },
  webViews: {
    create: (request) => ipcRenderer.invoke(WEB_VIEW_CHANNELS.create, request),
    attach: (viewId, bounds) => ipcRenderer.invoke(WEB_VIEW_CHANNELS.attach, viewId, bounds),
    resize: (viewId, bounds) => ipcRenderer.send(WEB_VIEW_CHANNELS.resize, viewId, bounds),
    detach: (viewId) => ipcRenderer.invoke(WEB_VIEW_CHANNELS.detach, viewId),
    destroy: (viewId) => ipcRenderer.invoke(WEB_VIEW_CHANNELS.destroy, viewId),
    clearPartition: (accountId) => ipcRenderer.invoke(WEB_VIEW_CHANNELS.clearPartition, accountId)
  },
  muse: {
    ensure: (request) => ipcRenderer.invoke(MUSE_CHANNELS.ensure, request),
    rpc: (request) => ipcRenderer.invoke(MUSE_CHANNELS.rpc, request),
    status: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.status, accountId),
    onEvent: (listener) => {
      const handler = (_event: unknown, payload: MuseMainEvent) => listener(payload)
      ipcRenderer.on(MUSE_CHANNELS.event, handler)
      return () => ipcRenderer.removeListener(MUSE_CHANNELS.event, handler)
    },
    signOut: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.signOut, accountId),
    openLogin: (request) => ipcRenderer.invoke(MUSE_CHANNELS.openLogin, request),
    cancelLogin: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.cancelLogin, accountId),
    autoLogin: (request) => ipcRenderer.invoke(MUSE_CHANNELS.autoLogin, request),
    showLogin: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.showLogin, accountId),
    getQuota: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.getQuota, accountId),
    refreshQuota: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.refreshQuota, accountId),
    getInvite: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.getInvite, accountId),
    refreshInvite: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.refreshInvite, accountId),
    redeemInvite: (accountId, code) => ipcRenderer.invoke(MUSE_CHANNELS.redeemInvite, accountId, code),
    listSchedules: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.listSchedules, accountId),
    listScheduleRuns: (accountId, jobId) =>
      ipcRenderer.invoke(MUSE_CHANNELS.listScheduleRuns, accountId, jobId),
    runSchedule: (accountId, jobId) => ipcRenderer.invoke(MUSE_CHANNELS.runSchedule, accountId, jobId),
    deleteSchedule: (accountId, jobId) =>
      ipcRenderer.invoke(MUSE_CHANNELS.deleteSchedule, accountId, jobId),
    listSessions: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.listSessions, accountId),
    mutateSession: (accountId, mutation) =>
      ipcRenderer.invoke(MUSE_CHANNELS.mutateSession, accountId, mutation),
    startSession: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.startSession, accountId),
    loadSessionHistory: (accountId, sessionId) =>
      ipcRenderer.invoke(MUSE_CHANNELS.loadSessionHistory, accountId, sessionId),
    cancelChat: (accountId, sessionId) =>
      ipcRenderer.invoke(MUSE_CHANNELS.cancelChat, accountId, sessionId),
    listFiles: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.listFiles, accountId),
    listConnectors: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.listConnectors, accountId),
    connectConnector: (accountId, connectorId) =>
      ipcRenderer.invoke(MUSE_CHANNELS.connectConnector, accountId, connectorId),
    disconnectConnector: (accountId, connectorId) =>
      ipcRenderer.invoke(MUSE_CHANNELS.disconnectConnector, accountId, connectorId),
    openExternal: (url) => ipcRenderer.invoke(MUSE_CHANNELS.openExternal, url),
    openHttps: (url) => ipcRenderer.invoke(MUSE_CHANNELS.openHttps, url),
    selectOption: (request) => ipcRenderer.invoke(MUSE_CHANNELS.selectOption, request),
    previewWorkspaceFile: (accountId, path) =>
      ipcRenderer.invoke(MUSE_CHANNELS.previewWorkspaceFile, accountId, path),
    uploadWorkspaceFile: (accountId, args) =>
      ipcRenderer.invoke(MUSE_CHANNELS.uploadWorkspaceFile, accountId, args),
    getProxy: (accountId) => ipcRenderer.invoke(MUSE_CHANNELS.getProxy, accountId),
    setProxy: (accountId, config) => ipcRenderer.invoke(MUSE_CHANNELS.setProxy, accountId, config),
    listProxyPool: () => ipcRenderer.invoke(MUSE_CHANNELS.listProxyPool),
    importProxyPool: (rawText, defaultMode) =>
      ipcRenderer.invoke(MUSE_CHANNELS.importProxyPool, rawText, defaultMode),
    removeProxyPoolItem: (id) => ipcRenderer.invoke(MUSE_CHANNELS.removeProxyPoolItem, id),
    clearProxyPool: () => ipcRenderer.invoke(MUSE_CHANNELS.clearProxyPool),
    assignProxyPool: (accountIds, keepIds) => ipcRenderer.invoke(MUSE_CHANNELS.assignProxyPool, accountIds, keepIds)
  },
  updates: {
    check: () => ipcRenderer.invoke(UPDATE_CHANNELS.check),
    install: () => ipcRenderer.invoke(UPDATE_CHANNELS.install),
    version: () => ipcRenderer.invoke(UPDATE_CHANNELS.version),
    onEvent: (listener) => {
      const handler = (_event: unknown, payload: UpdateStatusEvent) => listener(payload)
      ipcRenderer.on(UPDATE_CHANNELS.event, handler)
      return () => ipcRenderer.removeListener(UPDATE_CHANNELS.event, handler)
    }
  },
  grok: {
    openLogin: (request) => ipcRenderer.invoke(GROK_CHANNELS.openLogin, request),
    setAccessToken: (request) => ipcRenderer.invoke(GROK_CHANNELS.setAccessToken, request),
    clearAuth: (accountId) => ipcRenderer.invoke(GROK_CHANNELS.clearAuth, accountId),
    authStatus: (accountId) => ipcRenderer.invoke(GROK_CHANNELS.authStatus, accountId),
    getSession: (accountId) => ipcRenderer.invoke(GROK_CHANNELS.getSession, accountId),
    rpc: (request) => ipcRenderer.invoke(GROK_CHANNELS.rpc, request),
    onEvent: (listener) => {
      const handler = (_event: unknown, payload: GrokMainEvent) => listener(payload)
      ipcRenderer.on(GROK_CHANNELS.event, handler)
      return () => ipcRenderer.removeListener(GROK_CHANNELS.event, handler)
    }
  },
  hark: {
    openLogin: (request) => ipcRenderer.invoke(HARK_CHANNELS.openLogin, request),
    cancelLogin: (accountId) => ipcRenderer.invoke(HARK_CHANNELS.cancelLogin, accountId),
    authStatus: (accountId) => ipcRenderer.invoke(HARK_CHANNELS.authStatus, accountId),
    importCredentials: (request) => ipcRenderer.invoke(HARK_CHANNELS.importCredentials, request),
    clearAuth: (accountId) => ipcRenderer.invoke(HARK_CHANNELS.clearAuth, accountId),
    rpc: (request) => ipcRenderer.invoke(HARK_CHANNELS.rpc, request),
    onEvent: (listener) => {
      const handler = (_event: unknown, payload: HarkMainEvent) => listener(payload)
      ipcRenderer.on(HARK_CHANNELS.event, handler)
      return () => ipcRenderer.removeListener(HARK_CHANNELS.event, handler)
    }
  },
  dot: {
    openLogin: (request) => ipcRenderer.invoke(DOT_CHANNELS.openLogin, request),
    cancelLogin: (accountId) => ipcRenderer.invoke(DOT_CHANNELS.cancelLogin, accountId),
    authStatus: (accountId) => ipcRenderer.invoke(DOT_CHANNELS.authStatus, accountId),
    importCredentials: (request) => ipcRenderer.invoke(DOT_CHANNELS.importCredentials, request),
    clearAuth: (accountId) => ipcRenderer.invoke(DOT_CHANNELS.clearAuth, accountId),
    rpc: (request) => ipcRenderer.invoke(DOT_CHANNELS.rpc, request),
    onEvent: (listener) => {
      const handler = (_event: unknown, payload: DotMainEvent) => listener(payload)
      ipcRenderer.on(DOT_CHANNELS.event, handler)
      return () => ipcRenderer.removeListener(DOT_CHANNELS.event, handler)
    }
  }
}

try {
  contextBridge.exposeInMainWorld('electron', bridge)
} catch (error) {
  console.error('[preload] failed to expose bridge', error)
}
