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
