import type { CreateWebViewRequest, WebViewBounds, WebViewInfo } from './ipc'

/** Controls embedded platform web sessions (Electron WebContentsView). */
export interface WebViewBridge {
  /** Create (or reuse) the view for a bot + account. Does not show it. */
  create(request: CreateWebViewRequest): Promise<WebViewInfo>
  /** Show the view over the given region; hides any other attached view. */
  attach(viewId: string, bounds: WebViewBounds): Promise<WebViewInfo>
  /** Update the attached view's bounds (fire-and-forget, safe to call often). */
  resize(viewId: string, bounds: WebViewBounds): void
  /** Hide the view but keep its page and session alive. */
  detach(viewId: string): Promise<void>
  /** Close the view's page and free its resources. */
  destroy(viewId: string): Promise<void>
}

/**
 * Contract for the API the preload script exposes on `window.electron`.
 *
 * The renderer must treat it as optional: when it runs in a plain browser
 * (`npm run dev:web`) there is no preload and `window.electron` is undefined.
 */
export interface BotHubBridge {
  /** Node-style platform string, e.g. "darwin", "win32", "linux". */
  readonly platform: string
  readonly versions: {
    readonly electron: string
    readonly chrome: string
    readonly node: string
  }
  readonly webViews: WebViewBridge
}
