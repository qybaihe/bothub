import type { ConnectionStatus } from '@adapters/types'
import type { Bot, BotAccount, BotGroup, ChatMessage } from '@/types'

/** A bot's status is the status of the account it currently sends from. */
export function getBotStatus(bot: Bot, accounts: Record<string, BotAccount>): ConnectionStatus {
  return accounts[bot.activeAccountId]?.status ?? 'offline'
}

export function getBotAccounts(bot: Bot, accounts: Record<string, BotAccount>): BotAccount[] {
  return bot.accountIds.map((id) => accounts[id]).filter((a): a is BotAccount => a !== undefined)
}

export function lastMessage(messages: ChatMessage[] | undefined): ChatMessage | undefined {
  return messages && messages.length > 0 ? messages[messages.length - 1] : undefined
}

/** Case-insensitive match on bot name, description, group, and account names. */
export function botMatches(
  bot: Bot,
  query: string,
  accounts: Record<string, BotAccount>,
  group: BotGroup | undefined
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    bot.name,
    bot.description,
    group?.name ?? '',
    ...getBotAccounts(bot, accounts).flatMap((a) => [a.displayName, a.handle])
  ]
  return haystack.some((value) => value.toLowerCase().includes(q))
}
