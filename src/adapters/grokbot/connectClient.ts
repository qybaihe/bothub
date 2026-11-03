/**
 * Renderer-side stub. Real ConnectRPC unary runs in Electron main
 * (`src/main/grok/connectClient.ts`) via `window.electron.grok.rpc`.
 * Kept so older imports of GrokConnectError still typecheck.
 */

export class GrokConnectError extends Error {
  readonly status: number
  readonly code?: string
  readonly body: string

  constructor(status: number, body: string, code?: string) {
    super(`Grok ConnectRPC ${status}${code ? ` (${code})` : ''}: ${body.slice(0, 240)}`)
    this.name = 'GrokConnectError'
    this.status = status
    this.body = body
    this.code = code
  }
}

/** @deprecated Network calls must go through main IPC (`window.electron.grok.rpc`). */
export class GrokConnectClient {
  constructor(_opts: unknown) {
    throw new Error('GrokConnectClient must not run in the renderer — use window.electron.grok.rpc')
  }
}
