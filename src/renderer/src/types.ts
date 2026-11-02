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
  description: string
  platformId: PlatformId
  groupId: string
  accountIds: string[]
  /** Account used for new messages. Always one of `accountIds`. */
  activeAccountId: string
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
