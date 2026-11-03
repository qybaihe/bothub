import { memo } from 'react'
import type { ConnectionStatus } from '@adapters/types'
import { BotAvatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
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
  const body = text || (last.attachments?.length ? last.attachments[0]!.name : '')
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
  return (
    <button
      type="button"
      onClick={() => onSelect(bot.id)}
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'group flex min-h-[52px] w-full items-center gap-2.5 rounded-[14px] px-2 py-1.5 text-left',
        'transition-[background-color,transform] duration-150 active:scale-[0.99]',
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
          {bot.unread > 0 && (
            <span className="ml-auto grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white tabular-nums">
              {bot.unread}
            </span>
          )}
        </span>
        <span
          className={cn(
            'mt-0.5 block truncate text-[13px]',
            typing ? 'text-accent-600' : 'text-ink-muted'
          )}
        >
          {previewText(bot, last, typing)}
        </span>
      </span>
    </button>
  )
})
