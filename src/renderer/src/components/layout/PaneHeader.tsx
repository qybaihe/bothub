import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface PaneHeaderProps {
  children: ReactNode
  className?: string
}

/**
 * Fixed-height header used by every column. Doubles as the window drag
 * region in Electron (interactive children opt out via `no-drag`).
 */
export function PaneHeader({ children, className }: PaneHeaderProps) {
  return (
    <header
      className={cn(
        'drag-region flex h-[52px] shrink-0 items-center gap-3 px-4',
        className
      )}
    >
      {children}
    </header>
  )
}
