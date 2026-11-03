import { useEffect, useState } from 'react'
import { MoreHorizontal, Plus, RefreshCw, Search, X } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { getBridge, runtimePlatform } from '@/lib/bridge'
import { cn } from '@/lib/cn'
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

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <BotList />
      </div>
    </>
  )
}
