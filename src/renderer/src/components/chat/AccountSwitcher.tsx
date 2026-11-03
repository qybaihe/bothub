import { Check, ChevronDown, Settings2 } from 'lucide-react'
import { AccountAvatar } from '@/components/ui/Avatar'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { STATUS_LABEL } from '@/components/ui/Status'
import { cn } from '@/lib/cn'
import type { Bot, BotAccount } from '@/types'

interface AccountSwitcherProps {
  bot: Bot
  accounts: BotAccount[]
  onSelect: (accountId: string) => void
  onManage: () => void
}

/** Chooses which of the bot's accounts sends the next message. */
export function AccountSwitcher({ bot, accounts, onSelect, onManage }: AccountSwitcherProps) {
  const active = accounts.find((a) => a.id === bot.activeAccountId)
  if (!active) return null

  return (
    <Menu>
      <MenuTrigger
        className={cn(
          'no-drag press flex h-8 max-w-56 items-center gap-1.5 rounded-full pr-2 pl-1',
          'hover:bg-hover data-[state=open]:bg-hover'
        )}
        aria-label={`Sending as ${active.displayName}. Switch account`}
      >
        <span className="relative">
          <AccountAvatar name={active.displayName} size="xs" status={active.status} />
          {(active.unread ?? 0) > 0 && (
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-accent-600" />
          )}
        </span>
        <span className="truncate text-[13px] text-ink">{active.label || active.displayName}</span>
        <ChevronDown className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
      </MenuTrigger>
      <MenuContent align="end" className="w-64">
        <MenuLabel>Send as</MenuLabel>
        {accounts.map((account) => (
          <MenuItem key={account.id} onSelect={() => onSelect(account.id)}>
            <span className="relative">
              <AccountAvatar name={account.displayName} size="sm" status={account.status} />
              {(account.unread ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent-600 px-1 text-[9px] font-semibold text-white">
                  {account.unread}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate" title={STATUS_LABEL[account.status]}>
              {account.label || account.displayName}
            </span>
            {account.id === bot.activeAccountId && <Check className="!text-accent-600" aria-label="Active" />}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={onManage}>
          <Settings2 aria-hidden />
          Manage accounts
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
