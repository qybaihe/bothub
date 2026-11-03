import { useMemo, useState } from 'react'
import { getPlatform } from '@adapters/platforms'
import { X } from 'lucide-react'
import { AddAccountsButton } from '@/components/add-bot/AddAccountsDialog'
import { PaneHeader } from '@/components/layout/PaneHeader'
import { BotAvatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import { PlatformGlyph } from '@/components/ui/PlatformGlyph'
import { cn } from '@/lib/cn'
import { getBotAccounts, getBotStatus } from '@/lib/selectors'
import { useBotStore } from '@/store/botStore'
import { AccountList } from './AccountList'
import { ApprovalsSection } from '@/components/muse/ApprovalsSection'
import { ConnectorsSection } from '@/components/muse/ConnectorsSection'
import { MemoryEditor } from './MemoryEditor'
import { KvRow, Section } from './Section'

type InfoTab = 'details' | 'browser'

export function InfoPanel() {
  const bot = useBotStore((s) => s.bots.find((b) => b.id === s.selectedBotId))
  const accountMap = useBotStore((s) => s.accounts)
  const group = useBotStore((s) => s.groups.find((g) => g.id === bot?.groupId))
  const messageCount = useBotStore((s) => (bot ? (s.messages[bot.id]?.length ?? 0) : 0))
  const toggleInfoPanel = useBotStore((s) => s.toggleInfoPanel)
  const updateNotes = useBotStore((s) => s.updateNotes)
  const [tab, setTab] = useState<InfoTab>('details')

  const accounts = useMemo(() => (bot ? getBotAccounts(bot, accountMap) : []), [bot, accountMap])
  const active = bot ? accountMap[bot.activeAccountId] : undefined
  const status = bot ? getBotStatus(bot, accountMap) : null

  return (
    <>
      <PaneHeader className="pr-3">
        <IconButton label="Close details" shortcut="⌘I" className="no-drag ml-auto" onClick={toggleInfoPanel}>
          <X />
        </IconButton>
      </PaneHeader>

      {!bot ? (
        <p className="p-5 text-ui text-ink-muted">Select a bot</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <div className="flex flex-col items-center px-5 pt-2 pb-4 text-center">
            <BotAvatar
              emoji={bot.emoji}
              seed={bot.id}
              platformId={bot.platformId}
              status={status ?? undefined}
              size="lg"
              ringClassName="ring-main"
            />
            <h3 className="mt-3 text-[17px] font-semibold tracking-tight">{bot.name}</h3>
            {bot.description ? (
              <p className="mt-0.5 max-w-[220px] text-[13px] text-ink-secondary">{bot.description}</p>
            ) : null}
          </div>

          <div
            role="tablist"
            aria-label="Details panels"
            className="mx-4 mb-2 flex justify-center gap-0.5 rounded-full bg-hover p-0.5"
          >
            {([
              ['details', 'Details'],
              ['browser', 'Browser']
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  'rounded-full px-3 py-1 text-[13px] transition-colors',
                  tab === id ? 'bg-surface text-ink shadow-soft' : 'text-ink-secondary hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'details' ? (
            <div className="animate-fade-in flex flex-col gap-1 pt-1">
              <Section title="Model" card>
                <KvRow
                  left={
                    <span className="inline-flex items-center gap-1.5">
                      <PlatformGlyph platform={getPlatform(bot.platformId)} />
                      {getPlatform(bot.platformId).name}
                    </span>
                  }
                  right={group?.name}
                />
                <p className="mt-1.5 text-[12px] text-ink-muted">
                  {active ? `Signed in as ${active.displayName}` : 'No active account'}
                </p>
              </Section>

              <Section title="Memory" card count={bot.memory.length} action={<span className="text-[12px] text-accent-600">Manage</span>}>
                <MemoryEditor bot={bot} compact />
              </Section>

              <Section title="Usage" card>
                <KvRow left={bot.name} right={`${messageCount} msg`} />
                <KvRow left="Status" right={status ?? '—'} />
              </Section>

              <Section
                title="Accounts"
                card
                count={accounts.length}
                action={<AddAccountsButton bot={bot} />}
              >
                <AccountList bot={bot} accounts={accounts} />
              </Section>

              <Section title="Notes" card>
                <textarea
                  value={bot.notes}
                  onChange={(event) => updateNotes(bot.id, event.target.value)}
                  placeholder="Private notes…"
                  aria-label="Notes"
                  rows={3}
                  className="block w-full resize-none rounded-lg border border-line bg-main px-2.5 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-muted focus:border-accent-300 focus:ring-3 focus:ring-accent-100"
                />
              </Section>
            </div>
          ) : (
            <div className="animate-fade-in flex flex-col gap-1 pt-1">
              {bot.platformId === 'meta-muse' && bot.activeAccountId ? (
                <>
                  <Section title="Approvals" card>
                    <ApprovalsSection accountId={bot.activeAccountId} />
                  </Section>
                  <Section title="Connectors" card>
                    <ConnectorsSection accountId={bot.activeAccountId} />
                  </Section>
                </>
              ) : (
                <div className="mx-4 rounded-2xl border border-dashed border-line px-4 py-10 text-center">
                  <p className="text-[13px] text-ink-secondary">No browser session for this platform yet.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
