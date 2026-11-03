import { useEffect, useMemo, useState } from 'react'
import { MoreHorizontal, Plus, RefreshCw, Search, X } from 'lucide-react'
import { BotAvatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { getBridge, runtimePlatform } from '@/lib/bridge'
import { cn } from '@/lib/cn'
import { getBotStatus, lastMessage } from '@/lib/selectors'
import { useBotStore } from '@/store/botStore'
import { BotList } from './BotList'
import { SearchField } from './SearchField'

interface SidebarProps {
  onAddBot: () => void
}

function BrandMark() {
  return (
    <span className="grid size-7 place-items-center rounded-[8px] bg-ink shadow-soft" aria-hidden>
      <svg viewBox="0 0 16 16" className="size-3.5 text-white" fill="none">
        <rect x="2.5" y="4" width="11" height="8.5" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="6.2" cy="8.25" r="1" fill="currentColor" />
        <circle cx="9.8" cy="8.25" r="1" fill="currentColor" />
        <path d="M8 4V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export function Sidebar({ onAddBot }: SidebarProps) {
  const search = useBotStore((s) => s.search)
  const setSearch = useBotStore((s) => s.setSearch)
  const bots = useBotStore((s) => s.bots)
  const accounts = useBotStore((s) => s.accounts)
  const messages = useBotStore((s) => s.messages)
  const selectedBotId = useBotStore((s) => s.selectedBotId)
  const selectBot = useBotStore((s) => s.selectBot)
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge?.updates) return
    void bridge.updates.version().then(setVersion)
    return bridge.updates.onEvent((event) => {
      if (event.type === 'checking') setChecking(true)
      else setChecking(false)
    })
  }, [])

  useEffect(() => {
    if (search.trim()) setSearchOpen(true)
  }, [search])

  const featured = useMemo(() => {
    if (bots.length === 0) return null
    return bots.find((b) => b.id === selectedBotId) ?? bots[0]!
  }, [bots, selectedBotId])

  const featuredStatus = featured ? getBotStatus(featured, accounts) : null
  const featuredLast = featured ? lastMessage(messages[featured.id]) : undefined

  return (
    <>
      <header
        className={cn(
          'drag-region flex h-[60px] shrink-0 items-center gap-1.5 px-3 pt-2',
          runtimePlatform === 'darwin' && 'pl-[78px]'
        )}
      >
        <BrandMark />
        <span className="mr-auto text-sm font-semibold tracking-tight">BotHub</span>
        <div className="no-drag flex items-center gap-0.5">
          <IconButton
            round
            label="Search"
            active={searchOpen}
            onClick={() => {
              setSearchOpen((v) => {
                if (v) setSearch('')
                return !v
              })
            }}
          >
            {searchOpen ? <X /> : <Search />}
          </IconButton>
          <IconButton round label="Add bot" onClick={onAddBot}>
            <Plus />
          </IconButton>
          <Menu>
            <MenuTrigger asChild>
              <IconButton round label="App menu">
                <MoreHorizontal />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem
                disabled={checking || !getBridge()?.updates}
                onSelect={() => {
                  setChecking(true)
                  void getBridge()?.updates.check()
                }}
              >
                <RefreshCw className={cn('size-4', checking && 'animate-spin')} aria-hidden />
                Check for updates
              </MenuItem>
              {version ? (
                <>
                  <MenuSeparator />
                  <MenuItem disabled>Version {version}</MenuItem>
                </>
              ) : null}
            </MenuContent>
          </Menu>
        </div>
      </header>

      {searchOpen && (
        <div className="no-drag px-3 pb-2 animate-fade-in">
          <SearchField
            value={search}
            onChange={setSearch}
            autoFocus
            onEscape={() => {
              setSearch('')
              setSearchOpen(false)
            }}
          />
        </div>
      )}

      {featured && !searchOpen && (
        <div className="no-drag px-3 pb-2">
          <button
            type="button"
            onClick={() => selectBot(featured.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl bg-hover px-3 py-3 text-left transition-[background-color,transform] duration-150',
              'hover:bg-active active:scale-[0.99]',
              selectedBotId === featured.id && 'ring-1 ring-line-strong'
            )}
          >
            <BotAvatar
              emoji={featured.emoji}
              seed={featured.id}
              platformId={featured.platformId}
              status={featuredStatus ?? undefined}
              size="xl"
              ringClassName="ring-transparent"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold tracking-tight text-ink">
                {featured.name}
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-ink-secondary">
                {featured.description ||
                  (featuredLast
                    ? featuredLast.text.replace(/\s+/g, ' ').trim().slice(0, 48)
                    : 'Ready')}
              </span>
            </span>
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <BotList />
      </div>
    </>
  )
}
