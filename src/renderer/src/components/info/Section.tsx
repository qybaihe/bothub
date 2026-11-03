import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SectionProps {
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
  /** Card surface like DeepSeek-Bot detail rows */
  card?: boolean
  className?: string
}

export function Section({ title, count, action, children, card = false, className }: SectionProps) {
  if (card) {
    return (
      <section className={cn('px-4 py-2', className)}>
        <div className="rounded-2xl border border-line bg-surface px-3.5 py-3 shadow-soft">
          <header className="mb-2 flex items-center gap-2">
            <h3 className="text-[12px] font-medium text-ink-secondary">{title}</h3>
            {count !== undefined && (
              <span className="text-[12px] text-ink-faint tabular-nums">{count}</span>
            )}
            {action && <div className="ml-auto">{action}</div>}
          </header>
          {children}
        </div>
      </section>
    )
  }

  return (
    <section className={cn('border-t border-line px-5 py-4', className)}>
      <header className="mb-2.5 flex h-6 items-center gap-1.5">
        <h3 className="text-[12px] font-medium text-ink-secondary">{title}</h3>
        {count !== undefined && <span className="text-[12px] text-ink-faint tabular-nums">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </header>
      {children}
    </section>
  )
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 text-[13px]">
      <dt className="shrink-0 text-ink-secondary">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 text-ink">{children}</dd>
    </div>
  )
}

export function KvRow({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px] leading-5 text-ink-secondary">
      <span className="min-w-0 truncate">{left}</span>
      {right !== undefined && <span className="shrink-0 text-ink tabular-nums">{right}</span>}
    </div>
  )
}
