import type {
  AttachmentMeta,
  ConnectionStatus,
  PlatformAccount,
  PlatformId
} from '@adapters/types'

/** A platform account as tracked by BotHub (accounts can back several bots). */
export interface BotAccount extends PlatformAccount {
  status: ConnectionStatus
  /** Human-readable reason for the current status (e.g. an error). */
  statusDetail?: string
  /** True while a connect/disconnect request is in flight. */
  pending?: boolean
  /** Unread bot replies attributed to this account (cleared when selected). */
  unread?: number
  /** Optional user label shown instead of the raw handle. */
  label?: string
}

export interface BotGroup {
  id: string
  name: string
}

export interface MemoryItem {
  id: string
  text: string
  createdAt: number
}

/** The unit of BotHub: one assistant persona, backed by one or more accounts. */
export interface Bot {
  id: string
  name: string
  emoji: string
  /** Optional photo (data URL); replaces the platform mark. */
  avatar?: string
  description: string
  platformId: PlatformId
  groupId: string
  accountIds: string[]
  /** Account used for new messages. Always one of `accountIds`. */
  activeAccountId: string
  /** Grok Bot agent UUID to talk to (optional; defaults to first agent). */
  selectedAgentId?: string
  memory: MemoryItem[]
  notes: string
  createdAt: number
  unread: number
  /** Local-only: shown in the sidebar Pinned row. */
  pinned?: boolean
}

export type MessageRole = 'user' | 'bot'
export type MessageDelivery = 'sending' | 'sent' | 'failed'

export interface ChatToolCall {
  id: string
  name: string
  toolType?: string
  status: 'running' | 'completed' | 'errored'
  summary?: string
}

/** Inbound image/file part from Muse transcript / resources (path may be VM-local). */
export interface ChatMediaPart {
  kind: 'image' | 'file'
  path: string
  name?: string
  imageId?: string
  mimeType?: string
}

export type ChatRichWidget =
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

export interface ChatOptionWidget {
  kind: 'option'
  widgetId: string
  options: string[]
  buttonStyle: 'dotted_lines' | 'center_aligned_filled'
  customInputPlaceholder?: string
  selectedText?: string | null
  baseVersion: number
}

export interface ChatMessage {
  id: string
  botId: string
  /** Account that sent (user) or received the reply (bot). */
  accountId: string
  role: MessageRole
  text: string
  createdAt: number
  delivery?: MessageDelivery
  error?: string
  attachments?: AttachmentMeta[]
  /** Muse option chips (onboarding name picker, etc.). */
  widgets?: ChatOptionWidget[]
  /** Read-only shopping/maps/html/slides widgets. */
  richWidgets?: ChatRichWidget[]
  /** Live / completed tool calls for this assistant turn. */
  tools?: ChatToolCall[]
  /** Inbound image/file parts (not the same as user AttachmentMeta). */
  media?: ChatMediaPart[]
}

export interface BotActivity {
  code: string
  text: string | null
  emoji: string | null
  busy: boolean
  subagents?: number
  ctaLabel?: string
}

/** An account row in the add-bot / add-account forms. */
export interface AccountDraft {
  /** Stable key for list rendering. */
  key: string
  /** Set when reusing an existing signed-in session from the adapter. */
  accountId?: string
  displayName: string
  handle: string
}

export type GroupChoice = { kind: 'existing'; groupId: string } | { kind: 'new'; name: string }

export interface NewBotInput {
  /** Pre-assigned id (the login flow needs it before the bot exists). */
  id?: string
  platformId: PlatformId
  name: string
  avatar?: string
  emoji?: string
  description?: string
  /** Local notes (template starter brief). */
  notes?: string
  /** Defaults to the selected bot's group, then the first group. */
  group?: GroupChoice
  accounts: AccountDraft[]
}
