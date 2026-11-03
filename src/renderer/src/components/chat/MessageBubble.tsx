import { memo, useEffect, useState } from 'react'
import { AlertCircle, Check, Clock3, FileText, Image as ImageIcon, Loader2, RotateCw, Wrench } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatBytes, formatClock } from '@/lib/format'
import { useBotStore } from '@/store/botStore'
import type { ChatMediaPart, ChatMessage, ChatOptionWidget, ChatRichWidget, ChatToolCall } from '@/types'
import { getBridge } from '@/lib/bridge'
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

function isHttp(path: string): boolean {
  return /^https?:\/\//i.test(path)
}

function looksLikeImage(part: ChatMediaPart): boolean {
  if (part.kind === 'image') return true
  const mime = (part.mimeType || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(part.path || part.name || '')
}

function WorkspaceImage({
  part,
  accountId
}: {
  part: ChatMediaPart
  accountId?: string
}) {
  const [src, setSrc] = useState<string | null>(isHttp(part.path) ? part.path : null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (src || failed || !accountId) return
    if (!part.path.startsWith('workspace/')) {
      setFailed(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const muse = getBridge()?.muse
        if (!muse?.previewWorkspaceFile) {
          if (!cancelled) setFailed(true)
          return
        }
        const preview = await muse.previewWorkspaceFile(accountId, part.path)
        if (cancelled) return
        if (!preview.mimeType.startsWith('image/') || !preview.dataBase64) {
          setFailed(true)
          return
        }
        setSrc(`data:${preview.mimeType};base64,${preview.dataBase64}`)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accountId, part.path, src, failed])

  if (src) {
    return (
      <a href={isHttp(part.path) ? part.path : undefined} target="_blank" rel="noreferrer" className="block">
        <img src={src} alt={part.name || part.path} className="max-h-64 max-w-full object-contain" />
      </a>
    )
  }
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 text-[12px]">
      <span className="grid size-7 place-items-center rounded-lg bg-accent-50 text-accent-600">
        <ImageIcon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block max-w-56 truncate font-medium text-ink">{part.name || part.path}</span>
        <span className="block truncate text-caption text-ink-muted" title={part.path}>
          {failed ? t('Preview unavailable') : t('Loading preview…')}
        </span>
      </span>
    </div>
  )
}

function MediaParts({ parts, accountId }: { parts: ChatMediaPart[]; accountId?: string }) {
  if (!parts.length) return null
  return (
    <ul className="mb-1.5 flex max-w-[78%] flex-col gap-1.5" aria-label={t('Media')}>
      {parts.map((part) => (
        <li
          key={part.path}
          className="overflow-hidden rounded-xl border border-line bg-surface shadow-soft"
        >
          {looksLikeImage(part) ? (
            <WorkspaceImage part={part} accountId={accountId} />
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-2 text-[12px]">
              <span className="grid size-7 place-items-center rounded-lg bg-accent-50 text-accent-600">
                <FileText className="size-4" aria-hidden />
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
      ))}
    </ul>
  )
}

function RichWidgets({ widgets }: { widgets: ChatRichWidget[] }) {
  if (!widgets.length) return null
  return (
    <ul className="mb-1.5 flex max-w-[85%] flex-col gap-2" aria-label={t('Widgets')}>
      {widgets.map((w) => {
        if (w.kind === 'shopping_results' || w.kind === 'shopping_results_v2') {
          return (
            <li key={w.widgetId} className="rounded-xl border border-line bg-surface p-2.5 shadow-soft">
              <p className="mb-1.5 text-[12px] font-medium text-ink-secondary">{t('Shopping results')}</p>
              <ul className="flex flex-col gap-1.5">
                {w.products.slice(0, 8).map((p, i) => (
                  <li key={`${p.name}-${i}`} className="flex gap-2 text-[12px]">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="size-10 rounded-md object-cover" />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{p.name}</span>
                      <span className="block text-ink-muted">
                        {[p.price, p.retailer].filter(Boolean).join(' · ')}
                      </span>
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent-600 underline-offset-2 hover:underline"
                        >
                          {t('Open link')}
                        </a>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-ink-muted">{t('Read-only — checkout not available in BotHub')}</p>
            </li>
          )
        }
        if (w.kind === 'shopping_cart') {
          return (
            <li key={w.widgetId} className="rounded-xl border border-line bg-surface p-2.5 shadow-soft">
              <p className="mb-1 text-[12px] font-medium text-ink-secondary">
                {t('Shopping cart')}
                {w.retailerName ? ` · ${w.retailerName}` : ''}
              </p>
              <ul className="flex flex-col gap-1 text-[12px]">
                {w.items.slice(0, 12).map((it) => (
                  <li key={it.id} className="flex justify-between gap-2">
                    <span className="truncate text-ink">
                      {it.name} × {it.quantity}
                    </span>
                    {it.linePrice ? <span className="shrink-0 text-ink-muted">{it.linePrice}</span> : null}
                  </li>
                ))}
              </ul>
              {w.subtotal ? (
                <p className="mt-1 text-[12px] font-medium text-ink">
                  {t('Subtotal')}: {w.subtotal}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] text-ink-muted">{t('Read-only — checkout not available in BotHub')}</p>
            </li>
          )
        }
        if (w.kind === 'local_map') {
          return (
            <li key={w.widgetId} className="rounded-xl border border-line bg-surface p-2.5 shadow-soft">
              <p className="mb-1 text-[12px] font-medium text-ink-secondary">{t('Map')}</p>
              {w.places.length ? (
                <ul className="mb-1.5 flex flex-col gap-1 text-[12px]">
                  {w.places.slice(0, 12).map((pl) => (
                    <li key={pl.id}>
                      <span className="font-medium text-ink">{pl.name}</span>
                      <span className="text-ink-muted">
                        {' '}
                        ({pl.latitude.toFixed(4)}, {pl.longitude.toFixed(4)})
                        {pl.category ? ` · ${pl.category}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {w.html ? (
                <iframe
                  title={t('Map')}
                  sandbox=""
                  srcDoc={w.html}
                  className="h-40 w-full rounded-lg border border-line bg-white"
                />
              ) : null}
            </li>
          )
        }
        if (w.kind === 'marketplace_map') {
          return (
            <li key={w.widgetId} className="rounded-xl border border-line bg-surface p-2.5 shadow-soft">
              <p className="mb-1.5 text-[12px] font-medium text-ink-secondary">{t('Marketplace map')}</p>
              <ul className="flex flex-col gap-1.5 text-[12px]">
                {w.listings.slice(0, 12).map((l) => (
                  <li key={l.id} className="flex gap-2">
                    {l.imageUrl ? (
                      <img src={l.imageUrl} alt="" className="size-10 rounded-md object-cover" />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{l.name}</span>
                      <span className="block text-ink-muted">
                        {[l.price, l.latitude != null ? `${l.latitude.toFixed(3)}, ${l.longitude?.toFixed(3)}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {l.url ? (
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent-600 underline-offset-2 hover:underline"
                        >
                          {t('Open link')}
                        </a>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-ink-muted">{t('Read-only — checkout not available in BotHub')}</p>
            </li>
          )
        }
        if (w.kind === 'html') {
          return (
            <li key={w.widgetId} className="overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
              <p className="border-b border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-secondary">
                {t('HTML widget')}
                {w.downloadable ? ` · ${t('Downloadable')}` : ''}
              </p>
              <iframe
                title={t('HTML widget')}
                sandbox=""
                srcDoc={w.html}
                className="h-48 w-full bg-white"
              />
            </li>
          )
        }
        if (w.kind === 'slides') {
          return (
            <li key={w.widgetId} className="rounded-xl border border-line bg-surface px-2.5 py-2 shadow-soft">
              <p className="text-[13px] font-medium text-ink">{w.label}</p>
              <p className="text-[12px] text-ink-muted">
                {t('Slides')} · {w.slug}
                {w.path ? ` · ${w.path}` : ''}
              </p>
            </li>
          )
        }
        return null
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
  const rich = (!mine && message.richWidgets) || []

  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {!mine && tools.length > 0 && <ToolChips tools={tools} />}
      {!mine && rich.length > 0 && <RichWidgets widgets={rich} />}
      {!mine && media.length > 0 && <MediaParts parts={media} accountId={message.accountId} />}
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
