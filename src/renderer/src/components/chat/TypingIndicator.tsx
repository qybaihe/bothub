import { BotAvatar } from '@/components/ui/Avatar'
import type { Bot } from '@/types'

export function TypingIndicator({ bot }: { bot: Bot }) {
  return (
    <div className="flex animate-fade-in items-end gap-2.5" role="status" aria-label={`${bot.name} is typing`}>
      <BotAvatar emoji={bot.emoji} seed={bot.id} avatar={bot.avatar} platformId={bot.platformId} size="sm" />
      <div className="flex h-9 items-center gap-1 rounded-2xl rounded-tl-md bg-sunken px-3.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-typing rounded-full bg-ink-muted"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
