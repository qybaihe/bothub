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
      <nav aria-label="Bots" className="flex w-[280px] shrink-0 flex-col border-r border-ink/[0.12] bg-canvas">
        {sidebar}
      </nav>

      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 overflow-hidden bg-main">
          <main className="flex min-w-0 flex-1 flex-col">{main}</main>
          <aside
            aria-label="Bot details"
            aria-hidden={!asideOpen}
            className={cn(
              'flex shrink-0 flex-col overflow-hidden border-line bg-main transition-[width] duration-200 ease-out',
              asideOpen ? 'w-[300px] border-l' : 'w-0'
            )}
          >
            <div className="flex h-full w-[300px] flex-col">{asideOpen && aside}</div>
          </aside>
        </div>
      </div>
    </div>
  )
}
