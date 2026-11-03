import { ChevronRight, Globe, PanelRight } from 'lucide-react'
import { PaneHeader } from '@/components/layout/PaneHeader'
import { BotAvatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import { STATUS_LABEL } from '@/components/ui/Status'
import { cn } from '@/lib/cn'
import { getBotStatus } from '@/lib/selectors'
import { shortcutLabel } from '@/lib/shortcuts'
import { useBotStore } from '@/store/botStore'
import type { Bot, BotAccount } from '@/types'
import { AccountSwitcher } from './AccountSwitcher'

interface ChatHeaderProps {
  bot: Bot
  accounts: BotAccount[]
}

export function ChatHeader({ bot, accounts }: ChatHeaderProps) {
  const allAccounts = useBotStore((s) => s.accounts)
  const infoOpen = useBotStore((s) => s.infoPanelOpen)
  const toggleInfoPanel = useBotStore((s) => s.toggleInfoPanel)
  const setActiveAccount = useBotStore((s) => s.setActiveAccount)
  const webSessionOpen = useBotStore((s) => s.webSessionOpen)
  const toggleWebSession = useBotStore((s) => s.toggleWebSession)

  const status = getBotStatus(bot, allAccounts)

  return (
    <PaneHeader className="gap-3 pr-3">
      <div className="min-w-0 flex-1" />

      {/* The capsule: avatar + name; hovering reveals the way into details. */}
      <button
        type="button"
        data-capsule
        onClick={toggleInfoPanel}
        aria-expanded={infoOpen}
        title={`${bot.name} · ${STATUS_LABEL[status]}`}
        className={cn(
          'no-drag group press flex h-10 max-w-[min(420px,50%)] min-w-0 items-center gap-2 rounded-full pr-3.5 pl-2',
          'border-[0.5px] border-line-strong bg-main shadow-float hover:bg-surface'
        )}
      >
        <BotAvatar
          emoji={bot.emoji}
          seed={bot.id}
          avatar={bot.avatar}
          platformId={bot.platformId}
          status={status}
          size="xs"
          ringClassName="ring-main"
        />
        <h1 className="min-w-0 truncate text-[14px] leading-5 font-medium text-ink">{bot.name}</h1>
        <ChevronRight
          aria-hidden
          className={cn(
            '-ml-2 size-4 w-0 shrink-0 -translate-x-1.5 text-ink-muted opacity-0 blur-[3px]',
            'transition-[width,margin,opacity,filter,translate] duration-[290ms] ease-spring-tap',
            'group-hover:ml-0 group-hover:w-4 group-hover:translate-x-0 group-hover:opacity-100 group-hover:blur-none',
            'group-focus-visible:ml-0 group-focus-visible:w-4 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:blur-none'
          )}
        />
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        {accounts.length > 1 && (
          <AccountSwitcher
            bot={bot}
            accounts={accounts}
            onSelect={(accountId) => setActiveAccount(bot.id, accountId)}
            onManage={() => {
              if (!infoOpen) toggleInfoPanel()
            }}
          />
        )}
        <IconButton
          label={webSessionOpen ? 'Back to conversation' : 'Show web session'}
          active={webSessionOpen}
          onClick={toggleWebSession}
        >
          <Globe />
        </IconButton>
        <IconButton
          label={infoOpen ? 'Hide details' : 'Show details'}
          shortcut={shortcutLabel('I')}
          active={infoOpen}
          onClick={toggleInfoPanel}
        >
          <PanelRight />
        </IconButton>
      </div>
    </PaneHeader>
  )
}
