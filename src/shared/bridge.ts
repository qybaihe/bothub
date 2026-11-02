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
}
