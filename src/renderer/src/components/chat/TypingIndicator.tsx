import { BotAvatar } from '@/components/ui/Avatar'
import type { Bot } from '@/types'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

export function TypingIndicator({ bot }: { bot: Bot }) {
  const activity = useBotStore((s) => s.activity[bot.activeAccountId])
  const phrase = activity
    ? `${activity.emoji ? activity.emoji + ' ' : ''}${activity.text || (activity.busy ? t('Working…') : '')}`.trim()
    : ''

  return (
    <div className="flex animate-fade-in items-center gap-2.5" role="status" aria-label={`${bot.name} is working`}>
      <BotAvatar
        emoji={bot.emoji}
        seed={bot.id}
        avatar={bot.avatar}
        avatarShape={bot.avatarShape}
        avatarColor={bot.avatarColor}
        platformId={bot.platformId}
        isWorking
        size="sm"
      />
      <div className="flex h-9 items-center gap-2 rounded-2xl rounded-tl-md bg-bubble px-3.5">
        {phrase ? (
          <span className="text-[13px] font-medium shimmer-text">{phrase}</span>
        ) : (
          <div className="flex items-center gap-1">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-1.5 animate-typing rounded-full bg-ink-muted"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
