import { useRef } from 'react'
import { getPlatform } from '@adapters/platforms'
import { AlertCircle, Globe, Loader2 } from 'lucide-react'
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
    <div ref={containerRef} className="relative flex min-h-0 flex-1 items-center justify-center bg-canvas/50">
      <div className="flex max-w-sm flex-col items-center gap-2 px-6 text-center text-ui text-ink-muted">
        {state.status === 'unsupported' && (
          <>
            <Globe className="size-6 text-ink-faint" aria-hidden />
            <p className="font-medium text-ink-secondary">Web sessions need the desktop app</p>
            <p>
              Embedded {platform.name} sessions use Electron&apos;s WebContentsView. Run <code>npm run dev</code> to
              try them.
            </p>
          </>
        )}
        {state.status === 'loading' && (
          <p className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Opening web session…
          </p>
        )}
        {state.status === 'error' && (
          <p className="flex items-center gap-2 text-status-error-ink">
            <AlertCircle className="size-4" aria-hidden /> {state.message}
          </p>
        )}
      </div>
    </div>
  )
}
