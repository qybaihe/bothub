import { useEffect, useState } from 'react'
import { getPlatform } from '@adapters/platforms'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { usePlatformLogin } from '@/hooks/usePlatformLogin'
import { useBotStore } from '@/store/botStore'
import type { Bot } from '@/types'
import { LoginWaiting } from './AddBotDialog'
import { t } from '@/lib/i18n'

/** Opens the login window at once; the signed-in account joins the bot. */
function AddAccountFlow({ bot, open, onClose }: { bot: Bot; open: boolean; onClose: () => void }) {
  const addAccountsToBot = useBotStore((s) => s.addAccountsToBot)
  const login = usePlatformLogin(bot.id)
  const { phase } = login
  const platform = getPlatform(bot.platformId)

  useEffect(() => {
    login.start(bot.platformId)
  }, [])

  useEffect(() => {
    if (phase.kind !== 'signed-in') return
    login.keep()
    addAccountsToBot(bot.id, [
      {
        key: login.accountId,
        accountId: login.accountId,
        displayName: `Account ${bot.accountIds.length + 1}`,
        handle: ''
      }
    ])
    onClose()
  }, [phase.kind])

  const close = () => {
    login.discard()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={t('Sign in to {name}', { name: platform.name })}
      className="w-[min(92vw,420px)]"
    >
      {phase.kind === 'waiting' ? (
        <LoginWaiting platformId={bot.platformId} windowClosed={phase.windowClosed} onReopen={login.reopen} />
      ) : phase.kind === 'idle' && phase.error ? (
        <div className="flex animate-step-in flex-col items-center gap-4 pt-2 pb-2 text-center">
          <p className="text-[14px] text-status-error" role="alert">
            {phase.error}
          </p>
          <Button variant="primary" onClick={() => login.start(bot.platformId)}>
            {t('Try again')}
          </Button>
        </div>
      ) : (
        <div className="h-[148px]" />
      )}
    </Dialog>
  )
}

/** "+ Add" action for the details panel's accounts section. */
export function AddAccountsButton({ bot }: { bot: Bot }) {
  const [session, setSession] = useState(0)
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="-mr-2"
        onClick={() => {
          setSession((n) => n + 1)
          setOpen(true)
        }}
      >
        <Plus aria-hidden /> {t('Add')}
      </Button>
      {session > 0 && <AddAccountFlow key={session} bot={bot} open={open} onClose={() => setOpen(false)} />}
    </>
  )
}
