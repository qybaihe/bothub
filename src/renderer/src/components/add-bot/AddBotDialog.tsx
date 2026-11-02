import { useState, type FormEvent } from 'react'
import { adapterRegistry } from '@adapters/registry'
import type { PlatformId } from '@adapters/types'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, TextInput } from '@/components/ui/Field'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu'
import { PlatformGlyph } from '@/components/ui/PlatformGlyph'
import { cn } from '@/lib/cn'
import { useBotStore } from '@/store/botStore'
import type { AccountDraft, GroupChoice } from '@/types'
import { AccountsEditor, emptyDraft, isDraftFilled } from './AccountsEditor'

const EMOJIS = ['🤖', '✍️', '📣', '💬', '🔭', '📚', '🧭', '🍋', '🎨', '🧠', '📈', '🛠️', '🎧', '🌱', '🧪', '⚡️']
const NAME_MAX = 40
const FORM_ID = 'add-bot-form'

/** Mounted only while open, so every opening starts from a clean form. */
export function AddBotDialog() {
  const open = useBotStore((s) => s.addBotOpen)
  const setOpen = useBotStore((s) => s.setAddBotOpen)
  return open ? <AddBotForm onClose={() => setOpen(false)} /> : null
}

function AddBotForm({ onClose }: { onClose: () => void }) {
  const groups = useBotStore((s) => s.groups)
  const selectedGroupId = useBotStore((s) => s.bots.find((b) => b.id === s.selectedBotId)?.groupId)
  const addBot = useBotStore((s) => s.addBot)

  const platforms = adapterRegistry.listPlatforms()
  const [platformId, setPlatformId] = useState<PlatformId>(
    () => platforms.find((p) => p.usable)?.id ?? 'meta-muse'
  )
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJIS[0]!)
  const [description, setDescription] = useState('')
  const [group, setGroup] = useState<GroupChoice>(() =>
    groups.length > 0
      ? { kind: 'existing', groupId: selectedGroupId ?? groups[0]!.id }
      : { kind: 'new', name: '' }
  )
  const [accounts, setAccounts] = useState<AccountDraft[]>(() => [emptyDraft()])
  const [submitted, setSubmitted] = useState(false)

  const platform = platforms.find((p) => p.id === platformId)
  const filledAccounts = accounts.filter((a) => a.accountId || isDraftFilled(a))

  const errors = {
    platform: platform?.usable ? undefined : 'Choose an available platform.',
    name: !name.trim() ? 'Give your bot a name.' : undefined,
    group: group.kind === 'new' && !group.name.trim() ? 'Name the new group.' : undefined,
    accounts: filledAccounts.length === 0 ? 'Add at least one account.' : undefined
  }
  const valid = !Object.values(errors).some(Boolean)
  const show = (error: string | undefined) => (submitted ? error : undefined)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (!valid || !platform) return
    addBot({ platformId, name, emoji, description, group, accounts: filledAccounts })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Add a bot"
      description="A bot pairs a platform with one or more accounts it can send from."
      footer={
        <>
          <p className="mr-auto text-caption text-ink-muted">New accounts connect automatically.</p>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} disabled={submitted && !valid}>
            Create bot
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-ui font-medium text-ink">Platform</legend>
          <div role="radiogroup" aria-label="Platform" className="grid grid-cols-2 gap-2">
            {platforms.map((p) => {
              const selected = p.id === platformId
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!p.usable}
                  onClick={() => setPlatformId(p.id)}
                  className={cn(
                    'relative flex items-center gap-3 rounded-xl border bg-surface p-3 text-left transition-[border-color,box-shadow,background-color]',
                    p.usable && 'col-span-2',
                    selected
                      ? 'border-accent-400 bg-accent-50/50 ring-3 ring-accent-100'
                      : 'border-line hover:border-line-strong',
                    !p.usable && 'cursor-not-allowed bg-canvas/60'
                  )}
                >
                  <PlatformGlyph platform={p} size={p.usable ? 'md' : 'sm'} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate font-medium', p.usable ? 'text-ink' : 'text-ink-muted')}>
                      {p.name}
                    </span>
                    {p.usable && <span className="block truncate text-caption text-ink-muted">{p.description}</span>}
                  </span>
                  {p.usable ? (
                    selected && (
                      <span className="grid size-5 place-items-center rounded-full bg-accent-600 text-white">
                        <Check className="size-3" strokeWidth={3} aria-hidden />
                      </span>
                    )
                  ) : (
                    <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                      Coming soon
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {show(errors.platform) && <p className="text-caption text-status-error-ink">{errors.platform}</p>}
        </fieldset>

        <Field label="Name" htmlFor="bot-name" error={show(errors.name)}>
          <div className="flex gap-2">
            <Menu>
              <MenuTrigger
                aria-label={`Bot icon: ${emoji}. Change icon`}
                className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-line-strong bg-surface pr-1.5 pl-2.5 text-lg shadow-soft hover:bg-surface-hover data-[state=open]:bg-surface-hover"
              >
                {emoji}
                <ChevronDown className="size-3.5 text-ink-muted" aria-hidden />
              </MenuTrigger>
              <MenuContent align="start" className="grid min-w-0 grid-cols-8 gap-0.5 p-1.5">
                {EMOJIS.map((option) => (
                  <MenuItem
                    key={option}
                    onSelect={() => setEmoji(option)}
                    aria-label={option}
                    className={cn(
                      'size-8 justify-center p-0 text-lg',
                      option === emoji && 'bg-accent-50 ring-1 ring-accent-200'
                    )}
                  >
                    {option}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
            <TextInput
              id="bot-name"
              autoFocus
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Launch Copywriter"
              invalid={!!show(errors.name)}
            />
          </div>
        </Field>

        <Field label="Description" htmlFor="bot-description" hint="Optional. Shown in the details panel.">
          <TextInput
            id="bot-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this bot for?"
          />
        </Field>

        <Field label="Group" error={show(errors.group)}>
          <div role="radiogroup" aria-label="Group" className="flex flex-wrap gap-1.5">
            {groups.map((g) => {
              const selected = group.kind === 'existing' && group.groupId === g.id
              return (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setGroup({ kind: 'existing', groupId: g.id })}
                  className={cn(
                    'h-7 rounded-full border px-3 text-caption font-medium transition-colors',
                    selected
                      ? 'border-accent-300 bg-accent-50 text-accent-700'
                      : 'border-line bg-surface text-ink-secondary hover:bg-surface-hover'
                  )}
                >
                  {g.name}
                </button>
              )
            })}
            <button
              type="button"
              role="radio"
              aria-checked={group.kind === 'new'}
              onClick={() => setGroup({ kind: 'new', name: group.kind === 'new' ? group.name : '' })}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-full border border-dashed px-3 text-caption font-medium transition-colors',
                group.kind === 'new'
                  ? 'border-accent-300 bg-accent-50 text-accent-700'
                  : 'border-line-strong text-ink-muted hover:bg-surface-hover hover:text-ink'
              )}
            >
              <Plus className="size-3" aria-hidden /> New group
            </button>
          </div>
          {group.kind === 'new' && (
            <TextInput
              autoFocus
              value={group.name}
              onChange={(e) => setGroup({ kind: 'new', name: e.target.value })}
              placeholder="Group name"
              aria-label="New group name"
              className="mt-1"
              invalid={!!show(errors.group)}
            />
          )}
        </Field>

        <fieldset>
          <legend className="mb-1 text-ui font-medium text-ink">Accounts</legend>
          <p className="mb-3 text-caption text-ink-muted">
            Add every account this bot can send from. You can switch between them in the conversation header.
          </p>
          <AccountsEditor
            platformId={platformId}
            drafts={accounts}
            onChange={setAccounts}
            error={show(errors.accounts)}
          />
        </fieldset>
      </form>
    </Dialog>
  )
}
