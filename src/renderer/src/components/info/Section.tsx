import type { ReactNode } from 'react'

interface SectionProps {
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
}

export function Section({ title, count, action, children }: SectionProps) {
  return (
    <section className="border-t border-line px-5 py-4">
      <header className="mb-2.5 flex h-6 items-center gap-1.5">
        <h3 className="text-caption font-semibold tracking-wide text-ink-muted uppercase">{title}</h3>
        {count !== undefined && <span className="text-caption font-medium text-ink-faint tabular-nums">{count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </header>
      {children}
    </section>
  )
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-3 text-ui">
      <dt className="w-20 shrink-0 text-ink-muted">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1.5 text-ink">{children}</dd>
    </div>
  )
}
