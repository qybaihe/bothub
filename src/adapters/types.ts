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
export type ConnectionStatus = 'online' | 'busy' | 'attention' | 'offline' | 'error'

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


/** Sentinel confirmation card (egress.approvals). */
export type ApprovalDecision =
  | 'allow_once'
  | 'allow_session'
  | 'allow_always'
  | 'deny'
  | 'deny_always'

export interface MuseApproval {
  id: string
  status: 'pending' | 'approved' | 'denied' | 'timed_out' | string
  title: string
  detail?: string
  approvalType?: string
  /** Raw payload for debugging / richer UI. */
  raw?: unknown
}

export interface MuseConnector {
  id: string
  name: string
  connected: boolean
  description?: string
  raw?: unknown
}

export type AdapterEvent =
  | { type: 'message'; message: IncomingMessage }
  | { type: 'message_delta'; messageId: string; conversationId: string; accountId: string; text: string }
  | { type: 'typing'; conversationId: string; accountId: string; isTyping: boolean }
  | { type: 'status'; accountId: string; status: ConnectionStatus; detail?: string }
  | { type: 'approvals'; accountId: string; pending: MuseApproval[] }
  | {
      type: 'login'
      accountId: string
      signedIn: boolean
      handle?: string
      displayName?: string
      /** The interactive login window closed before a session appeared. */
      windowClosed?: boolean
    }

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

  /** Muse / Sentinel: refresh and return pending confirmation cards. */
  listApprovals?(accountId: string): Promise<MuseApproval[]>
  /** Muse / Sentinel: Allow / Deny a confirmation card. */
  decideApproval?(accountId: string, approvalId: string, decision: ApprovalDecision): Promise<void>
  /** Muse: list connectors (GitHub, Browser, …). */
  listConnectors?(accountId: string): Promise<MuseConnector[]>
  /** Ensure the embedded muse.ai session for this account is open (login / RPC). */
  ensureSession?(accountId: string, botId?: string): Promise<void>
  /** Muse: open interactive login window sharing the account partition. */
  openLogin?(accountId: string, botId?: string): Promise<ConnectionStatus>
  /** Abandon an unfinished login and discard its session data. */
  cancelLogin?(accountId: string): Promise<void>
}

export type AdapterErrorCode = 'not-connected' | 'unknown-account' | 'unsupported' | 'network' | 'timeout'

export class AdapterError extends Error {
  readonly code: AdapterErrorCode

  constructor(code: AdapterErrorCode, message: string) {
    super(message)
    this.name = 'AdapterError'
    this.code = code
  }
}
