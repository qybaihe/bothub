import type {
  CreateWebViewRequest,
  MuseEnsureRequest,
  MuseMainEvent,
  MuseRpcRequest,
  MuseSessionStatus,
  UpdateStatusEvent,
  WebViewBounds,
  WebViewInfo,
  GrokOpenLoginRequest,
  GrokSetAccessTokenRequest,
  GrokAuthStatus
} from './ipc'

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
  /** Wipe cookies/storage for an account partition (sign out). */
  clearPartition(accountId: string): Promise<void>
}

/**
 * Contract for the API the preload script exposes on `window.electron`.
 *
 * The renderer must treat it as optional: when it runs in a plain browser
 * (`npm run dev:web`) there is no preload and `window.electron` is undefined.
 */
export interface MuseBridge {
  ensure(request: MuseEnsureRequest): Promise<MuseSessionStatus>
  rpc(request: MuseRpcRequest): Promise<unknown>
  status(accountId: string): Promise<MuseSessionStatus | null>
  onEvent(listener: (event: MuseMainEvent) => void): () => void
  /** Destroy the muse view and clear the account partition. */
  signOut(accountId: string): Promise<void>
  /**
   * Open a BrowserWindow that shares the account persist partition and loads
   * muse.ai. Cookies land automatically; the window closes when hatch_sess appears.
   */
  openLogin(request: MuseEnsureRequest): Promise<MuseSessionStatus>
  /** Close an unfinished login window and wipe the account partition. */
  cancelLogin(accountId: string): Promise<void>
}

export interface UpdateBridge {
  check(): Promise<{ ok: true }>
  install(): Promise<{ ok: true }>
  version(): Promise<string>
  onEvent(listener: (event: UpdateStatusEvent) => void): () => void
}

export interface GrokBridge {
  /** Open authenticator.cursor.sh in a partition BrowserWindow (stops at 2FA/login). */
  openLogin(request: GrokOpenLoginRequest): Promise<{ ok: true }>
  /** Store a bearer token for ConnectRPC (never persisted to disk by BotHub yet). */
  setAccessToken(request: GrokSetAccessTokenRequest): Promise<GrokAuthStatus>
  clearAuth(accountId: string): Promise<GrokAuthStatus>
  authStatus(accountId: string): Promise<GrokAuthStatus>
}

export interface BotHubBridge {
  /** Node-style platform string, e.g. "darwin", "win32", "linux". */
  readonly platform: string
  readonly versions: {
    readonly electron: string
    readonly chrome: string
    readonly node: string
  }
  readonly webViews: WebViewBridge
  readonly muse: MuseBridge
  readonly updates: UpdateBridge
  readonly grok: GrokBridge
}
