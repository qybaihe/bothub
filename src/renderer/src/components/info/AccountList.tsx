import { useState } from 'react'
import { Check, Loader2, LogIn, LogOut, MoreHorizontal, Pencil, Plug, Unplug, UserMinus, UserRoundCheck } from 'lucide-react'
import { AccountAvatar } from '@/components/ui/Avatar'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { STATUS_LABEL } from '@/components/ui/Status'
import { cn } from '@/lib/cn'
import { useBotStore } from '@/store/botStore'
import type { Bot, BotAccount } from '@/types'
import { t } from '@/lib/i18n'

interface AccountListProps {
  bot: Bot
  accounts: BotAccount[]
}

/**
 * One row per account: avatar with status dot and name. The row picks the
 * sending account; everything else lives in the row's ⋯ menu.
 */
export function AccountList({ bot, accounts }: AccountListProps) {
  const setActiveAccount = useBotStore((s) => s.setActiveAccount)
  const connectAccount = useBotStore((s) => s.connectAccount)
  const disconnectAccount = useBotStore((s) => s.disconnectAccount)
  const renameAccount = useBotStore((s) => s.renameAccount)
  const signOutAccount = useBotStore((s) => s.signOutAccount)
  const removeAndClearAccount = useBotStore((s) => s.removeAndClearAccount)
  const openMuseLogin = useBotStore((s) => s.openMuseLogin)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const several = accounts.length > 1

  return (
    <ul className="divide-y divide-line">
      {accounts.map((account) => {
        const active = account.id === bot.activeAccountId
        const connected = account.status === 'online' || account.status === 'busy' || account.status === 'attention'
        const isMuse = account.platformId === 'meta-muse'
        const unread = account.unread ?? 0
        const name = account.label || account.displayName
        const showError = account.status === 'error' && account.statusDetail
        return (
          <li
            key={account.id}
            className={cn(
              'group relative flex items-center gap-2.5 px-3',
              !connected && isMuse && editingId !== account.id ? 'min-h-14 pt-2 pb-7' : 'min-h-12 py-2'
            )}
          >
            {editingId === account.id ? (
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <AccountAvatar name={account.displayName} status={account.status} />
                <InlineEdit
                  value={name}
                  label={t('Account name')}
                  className="text-[13px]"
                  onCommit={(value) => renameAccount(account.id, value)}
                  onDone={() => setEditingId(null)}
                />
              </span>
            ) : (
              <button
                type="button"
                disabled={!several}
                onClick={() => setActiveAccount(bot.id, account.id)}
                title={[account.handle, STATUS_LABEL[account.status]].filter(Boolean).join(' · ')}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left disabled:cursor-default"
              >
                <span className="relative shrink-0">
                  <AccountAvatar name={account.displayName} status={account.status} />
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent-600 px-1 text-[10px] font-medium text-white tabular-nums">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] leading-[18px] text-ink">{name}</span>
                  {showError && (
                    <span className="block truncate text-[12px] leading-4 text-status-error">{account.statusDetail}</span>
                  )}
                </span>
              </button>
            )}

            {/* Signed-out Muse accounts get the sign-in action under the name. */}
            {!connected && isMuse && editingId !== account.id && (
              <button
                type="button"
                disabled={account.pending}
                onClick={() => void openMuseLogin(account.id)}
                className="press absolute bottom-1.5 left-[50px] inline-flex h-5 items-center gap-1 rounded-md px-1 text-[12px] text-accent-600 hover:bg-accent-50 disabled:opacity-60"
              >
                {account.pending && <Loader2 className="size-3 animate-spin" aria-hidden />}
                {account.pending ? '登录中…' : '使用 Muse 登录'}
              </button>
            )}

            {account.pending && !isMuse && <Loader2 className="size-4 animate-spin text-ink-muted" aria-label={t('Updating')} />}

            {/* The check marks the sending account and gives way to ⋯ on hover. */}
            <span className="relative grid size-7 shrink-0 place-items-center">
            {several && active && editingId !== account.id && (
              <Check
                className="size-4 text-accent-600 transition-opacity duration-100 group-focus-within:opacity-0 group-hover:opacity-0"
                aria-label={t('Sending from this account')}
              />
            )}
            <Menu onOpenChange={(open) => !open && setConfirmRemove(null)}>
              <MenuTrigger
                aria-label={`Actions for ${name}`}
                disabled={account.pending}
                className={cn(
                  'press-icon absolute inset-0 grid place-items-center rounded-full text-ink-secondary hover:bg-hover hover:text-ink',
                  'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-hover data-[state=open]:opacity-100'
                )}
              >
                <MoreHorizontal className="size-4" />
              </MenuTrigger>
              <MenuContent align="end">
                {several && (
                  <MenuItem disabled={active} onSelect={() => setActiveAccount(bot.id, account.id)}>
                    {active ? <Check aria-hidden /> : <UserRoundCheck aria-hidden />}
                    {active ? '当前发送账号' : '用此账号发送'}
                  </MenuItem>
                )}
                <MenuItem onSelect={() => setEditingId(account.id)}>
                  <Pencil aria-hidden /> 重命名
                </MenuItem>
                {connected ? (
                  <MenuItem onSelect={() => void disconnectAccount(account.id)}>
                    <Unplug aria-hidden /> 断开
                  </MenuItem>
                ) : isMuse ? (
                  <MenuItem onSelect={() => void openMuseLogin(account.id)}>
                    <LogIn aria-hidden /> 使用 Muse 登录
                  </MenuItem>
                ) : (
                  <MenuItem onSelect={() => void connectAccount(account.id)}>
                    <Plug aria-hidden /> {account.status === 'error' ? '重试连接' : '连接'}
                  </MenuItem>
                )}
                <MenuItem onSelect={() => void signOutAccount(account.id)}>
                  <LogOut aria-hidden /> 退出登录
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  disabled={!several}
                  className={cn(confirmRemove === account.id && 'bg-status-error/10 data-[highlighted]:bg-status-error/15')}
                  onSelect={(event) => {
                    // Wiping a session cannot be undone, so it takes a second click.
                    if (confirmRemove !== account.id) {
                      event.preventDefault()
                      setConfirmRemove(account.id)
                      return
                    }
                    void removeAndClearAccount(bot.id, account.id)
                  }}
                >
                  <UserMinus aria-hidden /> {confirmRemove === account.id ? '再点一次确认移除' : '移除并清除会话'}
                </MenuItem>
              </MenuContent>
            </Menu>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
