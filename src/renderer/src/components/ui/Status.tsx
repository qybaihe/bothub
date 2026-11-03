import type { ConnectionStatus } from '@adapters/types'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'

export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  online: t('Idle'),
  busy: t('Running'),
  attention: t('Action required'),
  offline: t('Offline'),
  error: t('Error')
}

const DOT: Record<ConnectionStatus, string> = {
  online: 'bg-status-online',
  busy: 'bg-status-busy',
  attention: 'bg-status-attention',
  offline: 'bg-status-offline',
  error: 'bg-status-error'
}

const BADGE: Record<ConnectionStatus, string> = {
  online: 'bg-status-online/10 text-status-online-ink',
  busy: 'bg-status-busy/12 text-status-busy-ink',
  attention: 'bg-status-attention/12 text-status-attention-ink',
  offline: 'bg-sunken text-status-offline-ink',
  error: 'bg-status-error/10 text-status-error-ink'
}

interface StatusDotProps {
  status: ConnectionStatus
  className?: string
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      className={cn('inline-block size-2 shrink-0 rounded-full', DOT[status], className)}
    />
  )
}

interface StatusBadgeProps {
  status: ConnectionStatus
  label?: string
  className?: string
}

/** Pill with dot + label, e.g. "● Online". */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-caption font-medium',
        BADGE[status],
        className
      )}
    >
      <span className={cn('size-1.5 rounded-full', DOT[status], (status === 'busy' || status === 'attention') && 'animate-pulse')} />
      {label ?? STATUS_LABEL[status]}
    </span>
  )
}
