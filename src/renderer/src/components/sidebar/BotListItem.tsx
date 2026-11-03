import { memo } from 'react'
import type { ConnectionStatus } from '@adapters/types'
import { Users } from 'lucide-react'
import { BotAvatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import { formatListTime } from '@/lib/format'
import type { Bot, ChatMessage } from '@/types'

interface BotListItemProps {
  bot: Bot
  status: ConnectionStatus
  last: ChatMessage | undefined
  typing: boolean
  selected: boolean
  onSelect: (botId: string) => void
}

function previewText(bot: Bot, last: ChatMessage | undefined, typing: boolean): string {
  if (typing) return 'Typing…'
  if (!last) return bot.description
  const text = last.text.replace(/\s+/g, ' ').trim()
  const body = text || (last.attachments?.length ? `📎 ${last.attachments[0]!.name}` : '')
  return last.role === 'user' ? `You: ${body}` : body
}

export const BotListItem = memo(function BotListItem({
  bot,
  status,
  last,
  typing,
  selected,
  onSelect
}: BotListItemProps) {
  const multiAccount = bot.accountIds.length > 1

  return (
    <button
      type="button"
      onClick={() => onSelect(bot.id)}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'group flex min-h-[54px] w-full items-center gap-2.5 rounded-[10px] p-2 text-left transition-colors',
        selected ? 'bg-active' : 'hover:bg-hover'
      )}
    >
      <BotAvatar
        emoji={bot.emoji}
        seed={bot.id}
        platformId={bot.platformId}
        status={status}
        ringClassName="ring-canvas"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-medium text-ink">{bot.name}</span>
          {multiAccount && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-ink-muted"
              title={`${bot.accountIds.length} accounts`}
            >
              <Users className="size-3" aria-hidden />
              {bot.accountIds.length}
            </span>
          )}
          <span className="ml-auto shrink-0 pl-1 text-caption text-ink-muted tabular-nums">
            {last ? formatListTime(last.createdAt) : ''}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              'truncate text-[13px]',
              typing ? 'text-accent-600' : bot.unread > 0 ? 'text-ink-secondary' : 'text-ink-muted'
            )}
          >
            {previewText(bot, last, typing)}
          </span>
          {bot.unread > 0 && (
            <span className="ml-auto grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white tabular-nums">
              {bot.unread}
            </span>
          )}
        </span>
      </span>
    </button>
  )
})
