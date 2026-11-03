import { memo, useState } from 'react'
import { AlertCircle, Check, Clock3, FileText, Image as ImageIcon, Loader2, RotateCw, Wrench } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatBytes, formatClock } from '@/lib/format'
import { useBotStore } from '@/store/botStore'
import type { ChatMediaPart, ChatMessage, ChatOptionWidget, ChatToolCall } from '@/types'
import { MarkdownText } from './MarkdownText'
import { t } from '@/lib/i18n'

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
          {message.error ?? t('Not sent')}
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
      return <Check className="size-3" aria-label={t('Sent')} />
    default:
      return null
  }
}

function ToolChips({ tools }: { tools: ChatToolCall[] }) {
  if (!tools.length) return null
  return (
    <ul className="mb-1.5 flex max-w-[78%] flex-col gap-1" aria-label={t('Tools')}>
      {tools.map((tool) => (
        <li
          key={tool.id}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink-secondary shadow-soft"
        >
          {tool.status === 'running' ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-accent-600" aria-hidden />
          ) : (
            <Wrench className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate font-medium text-ink">{tool.name}</span>
          {tool.toolType && tool.toolType !== tool.name && (
            <span className="shrink-0 text-ink-muted">{tool.toolType}</span>
          )}
          <span className="shrink-0 tabular-nums text-ink-muted">
            {tool.status === 'running'
              ? t('Running')
              : tool.status === 'errored'
                ? t('Failed')
                : t('Done')}
          </span>
        </li>
      ))}
      {tools.some((t) => t.summary) && (
        <li className="px-1 text-[11px] text-ink-muted">
          {tools
            .filter((t) => t.summary)
            .map((tool) => tool.summary)
            .join(' · ')}
        </li>
      )}
    </ul>
  )
}

function MediaParts({ parts }: { parts: ChatMediaPart[] }) {
  if (!parts.length) return null
  return (
    <ul className="mb-1.5 flex max-w-[78%] flex-col gap-1.5" aria-label={t('Media')}>
      {parts.map((part) => {
        const http = /^https?:\/\//i.test(part.path)
        return (
          <li
            key={part.path}
            className="overflow-hidden rounded-xl border border-line bg-surface shadow-soft"
          >
            {part.kind === 'image' && http ? (
              <a href={part.path} target="_blank" rel="noreferrer" className="block">
                <img src={part.path} alt={part.name || part.path} className="max-h-64 max-w-full object-contain" />
              </a>
            ) : (
              <div className="flex items-center gap-2 px-2.5 py-2 text-[12px]">
                <span className="grid size-7 place-items-center rounded-lg bg-accent-50 text-accent-600">
                  {part.kind === 'image' ? (
                    <ImageIcon className="size-4" aria-hidden />
                  ) : (
                    <FileText className="size-4" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-56 truncate font-medium text-ink">{part.name || part.path}</span>
                  <span className="block truncate text-caption text-ink-muted" title={part.path}>
                    {part.path}
                  </span>
                </span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function OptionChips({ message, widget }: { message: ChatMessage; widget: ChatOptionWidget }) {
  const selectChatOption = useBotStore((s) => s.selectChatOption)
  const [customOpen, setCustomOpen] = useState(false)
  const [customText, setCustomText] = useState('')
  const selected = widget.selectedText
  const filled = widget.buttonStyle === 'center_aligned_filled'
  const disabled = Boolean(selected)

  const pick = (text: string, index: number) => {
    if (disabled) return
    void selectChatOption(message.botId, message.id, widget.widgetId, text, index)
  }

  return (
    <div className="mt-2 flex max-w-[78%] flex-col gap-2" data-muse-option-widget={widget.widgetId}>
      <div className="flex flex-wrap gap-1.5">
        {widget.options.map((opt, index) => {
          const isSel = selected === opt
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled && !isSel}
              onClick={() => pick(opt, index)}
              className={cn(
                'rounded-full px-3 py-1.5 text-[13px] transition-colors',
                filled
                  ? 'bg-accent-600 text-white hover:bg-accent-600/90'
                  : 'border border-dashed border-line-strong bg-surface text-ink hover:bg-hover',
                isSel && 'ring-2 ring-accent-600',
                disabled && !isSel && 'opacity-50'
              )}
            >
              {isSel ? `✓ ${opt}` : opt}
            </button>
          )
        })}
        {widget.customInputPlaceholder && !selected && (
          <button
            type="button"
            onClick={() => setCustomOpen((v) => !v)}
            className="rounded-full border border-dashed border-line-strong bg-surface px-3 py-1.5 text-[13px] text-ink-secondary hover:bg-hover"
          >
            自定义…
          </button>
        )}
      </div>
      {customOpen && !selected && (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            const text = customText.trim()
            if (!text) return
            pick(text, -1)
          }}
        >
          <input
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder={widget.customInputPlaceholder || '输入名字'}
            className="min-w-0 flex-1 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] outline-none focus:border-accent"
            autoFocus
          />
          <button
            type="submit"
            className="rounded-full bg-accent-600 px-3 py-1.5 text-[13px] text-white"
          >
            发送
          </button>
        </form>
      )}
    </div>
  )
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isFirstInRun: _isFirstInRun,
  isLastInRun,
  accountLabel,
  onRetry
}: MessageBubbleProps) {
  const mine = message.role === 'user'
  const optionWidgets = (!mine && message.widgets?.filter((w) => w.kind === 'option')) || []
  const tools = (!mine && message.tools) || []
  const media = (!mine && message.media) || []

  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {!mine && tools.length > 0 && <ToolChips tools={tools} />}
      {!mine && media.length > 0 && <MediaParts parts={media} />}
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
            'max-w-[78%] rounded-[18px] px-3.5 py-2 text-[14px] leading-6',
            mine ? 'bg-bubble-user text-canvas whitespace-pre-wrap break-words' : 'bg-bubble text-ink',
            message.delivery === 'sending' && 'opacity-70',
            message.delivery === 'failed' && 'bg-status-error/10 text-ink ring-1 ring-status-error/30'
          )}
        >
          {mine ? message.text : <MarkdownText text={message.text} />}
        </div>
      )}

      {optionWidgets.map((w) => (
        <OptionChips key={w.widgetId || w.options.join('|')} message={message} widget={w} />
      ))}

      {(isLastInRun || message.delivery === 'failed') && (
        <div
          className={cn(
            'mt-1 flex h-4 items-center gap-1.5 px-2 text-[11px] text-ink-muted transition-opacity duration-150',
            // Time and delivery stay out of the way until the message is hovered.
            message.delivery === 'failed' || message.delivery === 'sending'
              ? 'opacity-100'
              : 'opacity-0 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100'
          )}
        >
          {accountLabel && <span className="text-ink-secondary">{accountLabel}</span>}
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
