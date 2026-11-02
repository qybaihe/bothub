import { useMemo } from 'react'
import type { ConnectionStatus } from '@adapters/types'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { StatusDot } from '@/components/ui/Status'
import { runtimePlatform } from '@/lib/bridge'
import { cn } from '@/lib/cn'
import { getBotStatus } from '@/lib/selectors'
import { useBotStore } from '@/store/botStore'
import { BotList } from './BotList'
import { SearchField } from './SearchField'

interface SidebarProps {
  onAddBot: () => void
}

function BrandMark() {
  return (
    <span className="grid size-6 place-items-center rounded-[7px] bg-accent-600 shadow-soft" aria-hidden>
      <svg viewBox="0 0 16 16" className="size-3.5 text-white" fill="none">
        <rect x="2.5" y="4" width="11" height="8.5" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="6.2" cy="8.25" r="1" fill="currentColor" />
        <circle cx="9.8" cy="8.25" r="1" fill="currentColor" />
        <path d="M8 4V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  )
}

const SUMMARY_ORDER: ConnectionStatus[] = ['online', 'busy', 'error', 'offline']

export function Sidebar({ onAddBot }: SidebarProps) {
  const search = useBotStore((s) => s.search)
  const setSearch = useBotStore((s) => s.setSearch)
  const bots = useBotStore((s) => s.bots)
  const accounts = useBotStore((s) => s.accounts)

  const summary = useMemo(() => {
    const counts: Record<ConnectionStatus, number> = { online: 0, busy: 0, attention: 0, offline: 0, error: 0 }
    for (const bot of bots) counts[getBotStatus(bot, accounts)]++
    return SUMMARY_ORDER.filter((status) => counts[status] > 0).map((status) => ({ status, count: counts[status] }))
  }, [bots, accounts])

  return (
    <>
      <header
        className={cn(
          'drag-region flex h-[60px] shrink-0 items-center gap-2 px-4 pt-2',
          runtimePlatform === 'darwin' && 'pl-[84px]'
        )}
      >
        <BrandMark />
        <span className="text-sm font-semibold tracking-tight">BotHub</span>
      </header>

      <div className="px-3 pt-1 pb-3">
        <SearchField value={search} onChange={setSearch} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <BotList />
      </div>

      <footer className="flex flex-col gap-2.5 border-t border-line px-3 pt-3 pb-3">
        <Button variant="secondary" size="lg" className="w-full" onClick={onAddBot}>
          <Plus className="text-accent-600" aria-hidden />
          Add bot
        </Button>
        <p className="flex items-center justify-center gap-3 text-caption text-ink-muted" aria-label="Bot status summary">
          {summary.map(({ status, count }) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <StatusDot status={status} className="size-1.5" />
              {count} {status}
            </span>
          ))}
        </p>
      </footer>
    </>
  )
}
