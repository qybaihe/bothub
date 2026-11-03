import { getPlatform } from '@adapters/platforms'
import { Globe, PanelRight } from 'lucide-react'
import { PaneHeader } from '@/components/layout/PaneHeader'
import { BotAvatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import { StatusBadge } from '@/components/ui/Status'
import { getBotStatus } from '@/lib/selectors'
import { useBotStore } from '@/store/botStore'
import type { Bot, BotAccount } from '@/types'
import { AccountSwitcher } from './AccountSwitcher'

interface ChatHeaderProps {
  bot: Bot
  accounts: BotAccount[]
}

export function ChatHeader({ bot, accounts }: ChatHeaderProps) {
  const allAccounts = useBotStore((s) => s.accounts)
  const groupName = useBotStore((s) => s.groups.find((g) => g.id === bot.groupId)?.name)
  const infoOpen = useBotStore((s) => s.infoPanelOpen)
  const toggleInfoPanel = useBotStore((s) => s.toggleInfoPanel)
  const setActiveAccount = useBotStore((s) => s.setActiveAccount)
  const webSessionOpen = useBotStore((s) => s.webSessionOpen)
  const toggleWebSession = useBotStore((s) => s.toggleWebSession)

  const platform = getPlatform(bot.platformId)
  const status = getBotStatus(bot, allAccounts)

  return (
    <PaneHeader className="gap-3 pr-3">
      <BotAvatar emoji={bot.emoji} seed={bot.id} platformId={bot.platformId} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-sm font-semibold tracking-tight">{bot.name}</h1>
          <StatusBadge status={status} />
        </div>
        <p className="flex items-center gap-1.5 truncate text-caption text-ink-muted">
          <span className="font-medium text-ink-secondary">{platform.name}</span>
          {groupName && (
            <>
              <span aria-hidden>·</span>
              <span>{groupName}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </span>
        </p>
      </div>

      <AccountSwitcher
        bot={bot}
        accounts={accounts}
        onSelect={(accountId) => setActiveAccount(bot.id, accountId)}
        onManage={() => {
          if (!infoOpen) toggleInfoPanel()
        }}
      />
      <div className="flex items-center gap-0.5">
        <IconButton
          label={webSessionOpen ? 'Back to conversation' : 'Show web session'}
          active={webSessionOpen}
          onClick={toggleWebSession}
        >
          <Globe />
        </IconButton>
        <IconButton
          label={infoOpen ? 'Hide details' : 'Show details'}
          active={infoOpen}
          onClick={toggleInfoPanel}
        >
          <PanelRight />
        </IconButton>
      </div>
    </PaneHeader>
  )
}
