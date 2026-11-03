import { useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, useBotStore } from '@/store/botStore'

interface AppShellProps {
  sidebar: ReactNode
  main: ReactNode
  aside: ReactNode
  asideOpen: boolean
}

/**
 * Right-edge grip of the sidebar: drag to resize, double-click to reset,
 * ←/→ when focused.
 */
function SidebarGrip() {
  const width = useBotStore((s) => s.sidebarWidth)
  const setWidth = useBotStore((s) => s.setSidebarWidth)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; width: number } | null>(null)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = { x: event.clientX, width }
        setDragging(true)
      }}
      onPointerMove={(event) => {
        if (!start.current) return
        setWidth(start.current.width + event.clientX - start.current.x)
      }}
      onPointerUp={() => {
        start.current = null
        setDragging(false)
      }}
      onDoubleClick={() => setWidth(SIDEBAR_DEFAULT)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          setWidth(width + (event.key === 'ArrowRight' ? 16 : -16))
        }
      }}
      className={cn(
        'no-drag group absolute inset-y-0 -right-[3px] z-10 w-1.5 cursor-col-resize outline-none',
        dragging && 'cursor-col-resize'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-[2px] w-[2px] rounded-full bg-transparent transition-colors duration-150',
          'group-hover:bg-line-strong group-focus-visible:bg-accent-600',
          dragging && 'bg-accent-600 group-hover:bg-accent-600'
        )}
      />
    </div>
  )
}

/**
 * Three columns: the sidebar on the canvas, then the conversation and the
 * details panel on one white surface.
 */
export function AppShell({ sidebar, main, aside, asideOpen }: AppShellProps) {
  const sidebarWidth = useBotStore((s) => s.sidebarWidth)
  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas text-ink">
      <nav
        aria-label="Bots"
        style={{ width: sidebarWidth }}
        className="relative flex shrink-0 flex-col border-r border-ink/[0.12] bg-canvas"
      >
        {sidebar}
        <SidebarGrip />
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
