import { Check, Loader2, MoreHorizontal, Plug, Unplug, UserMinus, UserRoundCheck } from 'lucide-react'
import { AccountAvatar } from '@/components/ui/Avatar'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { StatusBadge } from '@/components/ui/Status'
import { cn } from '@/lib/cn'
import { useBotStore } from '@/store/botStore'
import type { Bot, BotAccount } from '@/types'

interface AccountListProps {
  bot: Bot
  accounts: BotAccount[]
}

export function AccountList({ bot, accounts }: AccountListProps) {
  const setActiveAccount = useBotStore((s) => s.setActiveAccount)
  const connectAccount = useBotStore((s) => s.connectAccount)
  const disconnectAccount = useBotStore((s) => s.disconnectAccount)
  const removeAccountFromBot = useBotStore((s) => s.removeAccountFromBot)

  return (
    <ul className="-mx-2 flex flex-col gap-0.5">
      {accounts.map((account) => {
        const active = account.id === bot.activeAccountId
        const connected = account.status === 'online' || account.status === 'busy'
        return (
          <li
            key={account.id}
            className={cn(
              'group flex items-center gap-2.5 rounded-lg px-2 py-1.5',
              active ? 'bg-accent-50/60' : 'hover:bg-surface-hover'
            )}
          >
            <AccountAvatar
              name={account.displayName}
              status={account.status}
              ringClassName={active ? 'ring-accent-50' : 'ring-surface'}
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-ui font-medium text-ink">
                <span className="truncate">{account.displayName}</span>
                {active && (
                  <span className="shrink-0 rounded bg-accent-100 px-1 text-[10px] leading-4 font-semibold text-accent-700">
                    ACTIVE
                  </span>
                )}
              </p>
              <p className="truncate text-caption text-ink-muted" title={account.statusDetail}>
                {account.status === 'error' && account.statusDetail ? account.statusDetail : account.handle}
              </p>
            </div>

            {account.pending ? (
              <Loader2 className="size-4 animate-spin text-ink-muted" aria-label="Updating" />
            ) : (
              <StatusBadge status={account.status} />
            )}

            <Menu>
              <MenuTrigger
                aria-label={`Actions for ${account.displayName}`}
                disabled={account.pending}
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-md text-ink-muted transition-opacity hover:bg-sunken hover:text-ink',
                  'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-sunken data-[state=open]:opacity-100'
                )}
              >
                <MoreHorizontal className="size-4" />
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem disabled={active} onSelect={() => setActiveAccount(bot.id, account.id)}>
                  {active ? <Check className="size-4 text-accent-600" /> : <UserRoundCheck className="size-4 text-ink-muted" />}
                  {active ? 'Sending from this account' : 'Send from this account'}
                </MenuItem>
                {connected ? (
                  <MenuItem onSelect={() => void disconnectAccount(account.id)}>
                    <Unplug className="size-4 text-ink-muted" /> Disconnect
                  </MenuItem>
                ) : (
                  <MenuItem onSelect={() => void connectAccount(account.id)}>
                    <Plug className="size-4 text-ink-muted" /> {account.status === 'error' ? 'Reconnect' : 'Connect'}
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem
                  disabled={accounts.length <= 1}
                  onSelect={() => removeAccountFromBot(bot.id, account.id)}
                  className="text-status-error-ink"
                >
                  <UserMinus className="size-4" /> Remove from bot
                </MenuItem>
              </MenuContent>
            </Menu>
          </li>
        )
      })}
    </ul>
  )
}
