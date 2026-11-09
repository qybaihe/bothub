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
export type PlatformId = 'meta-muse' | 'grok' | 'hark' | 'dot'

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
  /** Optional interactive login entry (Grok / Cursor authenticator). */
  loginUrl?: string
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
  /** Base64 payload for Muse chat.stream items (no data: URL prefix). */
  dataBase64?: string
}

export interface OutgoingMessage {
  /** BotHub conversation id (one conversation per bot). */
  conversationId: string
  /** Account the message is sent from. */
  accountId: string
  /** Optional platform thread / session id (e.g. Muse session_id). */
  sessionId?: string
  text: string
  attachments?: AttachmentMeta[]
}

export interface SendReceipt {
  /** Platform-side id assigned to the outgoing message. */
  messageId: string
  acceptedAt: number
  /** Platform thread / session id returned by the send ack. */
  sessionId?: string
}

export interface IncomingMessage {
  id: string
  conversationId: string
  accountId: string
  text: string
  createdAt: number
  /** Platform id of the message this replies to, when known. */
  replyTo?: string
  widgets?: MuseOptionWidget[]
  tools?: MuseToolCall[]
  media?: MuseMediaPart[]
  richWidgets?: MuseRichWidget[]
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
  /** Destination host for network (egress) cards, e.g. agent.qq.com. */
  host?: string
  /** Server-offered buttons (decision_options). Empty = allow_once/allow_always/deny. */
  decisionOptions?: ApprovalDecision[]
  /** Server reason / explanation text for the expandable detail. */
  reason?: string
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

export interface MuseToolCall {
  id: string
  name: string
  toolType?: string
  status: 'running' | 'completed' | 'errored'
  summary?: string
}

export interface MuseMediaPart {
  kind: 'image' | 'file'
  path: string
  name?: string
  imageId?: string
  mimeType?: string
}

export type MuseRichWidget =
  | {
      kind: 'shopping_results' | 'shopping_results_v2'
      widgetId: string
      products: Array<{ name: string; url?: string; imageUrl?: string; price?: string; retailer?: string }>
    }
  | {
      kind: 'shopping_cart'
      widgetId: string
      retailerName?: string
      subtotal?: string
      items: Array<{ id: string; name: string; quantity: number; imageUrl?: string; linePrice?: string }>
    }
  | {
      kind: 'local_map'
      widgetId: string
      html?: string
      places: Array<{ id: string; name: string; latitude: number; longitude: number; category?: string }>
    }
  | {
      kind: 'marketplace_map'
      widgetId: string
      listings: Array<{
        id: string
        name: string
        url?: string
        price?: string
        imageUrl?: string
        latitude?: number
        longitude?: number
      }>
    }
  | { kind: 'html'; widgetId: string; html: string; downloadable?: boolean }
  | { kind: 'slides'; widgetId: string; label: string; path?: string; slug: string }
  | {
      kind: 'image_options'
      widgetId: string
      images: Array<{ path: string; imageId?: string }>
      multiSelect?: boolean
      selectedPath?: string | null
      selectedIndices?: number[]
      baseVersion: number
    }
  | {
      kind: 'text_with_button'
      widgetId: string
      text: string
      buttons: Array<{ label: string; actionText?: string; url?: string; command?: string }>
    }
  | {
      kind: 'generic_list'
      widgetId: string
      title?: string
      items: Array<{ id: string; title: string; subtitle?: string; sendText?: string; url?: string }>
    }
  | {
      kind: 'voice_options'
      widgetId: string
      voices: Array<{ id: string; name: string; description?: string; selected?: boolean }>
    }
  | {
      kind: 'markdown'
      widgetId: string
      title?: string
      markdown: string
      path?: string
    }
  | {
      kind: 'hotel_results'
      widgetId: string
      hotels: Array<{ name: string; price?: string; rating?: string; url?: string; imageUrl?: string; location?: string }>
    }
  | {
      kind: 'idea_cards'
      widgetId: string
      cards: Array<{ id: string; title: string; subtitle?: string; prompt?: string }>
    }

export interface MuseOptionWidget {
  kind: 'option'
  widgetId: string
  options: string[]
  buttonStyle: 'dotted_lines' | 'center_aligned_filled'
  customInputPlaceholder?: string
  selectedText?: string | null
  baseVersion: number
}

export interface AgentActivity {
  code: string
  text: string | null
  emoji: string | null
  agentId: string | null
  subagents: number
  busy: boolean
  ctaLabel?: string
}

export type AdapterEvent =
  | { type: 'message'; message: IncomingMessage & { widgets?: MuseOptionWidget[]; richWidgets?: MuseRichWidget[]; tools?: MuseToolCall[]; media?: MuseMediaPart[] } }
  | { type: 'message_delta'; messageId: string; conversationId: string; accountId: string; text: string; widgets?: MuseOptionWidget[]; richWidgets?: MuseRichWidget[]; tools?: MuseToolCall[]; media?: MuseMediaPart[] }
  | { type: 'typing'; conversationId: string; accountId: string; isTyping: boolean }
  | { type: 'status'; accountId: string; status: ConnectionStatus; detail?: string }
  | { type: 'activity'; accountId: string; activity: AgentActivity }
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
  /** Muse: tap an option chip (Kai/Juno) → widgets.state.set + chat.stream. */
  selectOptionWidget?(args: {
    accountId: string
    conversationId: string
    hostMessageId: string
    widget: MuseOptionWidget
    selectedText: string
    optionIndex: number
  }): Promise<void>
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
