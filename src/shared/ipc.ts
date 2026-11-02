/**
 * IPC contract between the renderer (via preload) and the main process.
 * Shared so channel names and payload shapes cannot drift apart.
 */

export const WEB_VIEW_CHANNELS = {
  create: 'bothub:web-view:create',
  attach: 'bothub:web-view:attach',
  resize: 'bothub:web-view:resize',
  detach: 'bothub:web-view:detach',
  destroy: 'bothub:web-view:destroy'
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
  event: 'bothub:muse:event'
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
}

export interface MuseSessionStatus {
  accountId: string
  signedIn: boolean
  ready: boolean
  hook: 'sendRequest' | 'dom' | 'none'
  url: string
  pendingApprovals: number
}

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
  | { type: 'login'; accountId: string; signedIn: boolean; handle?: string; displayName?: string }
