import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface AppShellProps {
  sidebar: ReactNode
  main: ReactNode
  aside: ReactNode
  asideOpen: boolean
}

/**
 * Three-column layout: the sidebar sits directly on the canvas, while the
 * conversation and info panel share one white, softly bordered surface.
 */
export function AppShell({ sidebar, main, aside, asideOpen }: AppShellProps) {
  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas text-ink">
      <nav aria-label="Bots" className="flex w-[280px] shrink-0 flex-col">
        {sidebar}
      </nav>

      <div className="flex min-w-0 flex-1 py-2 pr-2">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
          <main className="flex min-w-0 flex-1 flex-col">{main}</main>
          <aside
            aria-label="Bot details"
            aria-hidden={!asideOpen}
            className={cn(
              'flex shrink-0 flex-col overflow-hidden border-line bg-surface transition-[width] duration-200 ease-out',
              asideOpen ? 'w-[312px] border-l' : 'w-0'
            )}
          >
            <div className="flex h-full w-[312px] flex-col">{asideOpen && aside}</div>
          </aside>
        </div>
      </div>
    </div>
  )
}
