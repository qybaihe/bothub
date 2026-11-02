import { memo } from 'react'
import { AlertCircle, Check, Clock3, FileText, RotateCw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatBytes, formatClock } from '@/lib/format'
import type { ChatMessage } from '@/types'

interface MessageBubbleProps {
  message: ChatMessage
  /** First bubble of a run from the same sender (gets the tail corner). */
  isFirstInRun: boolean
  /** Last bubble of a run (shows the meta line). */
  isLastInRun: boolean
  /** Shown in the meta line when a bot has several accounts. */
  accountLabel?: string
  onRetry?: (messageId: string) => void
}

function DeliveryState({ message, onRetry }: Pick<MessageBubbleProps, 'message' | 'onRetry'>) {
  switch (message.delivery) {
    case 'sending':
      return (
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3" aria-hidden /> Sending
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 text-status-error-ink">
          <AlertCircle className="size-3" aria-hidden />
          {message.error ?? 'Not sent'}
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              className="inline-flex items-center gap-1 rounded px-1 font-medium underline-offset-2 hover:underline"
            >
              <RotateCw className="size-3" aria-hidden /> Retry
            </button>
          )}
        </span>
      )
    case 'sent':
      return <Check className="size-3" aria-label="Sent" />
    default:
      return null
  }
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isFirstInRun,
  isLastInRun,
  accountLabel,
  onRetry
}: MessageBubbleProps) {
  const mine = message.role === 'user'

  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {message.attachments && message.attachments.length > 0 && (
        <ul className={cn('mb-1 flex max-w-[78%] flex-wrap gap-1.5', mine && 'justify-end')}>
          {message.attachments.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface py-1.5 pr-3 pl-2 shadow-soft"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-accent-50 text-accent-600">
                <FileText className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block max-w-48 truncate text-ui font-medium">{file.name}</span>
                <span className="block text-caption text-ink-muted">{formatBytes(file.size)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {message.text && (
        <div
          className={cn(
            'max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-[1.55] break-words whitespace-pre-wrap',
            mine ? 'bg-accent-600 text-white' : 'bg-sunken text-ink',
            mine && isFirstInRun && 'rounded-tr-md',
            !mine && isFirstInRun && 'rounded-tl-md',
            message.delivery === 'sending' && 'opacity-70',
            message.delivery === 'failed' && 'bg-status-error/10 text-ink ring-1 ring-status-error/30'
          )}
        >
          {message.text}
        </div>
      )}

      {(isLastInRun || message.delivery === 'failed') && (
        <div className="mt-1 flex items-center gap-1.5 px-1 text-caption text-ink-muted">
          {accountLabel && <span className="font-medium text-ink-secondary">{accountLabel}</span>}
          {accountLabel && <span aria-hidden>·</span>}
          <time dateTime={new Date(message.createdAt).toISOString()} className="tabular-nums">
            {formatClock(message.createdAt)}
          </time>
          {mine && <DeliveryState message={message} onRetry={onRetry} />}
        </div>
      )}
    </div>
  )
})
