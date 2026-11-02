import { useState, type FormEvent } from 'react'
import { getPlatform } from '@adapters/platforms'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useBotStore } from '@/store/botStore'
import type { AccountDraft, Bot } from '@/types'
import { AccountsEditor, emptyDraft, isDraftFilled } from './AccountsEditor'

const FORM_ID = 'add-accounts-form'

function AddAccountsForm({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const addAccountsToBot = useBotStore((s) => s.addAccountsToBot)
  const [drafts, setDrafts] = useState<AccountDraft[]>(() => [emptyDraft()])
  const [submitted, setSubmitted] = useState(false)

  const filled = drafts.filter((d) => d.accountId || isDraftFilled(d))
  const error = submitted && filled.length === 0 ? 'Add at least one account.' : undefined

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (filled.length === 0) return
    addAccountsToBot(bot.id, filled)
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Add accounts to ${bot.name}`}
      description={`${getPlatform(bot.platformId).name} accounts this bot can send from.`}
      footer={
        <>
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID}>
            Add {filled.length > 1 ? `${filled.length} accounts` : 'account'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate>
        <AccountsEditor
          platformId={bot.platformId}
          drafts={drafts}
          onChange={setDrafts}
          excludeIds={bot.accountIds}
          error={error}
        />
      </form>
    </Dialog>
  )
}

/** "+ Add" action for the info panel's accounts section. */
export function AddAccountsButton({ bot }: { bot: Bot }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="sm" className="-mr-2" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Add
      </Button>
      {open && <AddAccountsForm bot={bot} onClose={() => setOpen(false)} />}
    </>
  )
}
