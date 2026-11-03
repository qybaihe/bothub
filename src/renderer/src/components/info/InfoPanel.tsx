import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { AddAccountsButton } from '@/components/add-bot/AddAccountsDialog'
import { PaneHeader } from '@/components/layout/PaneHeader'
import { ApprovalsSection } from '@/components/muse/ApprovalsSection'
import { ConnectorsSection } from '@/components/muse/ConnectorsSection'
import { BotAvatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { useGlide } from '@/hooks/useGlide'
import { avatarFromFile } from '@/lib/avatarImage'
import { cn } from '@/lib/cn'
import { getBotAccounts, getBotStatus } from '@/lib/selectors'
import { shortcutLabel } from '@/lib/shortcuts'
import { useBotStore } from '@/store/botStore'
import type { Bot } from '@/types'
import { AccountList } from './AccountList'
import { MemoryEditor } from './MemoryEditor'
import { EmptyLine, Section } from './Section'

type InfoTab = 'details' | 'browser'
const TABS: ReadonlyArray<[InfoTab, string]> = [
  ['details', 'Details'],
  ['browser', 'Browser']
]

/** Avatar (click: photo) and name (click: rename) at the top of details. */
function BotHero({ bot }: { bot: Bot }) {
  const accounts = useBotStore((s) => s.accounts)
  const renameBot = useBotStore((s) => s.renameBot)
  const setBotAvatar = useBotStore((s) => s.setBotAvatar)
  const [editing, setEditing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col items-center px-5 pt-1 pb-5 text-center">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        aria-label={bot.avatar ? 'Change photo' : 'Add a photo'}
        title={bot.avatar ? 'Change photo' : 'Add a photo'}
        className="press-icon rounded-full"
      >
        <span key={bot.avatar ?? 'mark'} className="inline-flex animate-mark-pop">
          <BotAvatar
            emoji={bot.emoji}
            seed={bot.id}
            avatar={bot.avatar}
            platformId={bot.platformId}
            status={getBotStatus(bot, accounts)}
            size="lg"
            ringClassName="ring-main"
          />
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void avatarFromFile(file).then((avatar) => setBotAvatar(bot.id, avatar), () => {})
        }}
      />
      <div className="mt-3 flex h-7 w-full max-w-[240px] items-center justify-center">
        {editing ? (
          <InlineEdit
            value={bot.name}
            label="Bot name"
            className="h-8 text-center text-[17px] font-medium"
            onCommit={(name) => renameBot(bot.id, name)}
            onDone={() => setEditing(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Rename"
            className="max-w-full truncate rounded-md px-1.5 text-[17px] leading-6 font-medium tracking-tight text-ink transition-colors hover:bg-hover"
          >
            {bot.name}
          </button>
        )}
      </div>
    </div>
  )
}

function Tabs({ tab, onChange }: { tab: InfoTab; onChange: (tab: InfoTab) => void }) {
  const glide = useGlide<HTMLDivElement>(tab, { axis: 'x' })
  return (
    <div
      ref={glide.ref}
      role="tablist"
      aria-label="Details panels"
      className="relative mx-5 flex rounded-[10px] bg-hover p-0.5"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const next = TABS[(TABS.findIndex(([id]) => id === tab) + 1) % TABS.length]![0]
        onChange(next)
        glide.ref.current?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus()
      }}
    >
      {glide.thumb && (
        <span aria-hidden className="absolute top-0.5 bottom-0.5 rounded-lg bg-surface shadow-float" style={glide.thumb} />
      )}
      {TABS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          data-tab={id}
          aria-selected={tab === id}
          tabIndex={tab === id ? 0 : -1}
          onClick={() => onChange(id)}
          className={cn(
            'press relative h-[30px] flex-1 rounded-lg text-[13px] transition-colors',
            tab === id ? 'text-ink' : 'text-ink-secondary hover:text-ink'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function InfoPanel() {
  const bot = useBotStore((s) => s.bots.find((b) => b.id === s.selectedBotId))
  const accountMap = useBotStore((s) => s.accounts)
  const toggleInfoPanel = useBotStore((s) => s.toggleInfoPanel)
  const updateNotes = useBotStore((s) => s.updateNotes)
  const [tab, setTab] = useState<InfoTab>('details')

  const accounts = useMemo(() => (bot ? getBotAccounts(bot, accountMap) : []), [bot, accountMap])

  return (
    <>
      <PaneHeader className="pr-3">
        <IconButton
          label="Close details"
          shortcut={shortcutLabel('I')}
          className="no-drag ml-auto"
          onClick={toggleInfoPanel}
        >
          <X />
        </IconButton>
      </PaneHeader>

      {bot && (
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          <BotHero key={bot.id} bot={bot} />
          <Tabs tab={tab} onChange={setTab} />

          <div key={`${bot.id}:${tab}`} className="animate-veil-in">
            {tab === 'details' ? (
              <>
                <Section title="Accounts" count={accounts.length > 1 ? accounts.length : undefined} action={<AddAccountsButton bot={bot} />} flush>
                  <AccountList bot={bot} accounts={accounts} />
                </Section>
                <Section title="Memory" count={bot.memory.length}>
                  <MemoryEditor bot={bot} />
                </Section>
                <Section title="Notes" flush>
                  <textarea
                    value={bot.notes}
                    onChange={(event) => updateNotes(bot.id, event.target.value)}
                    placeholder="Private notes"
                    aria-label="Notes"
                    rows={3}
                    className="block w-full resize-none bg-transparent px-3 py-2.5 text-[13px] leading-[18px] text-ink outline-none placeholder:text-ink-muted"
                  />
                </Section>
              </>
            ) : bot.platformId === 'meta-muse' && bot.activeAccountId ? (
              <>
                <ApprovalsSection accountId={bot.activeAccountId} />
                <ConnectorsSection accountId={bot.activeAccountId} />
              </>
            ) : (
              <Section title="Browser">
                <EmptyLine>Not available for this platform</EmptyLine>
              </Section>
            )}
          </div>
        </div>
      )}
    </>
  )
}
