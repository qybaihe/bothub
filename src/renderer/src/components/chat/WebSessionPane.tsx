import { useRef } from 'react'
import { getPlatform } from '@adapters/platforms'
import { AlertCircle, Globe } from 'lucide-react'
import { useWebSessionView } from '@/hooks/useWebSessionView'
import type { Bot, BotAccount } from '@/types'

interface WebSessionPaneProps {
  bot: Bot
  account: BotAccount
}

/**
 * Region covered by the native WebContentsView for the bot's active account.
 * The DOM underneath only shows while the view loads or when unsupported.
 */
export function WebSessionPane({ bot, account }: WebSessionPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const platform = getPlatform(bot.platformId)
  const state = useWebSessionView({
    botId: bot.id,
    accountId: account.id,
    url: platform.homeUrl,
    label: `${platform.name} · ${account.displayName}`,
    containerRef
  })

  return (
    <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center">
      <div className="flex max-w-sm animate-veil-in flex-col items-center gap-2 px-6 text-center text-[13px] text-ink-muted">
        {state.status === 'unsupported' && (
          <>
            <Globe className="size-5 text-ink-faint" aria-hidden />
            <p>Web sessions open in the desktop app</p>
          </>
        )}
        {state.status === 'loading' && <p className="shimmer-text">Opening {platform.name}…</p>}
        {state.status === 'error' && (
          <p className="flex items-center gap-2 text-status-error">
            <AlertCircle className="size-4" aria-hidden /> {state.message}
          </p>
        )}
      </div>
    </div>
  )
}
