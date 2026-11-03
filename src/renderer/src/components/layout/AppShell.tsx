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
          {/* Only the panel's edge moves (shape spring); its content keeps
              the final width so nothing inside reflows mid-animation. */}
          <aside
            aria-label="Bot details"
            aria-hidden={!asideOpen}
            inert={!asideOpen}
            className={cn(
              'flex shrink-0 flex-col overflow-hidden border-line bg-main transition-[width] duration-[420ms] ease-spring-shape motion-reduce:transition-none',
              asideOpen ? 'w-[300px] border-l' : 'w-0'
            )}
          >
            <div
              className={cn(
                'flex h-full w-[300px] flex-col transition-opacity duration-200',
                asideOpen ? 'opacity-100' : 'opacity-0'
              )}
            >
              {aside}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
