import { useMemo, useRef, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { AddAccountsButton } from '@/components/add-bot/AddAccountsDialog'
import { PaneHeader } from '@/components/layout/PaneHeader'
import { ApprovalsSection } from '@/components/muse/ApprovalsSection'
import { MemorySection } from '@/components/muse/MemorySection'
import { PermissionsSection } from '@/components/muse/PermissionsSection'
import { SkillsSection } from '@/components/muse/SkillsSection'
import { ConnectorsSection } from '@/components/muse/ConnectorsSection'
import { FilesSection } from '@/components/muse/FilesSection'
import { InviteSection } from '@/components/muse/InviteSection'
import { PeersSection } from '@/components/muse/PeersSection'
import { SharedAgentsSection } from '@/components/muse/SharedAgentsSection'
import { ProxySection } from '@/components/muse/ProxySection'
import { QuotaSection } from '@/components/muse/QuotaSection'
import { SchedulesSection } from '@/components/muse/SchedulesSection'
import { SessionsSection } from '@/components/muse/SessionsSection'
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
import { EmptyLine, Section, SectionsCollapsed } from './Section'
import { t } from '@/lib/i18n'

/** Grok Bot–aligned chips: Overview / Library / Computer (Slice 1 UI parity). */
type InfoTab = 'overview' | 'library' | 'computer' | 'members'
const TABS: ReadonlyArray<[InfoTab, string]> = [
  ['overview', 'Overview'],
  ['library', 'Library'],
  ['computer', 'Computer'],
  ['members', 'Members']
]

const STATUS_LABEL: Record<string, string> = {
  online: 'Online',
  busy: 'Busy',
  attention: 'Needs attention',
  offline: 'Offline',
  error: 'Error'
}
const STATUS_DOT: Record<string, string> = {
  online: 'bg-status-online',
  busy: 'bg-status-attention',
  attention: 'bg-status-attention',
  offline: 'bg-ink-muted',
  error: 'bg-status-error'
}

/** Compact header row: avatar (click: photo), name (click: rename), status, quick actions. */
function BotHero({ bot }: { bot: Bot }) {
  const accounts = useBotStore((s) => s.accounts)
  const renameBot = useBotStore((s) => s.renameBot)
  const setBotAvatar = useBotStore((s) => s.setBotAvatar)
  const [editing, setEditing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const status = getBotStatus(bot, accounts)
  const platform = bot.platformId === 'meta-muse' ? 'Muse' : bot.platformId

  return (
    <div className="flex items-center gap-3 px-4 pb-3">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        aria-label={bot.avatar ? t('Change photo') : t('Add a photo')}
        title={bot.avatar ? t('Change photo') : t('Add a photo')}
        className="press-icon shrink-0 rounded-full"
      >
        <span key={bot.avatar ?? 'mark'} className="inline-flex animate-mark-pop">
          <BotAvatar
            emoji={bot.emoji}
            seed={bot.id}
            avatar={bot.avatar}
            platformId={bot.platformId}
            status={status}
            size="md"
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
      <div className="min-w-0 flex-1">
        {editing ? (
          <InlineEdit
            value={bot.name}
            label={t('Bot name')}
            className="h-7 text-[15px] font-semibold"
            onCommit={(name) => renameBot(bot.id, name)}
            onDone={() => setEditing(false)}
          />
        ) : (
          <p className="truncate text-[15px] leading-5 font-semibold tracking-tight text-ink">{bot.name}</p>
        )}
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-secondary">
          <span aria-hidden className={cn('size-1.5 rounded-full', STATUS_DOT[status] ?? 'bg-ink-muted')} />
          <span>{t(STATUS_LABEL[status] ?? status)}</span>
          <span className="text-ink-muted">· {platform}</span>
        </p>
      </div>
      <IconButton label={t('Rename')} className="shrink-0" onClick={() => setEditing(true)}>
        <Pencil />
      </IconButton>
    </div>
  )
}

function Tabs({ tab, onChange }: { tab: InfoTab; onChange: (tab: InfoTab) => void }) {
  const glide = useGlide<HTMLDivElement>(tab, { axis: 'x' })
  return (
    <div
      ref={glide.ref}
      role="tablist"
      aria-label={t('Details panels')}
      className="relative mx-4 flex rounded-[10px] bg-hover p-0.5"
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
            'press relative h-[30px] min-w-0 flex-1 rounded-lg px-0 text-[12px] tracking-tight whitespace-nowrap transition-colors',
            tab === id ? 'text-ink' : 'text-ink-secondary hover:text-ink'
          )}
        >
          {t(label)}
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
  const [tab, setTab] = useState<InfoTab>('overview')

  const accounts = useMemo(() => (bot ? getBotAccounts(bot, accountMap) : []), [bot, accountMap])

  return (
    <>
      <PaneHeader className="pr-3">
        <IconButton
          label={t('Close details')}
          shortcut={shortcutLabel('I')}
          className="no-drag ml-auto"
          onClick={toggleInfoPanel}
        >
          <X />
        </IconButton>
      </PaneHeader>

      {bot && (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <BotHero key={bot.id} bot={bot} />
          <Tabs tab={tab} onChange={setTab} />

          <div key={`${bot.id}:${tab}`} className="animate-veil-in">
            {tab === 'overview' ? (
              <>
                {bot.platformId === 'meta-muse' && bot.activeAccountId && (
                  <>
                    <QuotaSection accountId={bot.activeAccountId} />
                    <ApprovalsSection accountId={bot.activeAccountId} />
                    <SessionsSection accountId={bot.activeAccountId} />
                    <SchedulesSection accountId={bot.activeAccountId} />
                  </>
                )}
                <Section title={t('Accounts')} count={accounts.length > 1 ? accounts.length : undefined} action={<AddAccountsButton bot={bot} />} flush>
                  <AccountList bot={bot} accounts={accounts} />
                </Section>
                {bot.platformId === 'meta-muse' && bot.activeAccountId && (
                  <ConnectorsSection accountId={bot.activeAccountId} />
                )}
                <SectionsCollapsed>
                  {bot.platformId === 'meta-muse' && bot.activeAccountId && (
                    <>
                      <PermissionsSection accountId={bot.activeAccountId} />
                      <MemorySection accountId={bot.activeAccountId} />
                      <SkillsSection accountId={bot.activeAccountId} />
                      <ProxySection accountId={bot.activeAccountId} />
                    </>
                  )}
                  <Section title={t('Local notes (BotHub)')} count={bot.memory.length}>
                    <MemoryEditor bot={bot} />
                  </Section>
                  <Section title={t('Notes')} flush>
                    <textarea
                      value={bot.notes}
                      onChange={(event) => updateNotes(bot.id, event.target.value)}
                      placeholder={t('Private notes')}
                      aria-label={t('Notes')}
                      rows={3}
                      className="block w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-[18px] text-ink outline-none placeholder:text-ink-muted"
                    />
                  </Section>
                </SectionsCollapsed>
              </>
            ) : tab === 'library' ? (
              bot.platformId === 'meta-muse' && bot.activeAccountId ? (
                <FilesSection accountId={bot.activeAccountId} />
              ) : (
                <Section title={t('Library')}>
                  <EmptyLine>{t('Library is available for Muse bots (files on the agent).')}</EmptyLine>
                </Section>
              )
            ) : tab === 'members' ? (
              <>
                {bot.platformId === 'meta-muse' && bot.activeAccountId ? (
                  <>
                    <SharedAgentsSection accountId={bot.activeAccountId} />
                    <InviteSection accountId={bot.activeAccountId} />
                    <SectionsCollapsed>
                      <PeersSection accountId={bot.activeAccountId} />
                    </SectionsCollapsed>
                  </>
                ) : (
                  <Section title={t('Members')}>
                    <EmptyLine>{t('Only you use this bot.')}</EmptyLine>
                  </Section>
                )}
              </>
            ) : (
              <Section title={t('Computer')}>
                <EmptyLine>
                  {t('Muse has no Grok-style cloud computer yet. This tab is a shell for future parity — nothing to show.')}
                </EmptyLine>
              </Section>
            )}
          </div>
        </div>
      )}
    </>
  )
}
