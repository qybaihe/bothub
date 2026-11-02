import { useMemo } from 'react'
import { getPlatform } from '@adapters/platforms'
import { X } from 'lucide-react'
import { AddAccountsButton } from '@/components/add-bot/AddAccountsDialog'
import { PaneHeader } from '@/components/layout/PaneHeader'
import { AccountAvatar, BotAvatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import { PlatformGlyph } from '@/components/ui/PlatformGlyph'
import { StatusBadge } from '@/components/ui/Status'
import { formatDate } from '@/lib/format'
import { getBotAccounts, getBotStatus } from '@/lib/selectors'
import { useBotStore } from '@/store/botStore'
import { AccountList } from './AccountList'
import { MemoryEditor } from './MemoryEditor'
import { DetailRow, Section } from './Section'

export function InfoPanel() {
  const bot = useBotStore((s) => s.bots.find((b) => b.id === s.selectedBotId))
  const accountMap = useBotStore((s) => s.accounts)
  const group = useBotStore((s) => s.groups.find((g) => g.id === bot?.groupId))
  const messageCount = useBotStore((s) => (bot ? (s.messages[bot.id]?.length ?? 0) : 0))
  const toggleInfoPanel = useBotStore((s) => s.toggleInfoPanel)
  const updateNotes = useBotStore((s) => s.updateNotes)

  const accounts = useMemo(() => (bot ? getBotAccounts(bot, accountMap) : []), [bot, accountMap])

  return (
    <>
      <PaneHeader className="pr-3">
        <h2 className="flex-1 text-ui font-semibold">Details</h2>
        <IconButton label="Close details" size="sm" onClick={toggleInfoPanel}>
          <X />
        </IconButton>
      </PaneHeader>

      {!bot ? (
        <p className="p-5 text-ui text-ink-muted">Select a bot to see its details.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col items-center px-5 pt-6 pb-5 text-center">
            <BotAvatar emoji={bot.emoji} seed={bot.id} size="lg" />
            <h3 className="mt-3 text-base font-semibold tracking-tight">{bot.name}</h3>
            <p className="mt-1 text-ui text-ink-muted">{bot.description}</p>
          </div>

          <Section title="Overview">
            <dl className="flex flex-col">
              <DetailRow label="Platform">
                <PlatformGlyph platform={getPlatform(bot.platformId)} />
                <span className="truncate">{getPlatform(bot.platformId).name}</span>
              </DetailRow>
              <DetailRow label="Group">
                <span className="truncate">{group?.name ?? '—'}</span>
              </DetailRow>
              <DetailRow label="Account">
                {accountMap[bot.activeAccountId] ? (
                  <>
                    <AccountAvatar name={accountMap[bot.activeAccountId]!.displayName} size="xs" />
                    <span className="truncate">{accountMap[bot.activeAccountId]!.displayName}</span>
                  </>
                ) : (
                  '—'
                )}
              </DetailRow>
              <DetailRow label="Status">
                <StatusBadge status={getBotStatus(bot, accountMap)} />
              </DetailRow>
              <DetailRow label="Created">{formatDate(bot.createdAt)}</DetailRow>
              <DetailRow label="Messages">
                <span className="tabular-nums">{messageCount}</span>
              </DetailRow>
            </dl>
          </Section>

          <Section title="Connected accounts" count={accounts.length} action={<AddAccountsButton bot={bot} />}>
            <AccountList bot={bot} accounts={accounts} />
          </Section>

          <Section title="Memory" count={bot.memory.length}>
            <MemoryEditor bot={bot} />
          </Section>

          <Section title="Notes">
            <textarea
              value={bot.notes}
              onChange={(event) => updateNotes(bot.id, event.target.value)}
              placeholder="Private notes about this bot…"
              aria-label="Notes"
              rows={4}
              className="block w-full resize-none rounded-lg border border-line bg-surface px-2.5 py-2 text-ui leading-relaxed text-ink outline-none placeholder:text-ink-muted focus:border-accent-300 focus:ring-3 focus:ring-accent-100"
            />
            <p className="mt-1.5 text-caption text-ink-faint">Stored in memory for this session.</p>
          </Section>
        </div>
      )}
    </>
  )
}
