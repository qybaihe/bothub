/**
 * IPC contract between the renderer (via preload) and the main process.
 * Shared so channel names and payload shapes cannot drift apart.
 */

export const WEB_VIEW_CHANNELS = {
  create: 'bothub:web-view:create',
  attach: 'bothub:web-view:attach',
  resize: 'bothub:web-view:resize',
  detach: 'bothub:web-view:detach',
  destroy: 'bothub:web-view:destroy',
  clearPartition: 'bothub:web-view:clear-partition'
} as const

/** Rectangle in CSS pixels relative to the window's content area. */
export interface WebViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface CreateWebViewRequest {
  botId: string
  accountId: string
  /** http(s) URL to load. Omit to show a local placeholder page. */
  url?: string
  /** Human-readable label (e.g. "Meta Muse · Alex Rivera") for the placeholder. */
  label?: string
}

export interface WebViewInfo {
  /** Stable id for a bot + account pair. */
  viewId: string
  botId: string
  accountId: string
  /** Session partition; one per account so logins stay isolated. */
  partition: string
  url: string
  attached: boolean
}


export const MUSE_CHANNELS = {
  ensure: 'bothub:muse:ensure',
  rpc: 'bothub:muse:rpc',
  status: 'bothub:muse:status',
  event: 'bothub:muse:event',
  signOut: 'bothub:muse:sign-out',
  /** Open a same-partition BrowserWindow for interactive muse.ai login. */
  openLogin: 'bothub:muse:open-login',
  /** Close an unfinished login window and wipe its partition. */
  cancelLogin: 'bothub:muse:cancel-login'
} as const

export interface MuseEnsureRequest {
  botId: string
  accountId: string
  /** When true, attach/show the view for interactive login. */
  show?: boolean
  bounds?: WebViewBounds
}

export interface MuseRpcRequest {
  accountId: string
  method: string
  params?: unknown
  /** BotHub conversation/bot id — used to emit progressive stream events for chat.stream. */
  conversationId?: string
}

export interface MuseSessionStatus {
  accountId: string
  signedIn: boolean
  ready: boolean
  hook: 'sendRequest' | 'dom' | 'none'
  url: string
  pendingApprovals: number
  /** Connection lifecycle for UI: connecting → waking-vm → ready. */
  phase?: MuseConnectionPhase
  /** Human-readable detail for the current phase. */
  phaseDetail?: string
}

export type MuseConnectionPhase = 'signed-out' | 'connecting' | 'hydrating' | 'waking-vm' | 'reloading' | 'ready'

export type MuseMainEvent =
  | { type: 'status'; status: MuseSessionStatus }
  | { type: 'approvals'; accountId: string; pending: unknown[] }
  | {
      type: 'stream'
      accountId: string
      conversationId?: string
      messageId: string
      text: string
      done: boolean
    }
  | {
      type: 'login'
      accountId: string
      signedIn: boolean
      handle?: string
      displayName?: string
      /** Set when the login window was closed before a session appeared. */
      windowClosed?: boolean
    }

export const UPDATE_CHANNELS = {
  check: 'bothub:update:check',
  install: 'bothub:update:install',
  version: 'bothub:update:version',
  event: 'bothub:update:event'
} as const

export type UpdateStatusEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes?: string; manualInstall?: boolean }
  | { type: 'not-available'; version: string }
  | {
      type: 'downloading'
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }
  | { type: 'downloaded'; version: string; releaseNotes?: string }
  | { type: 'error'; message: string }
