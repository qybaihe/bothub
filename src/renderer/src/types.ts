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
}

export type MessageRole = 'user' | 'bot'
export type MessageDelivery = 'sending' | 'sent' | 'failed'

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
  /** Defaults to the selected bot's group, then the first group. */
  group?: GroupChoice
  accounts: AccountDraft[]
}
