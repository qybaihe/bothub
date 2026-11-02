/**
 * Platform adapter contract.
 *
 * A PlatformAdapter is the only surface the UI uses to talk to a bot
 * platform. Today adapters are in-memory mocks; real protocol integrations
 * (HTTP/WebSocket APIs, or automation of a WebContentsView web session) will
 * implement the same interface later without UI changes.
 *
 * Keep this module free of DOM, Node, and Electron imports so adapters can
 * run in the renderer now and move to the main process later.
 */

/** Platforms BotHub knows about. Add an id here and to `platforms.ts`. */
export type PlatformId = 'meta-muse' | 'grok' | 'deepseek' | 'chatgpt' | 'gemini'

/** Connection state of a single platform account. */
export type ConnectionStatus = 'online' | 'busy' | 'offline' | 'error'

export interface PlatformDescriptor {
  id: PlatformId
  name: string
  description: string
  availability: 'available' | 'coming-soon'
  /** One or two letters used for the platform glyph. */
  monogram: string
  /** Web entry point for embedded sessions (WebContentsView), if any. */
  homeUrl?: string
}

/** An account (login/session) on a platform. A bot can use several. */
export interface PlatformAccount {
  id: string
  platformId: PlatformId
  displayName: string
  /** Login identifier shown in the UI, e.g. an email or @handle. */
  handle: string
  avatarUrl?: string
}

export interface AttachmentMeta {
  id: string
  name: string
  size: number
  mimeType: string
}

export interface OutgoingMessage {
  /** BotHub conversation id (one conversation per bot). */
  conversationId: string
  /** Account the message is sent from. */
  accountId: string
  text: string
  attachments?: AttachmentMeta[]
}

export interface SendReceipt {
  /** Platform-side id assigned to the outgoing message. */
  messageId: string
  acceptedAt: number
}

export interface IncomingMessage {
  id: string
  conversationId: string
  accountId: string
  text: string
  createdAt: number
  /** Platform id of the message this replies to, when known. */
  replyTo?: string
}

export type AdapterEvent =
  | { type: 'message'; message: IncomingMessage }
  | { type: 'typing'; conversationId: string; accountId: string; isTyping: boolean }
  | { type: 'status'; accountId: string; status: ConnectionStatus; detail?: string }

export type AdapterListener = (event: AdapterEvent) => void
export type Unsubscribe = () => void

export interface PlatformAdapter {
  readonly id: PlatformId
  readonly name: string

  /** Accounts/sessions this platform currently knows about. */
  listAccounts(): Promise<PlatformAccount[]>

  /** Open (or resume) a session for an account. Resolves with the new status. */
  connect(accountId: string): Promise<ConnectionStatus>
  disconnect(accountId: string): Promise<void>

  /** Send a message. Resolves once the platform accepts it; replies arrive as events. */
  sendMessage(message: OutgoingMessage): Promise<SendReceipt>

  /** Subscribe to every adapter event (messages, typing, status changes). */
  subscribe(listener: AdapterListener): Unsubscribe
  /** Convenience wrapper around `subscribe` for incoming messages only. */
  onMessage(listener: (message: IncomingMessage) => void): Unsubscribe

  /** Last known status for an account (synchronous, cached). */
  getStatus(accountId: string): ConnectionStatus
}

export type AdapterErrorCode = 'not-connected' | 'unknown-account' | 'unsupported' | 'network'

export class AdapterError extends Error {
  readonly code: AdapterErrorCode

  constructor(code: AdapterErrorCode, message: string) {
    super(message)
    this.name = 'AdapterError'
    this.code = code
  }
}
