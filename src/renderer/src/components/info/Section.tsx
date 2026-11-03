import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SectionProps {
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
  /** Rows inside run edge to edge (they pad themselves). */
  flush?: boolean
  className?: string
}

/** Section title above a flat card — the details panel's only building block. */
export function Section({ title, count, action, children, flush = false, className }: SectionProps) {
  return (
    <section className={cn('px-4 pt-5', className)}>
      <header className="mb-2 flex h-6 items-center gap-1.5 px-1">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {count !== undefined && count > 0 && <span className="text-[13px] text-ink-muted tabular-nums">{count}</span>}
        {action && <div className="ml-auto flex items-center">{action}</div>}
      </header>
      <div className={cn('overflow-hidden rounded-xl border border-line bg-surface', !flush && 'px-3 py-2.5')}>
        {children}
      </div>
    </section>
  )
}

/** One-line placeholder for an empty card. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="py-0.5 text-[13px] text-ink-muted">{children}</p>
}
