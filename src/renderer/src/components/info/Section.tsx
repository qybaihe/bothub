import { createContext, useContext, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Default open state for Sections below; rarely used panes wrap themselves in `<SectionsCollapsed>`. */
const DefaultOpen = createContext(true)

export function SectionsCollapsed({ children }: { children: ReactNode }) {
  return <DefaultOpen.Provider value={false}>{children}</DefaultOpen.Provider>
}

const STORE_KEY = 'bothub.info.sections'

function readOpen(title: string, fallback: boolean): boolean {
  try {
    const map = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Record<string, boolean>
    return typeof map[title] === 'boolean' ? map[title]! : fallback
  } catch {
    return fallback
  }
}

function writeOpen(title: string, open: boolean) {
  try {
    const map = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Record<string, boolean>
    map[title] = open
    localStorage.setItem(STORE_KEY, JSON.stringify(map))
  } catch {
    /* storage unavailable: state stays in memory */
  }
}

interface SectionProps {
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
  /** Rows inside run edge to edge (they pad themselves). */
  flush?: boolean
  className?: string
  /** Override the inherited default open state. */
  defaultOpen?: boolean
}

/** Collapsible titled card — the details panel's only building block. Open state persists per title. */
export function Section({ title, count, action, children, flush = false, className, defaultOpen }: SectionProps) {
  const inherited = useContext(DefaultOpen)
  const [open, setOpen] = useState(() => readOpen(title, defaultOpen ?? inherited))
  return (
    <section className={cn('px-3 pt-3', className)}>
      <header className="group flex h-7 items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-hover/60">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open)
            writeOpen(title, !open)
          }}
          className="flex h-full min-w-0 flex-1 items-center gap-1 rounded-lg pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
        >
          <ChevronRight
            aria-hidden
            className={cn('size-3.5 shrink-0 text-ink-muted transition-transform duration-150', open && 'rotate-90')}
          />
          <h3 className="truncate text-[12.5px] font-semibold text-ink">{title}</h3>
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-hover px-1.5 text-[11px] leading-4 text-ink-secondary tabular-nums">{count}</span>
          )}
        </button>
        {action && open && <div className="flex shrink-0 items-center">{action}</div>}
      </header>
      {open && (
        <div className={cn('mt-1 overflow-hidden rounded-xl border border-line bg-surface', !flush && 'px-3 py-2')}>
          {children}
        </div>
      )}
    </section>
  )
}

/** One-line placeholder for an empty card. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-0.5 text-[13px] text-ink-muted">{children}</p>
}
