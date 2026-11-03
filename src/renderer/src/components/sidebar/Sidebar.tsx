import { useEffect, useState, type KeyboardEvent } from 'react'
import { Plus, RefreshCw, Search } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { getBridge, runtimePlatform } from '@/lib/bridge'
import { cn } from '@/lib/cn'
import { shortcutLabel } from '@/lib/shortcuts'
import { useBotStore } from '@/store/botStore'
import { BotList } from './BotList'

interface SidebarProps {
  onAddBot: () => void
}

function BrandMark() {
  return (
    <span className="grid size-6 place-items-center rounded-[7px] bg-ink" aria-hidden>
      <svg viewBox="0 0 16 16" className="size-3.5 text-white" fill="none">
        <rect x="2.5" y="4" width="11" height="8.5" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="6.2" cy="8.25" r="1" fill="currentColor" />
        <circle cx="9.8" cy="8.25" r="1" fill="currentColor" />
        <path d="M8 4V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  )
}

/** The brand doubles as the app menu (updates, version). */
function BrandMenu() {
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const updates = getBridge()?.updates

  useEffect(() => {
    if (!updates) return
    void updates.version().then(setVersion)
    return updates.onEvent((event) => setChecking(event.type === 'checking'))
  }, [updates])

  return (
    <Menu>
      <MenuTrigger
        className="no-drag press -ml-1 flex h-8 min-w-0 items-center gap-2 rounded-full pr-2.5 pl-1 hover:bg-hover data-[state=open]:bg-hover"
        aria-label="BotHub menu"
      >
        <BrandMark />
        <span className="truncate text-[15px] font-semibold tracking-tight text-ink">BotHub</span>
      </MenuTrigger>
      <MenuContent align="start">
        <MenuItem
          disabled={checking || !updates}
          onSelect={() => {
            setChecking(true)
            void updates?.check()
          }}
        >
          <RefreshCw className={cn(checking && 'animate-spin')} aria-hidden />
          Check for updates
        </MenuItem>
        {version ? (
          <>
            <MenuSeparator />
            <MenuItem disabled>BotHub {version}</MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  )
}

export function Sidebar({ onAddBot }: SidebarProps) {
  const openPalette = useBotStore((s) => s.openPalette)

  // Typing while the sidebar has focus starts a search.
  const typeToSearch = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    if (event.key.length !== 1 || event.key === ' ' || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea')) return
    event.preventDefault()
    openPalette(event.key)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={typeToSearch}>
      <header
        className={cn(
          'drag-region flex h-[60px] shrink-0 items-center gap-2 px-3 pt-2',
          runtimePlatform === 'darwin' && 'pl-[80px]'
        )}
      >
        <BrandMenu />
        <div className="no-drag ml-auto flex shrink-0 items-center gap-1">
          <IconButton round label="Search" shortcut={shortcutLabel('K')} onClick={() => openPalette()}>
            <Search />
          </IconButton>
          <IconButton round label="New bot" shortcut={shortcutLabel('N')} onClick={onAddBot}>
            <Plus />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-2 pt-1 pb-2">
        <BotList />
      </div>
    </div>
  )
}
