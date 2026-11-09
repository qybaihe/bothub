import { memo, useEffect, useState } from 'react'
import { AlertCircle, Check, Clock3, Copy, Download, ExternalLink, FileText, Image as ImageIcon, Loader2, Maximize2, RotateCw, Wrench } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatBytes, formatClock } from '@/lib/format'
import { useBotStore } from '@/store/botStore'
import type { ChatMediaPart, ChatMessage, ChatOptionWidget, ChatRichWidget, ChatToolCall } from '@/types'
import { getBridge } from '@/lib/bridge'
import { ConnectorIcon } from '@/components/ui/ConnectorIcon'
import { MarkdownText } from './MarkdownText'
import { NativeDocumentDialog, type NativeDocumentTarget } from './NativeDocumentDialog'
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
    case 'accepted':
      return (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="size-3 animate-spin" aria-hidden /> 已送达 · 回复中
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
    case 'no-reply':
      // Delivered: resending would post the message a second time, so say so.
      return (
        <span className="inline-flex items-center gap-1.5 text-status-attention-ink">
          <AlertCircle className="size-3" aria-hidden />
          {message.error ?? '已送达，但没有收到回复'}
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              title="会再发送一次同样的内容"
              className="inline-flex items-center gap-1 rounded px-1 font-medium underline-offset-2 hover:underline"
            >
              <RotateCw className="size-3" aria-hidden /> 再发一次
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

function looksLikeAudio(part: ChatMediaPart): boolean {
  const mime = (part.mimeType || '').toLowerCase()
  if (mime.startsWith('audio/')) return true
  return /\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i.test(part.path || part.name || '')
}

function looksLikeVideo(part: ChatMediaPart): boolean {
  const mime = (part.mimeType || '').toLowerCase()
  if (mime.startsWith('video/')) return true
  return /\.(mp4|m4v|webm|mov|mkv)$/i.test(part.path || part.name || '')
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

function WorkspaceAV({
  part,
  accountId,
  kind
}: {
  part: ChatMediaPart
  accountId?: string
  kind: 'audio' | 'video'
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
    let objectUrl: string | null = null
    void (async () => {
      try {
        const muse = getBridge()?.muse
        if (!muse?.previewWorkspaceFile) {
          if (!cancelled) setFailed(true)
          return
        }
        const preview = await muse.previewWorkspaceFile(accountId, part.path)
        if (cancelled) return
        const mt = (preview.mimeType || part.mimeType || '').toLowerCase()
        const ok =
          kind === 'audio'
            ? mt.startsWith('audio/') || looksLikeAudio(part)
            : mt.startsWith('video/') || looksLikeVideo(part)
        if (!preview.dataBase64 || !ok) {
          setFailed(true)
          return
        }
        const bin = atob(preview.dataBase64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const blob = new Blob([bytes], { type: preview.mimeType || (kind === 'audio' ? 'audio/*' : 'video/*') })
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [accountId, part, src, failed, kind])

  if (src) {
    return (
      <div className="px-2.5 py-2">
        <p className="mb-1 max-w-56 truncate text-[12px] font-medium text-ink">{part.name || part.path}</p>
        {kind === 'audio' ? (
          <audio controls preload="metadata" src={src} className="w-full max-w-md" />
        ) : (
          <video controls preload="metadata" src={src} className="max-h-64 w-full max-w-md rounded-lg bg-black" />
        )}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 text-[12px]">
      <span className="grid size-7 place-items-center rounded-lg bg-accent-50 text-accent-600">
        <FileText className="size-4" aria-hidden />
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

function MediaParts({
  parts,
  accountId,
  onOpenDoc
}: {
  parts: ChatMediaPart[]
  accountId?: string
  onOpenDoc?: (target: NativeDocumentTarget) => void
}) {
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null)
  if (!parts.length) return null

  const handleDirectDownload = async (part: ChatMediaPart) => {
    if (!accountId) return
    const key = part.path || part.name || ''
    setDownloadingKey(key)
    try {
      const bridge = getBridge()
      const rawPath = (part.path || '').trim()
      const isHttpUrl = /^https?:\/\//i.test(rawPath)
      const isHarkFile = /^(harkatt:\/\/|harkfile:\/\/)/i.test(rawPath) || /hark\.com|hark\.ai/i.test(rawPath)
      const isDotFile =
        !isHarkFile &&
        (isHttpUrl || /^(CalpicoFile_|file_|libfile_|sediment:\/\/|dotfile:\/\/|dotatt:\/\/)/i.test(rawPath))

      let dataBase64 = ''
      let mimeType = part.mimeType || 'application/octet-stream'
      let filename = part.name || (!isHttpUrl ? rawPath.split('/').pop() : undefined) || 'attachment'

      if (isHarkFile && bridge?.hark?.rpc) {
        const cleanRef = rawPath.replace(/^(harkatt|harkfile):\/\//i, '')
        const res = await bridge.hark.rpc({
          accountId,
          op: 'downloadArtifact',
          url: /^https?:\/\//i.test(cleanRef) ? cleanRef : undefined,
          fileId: !/^https?:\/\//i.test(cleanRef) ? cleanRef : undefined,
          name: part.name
        })
        if (res.ok && res.data && typeof res.data === 'object') {
          const d = res.data as { dataBase64: string; mimeType: string; filename?: string; name?: string }
          dataBase64 = d.dataBase64
          mimeType = d.mimeType || mimeType
          filename = d.filename || d.name || filename
        }
      } else if (isDotFile && bridge?.dot?.rpc) {
        const res = await bridge.dot.rpc({
          accountId,
          op: 'downloadFile',
          url: isHttpUrl ? rawPath : undefined,
          fileId: !isHttpUrl ? rawPath.replace(/^(sediment|dotfile|dotatt):\/\//i, '') : undefined,
          name: part.name
        })
        if (res.ok && res.data && typeof res.data === 'object') {
          const d = res.data as { dataBase64: string; mimeType: string; filename?: string; name?: string }
          dataBase64 = d.dataBase64
          mimeType = d.mimeType || mimeType
          filename = d.filename || d.name || filename
        }
      } else if (bridge?.muse?.previewWorkspaceFile && rawPath.startsWith('workspace/')) {
        const res = await bridge.muse.previewWorkspaceFile(accountId, rawPath)
        dataBase64 = res.dataBase64
        mimeType = res.mimeType || mimeType
      }

      if (dataBase64) {
        const bin = atob(dataBase64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const blob = new Blob([bytes], { type: mimeType })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
      } else if (isHttpUrl) {
        window.open(rawPath, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setDownloadingKey(null)
    }
  }

  return (
    <ul className="mb-1.5 flex max-w-[78%] flex-col gap-1.5" aria-label={t('Media')}>
      {parts.map((part) => {
        const isHttpUrl = isHttp(part.path)
        const subtitle = isHttpUrl
          ? part.mimeType || '可预览 / 下载文件'
          : part.path
        const key = part.path || part.name || 'part'
        return (
          <li
            key={key}
            className="overflow-hidden rounded-xl border border-line bg-surface shadow-soft"
          >
            {looksLikeImage(part) ? (
              <WorkspaceImage part={part} accountId={accountId} />
            ) : looksLikeAudio(part) ? (
              <WorkspaceAV part={part} accountId={accountId} kind="audio" />
            ) : looksLikeVideo(part) ? (
              <WorkspaceAV part={part} accountId={accountId} kind="video" />
            ) : (
              <div className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px]">
                <button
                  type="button"
                  onClick={() => {
                    if (accountId && onOpenDoc) {
                      onOpenDoc({
                        accountId,
                        title: part.name || (!isHttpUrl ? part.path.split('/').pop() : undefined) || 'Document',
                        path: part.path,
                        mimeType: part.mimeType
                      })
                    }
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-85"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-50 text-accent-600">
                    <FileText className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-56 truncate font-medium text-ink">
                      {part.name || part.path}
                    </span>
                    <span className="block truncate text-caption text-ink-muted" title={subtitle}>
                      {subtitle}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (accountId && onOpenDoc) {
                        onOpenDoc({
                          accountId,
                          title: part.name || (!isHttpUrl ? part.path.split('/').pop() : undefined) || 'Document',
                          path: part.path,
                          mimeType: part.mimeType
                        })
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-full bg-hover px-2 py-0.5 text-[11px] font-medium text-accent-600 hover:bg-active"
                  >
                    <Maximize2 className="size-3" /> 预览
                  </button>
                  <button
                    type="button"
                    disabled={downloadingKey === key}
                    onClick={() => void handleDirectDownload(part)}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-600 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                  >
                    <Download className="size-3" /> {downloadingKey === key ? '下载中…' : '下载'}
                  </button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function RichWidgets({
  widgets,
  botId,
  accountId,
  onOpenDoc
}: {
  widgets: ChatRichWidget[]
  botId: string
  accountId: string
  onOpenDoc: (target: NativeDocumentTarget) => void
}) {
  const sendMessage = useBotStore((s) => s.sendMessage)
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
              <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5 text-[12px]">
                <span className="font-medium text-ink-secondary">
                  {t('HTML widget')}
                  {w.downloadable ? ` · ${t('Downloadable')}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onOpenDoc({
                      accountId,
                      title: t('HTML widget'),
                      html: w.html,
                      mimeType: 'text/html'
                    })
                  }
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-accent-600 hover:bg-hover"
                >
                  <Maximize2 className="size-3" /> 原生打开
                </button>
              </div>
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
            <li key={w.widgetId} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-soft">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{w.label}</p>
                <p className="truncate text-[12px] text-ink-muted">
                  {t('Slides')} · {w.slug}
                  {w.path ? ` · ${w.path}` : ''}
                </p>
              </div>
              {w.path && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenDoc({
                      accountId,
                      title: w.label,
                      path: w.path
                    })
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-hover px-2.5 py-1 text-[11px] font-medium text-accent-600 hover:bg-active"
                >
                  <Maximize2 className="size-3" /> 原生打开
                </button>
              )}
            </li>
          )
        }
        if (w.kind === 'image_options') {
          return (
            <li key={w.widgetId} className="rounded-xl border border-line bg-surface p-2.5 shadow-soft">
              <p className="mb-1.5 text-[12px] font-medium text-ink-secondary">
                {t('Image options')}
                {w.multiSelect ? ` · ${t('Multi-select')}` : ''}
              </p>
              <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {w.images.slice(0, 12).map((img, i) => {
                  const picked =
                    (w.selectedPath && w.selectedPath === img.path) ||
                    (w.selectedIndices && w.selectedIndices.includes(i))
                  return (
                    <li
                      key={`${img.path}-${i}`}
                      className={
                        picked
                          ? 'overflow-hidden rounded-lg border-2 border-accent-600 bg-accent-50'
                          : 'overflow-hidden rounded-lg border border-line bg-surface-muted'
                      }
                      title={img.path}
                    >
                      <div className="flex aspect-square items-center justify-center px-1 text-center text-[10px] text-ink-muted">
                        {img.path.split('/').pop() || img.path}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-1.5 text-[11px] text-ink-muted">
                {t('Read-only — image_options persist shape not confirmed in muse.ai JS')}
              </p>
            </li>
          )
        }
        if (w.kind === 'text_with_button') {
          return (
            <li key={w.widgetId} className="rounded-xl border border-line bg-surface p-3 shadow-soft">
              {w.text ? (
                <div className="mb-2 text-[13px] leading-5 text-ink">
                  <MarkdownText text={w.text} />
                </div>
              ) : null}
              {w.buttons.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {w.buttons.map((b, i) => {
                    const harkProvider = b.command?.startsWith('hark:connect:')
                      ? b.command.slice('hark:connect:'.length).trim()
                      : undefined
                    if (b.url) {
                      return (
                        <a
                          key={`${b.label}-${i}`}
                          href={b.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full bg-accent-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-accent-700"
                        >
                          <ConnectorIcon id={harkProvider} name={b.label} className="size-4 border-0 bg-transparent shadow-none" />
                          {b.label}
                        </a>
                      )
                    }
                    return (
                      <button
                        key={`${b.label}-${i}`}
                        type="button"
                        onClick={async () => {
                          if (harkProvider && getBridge()?.hark?.rpc) {
                            try {
                              const res = await getBridge()!.hark!.rpc({
                                accountId,
                                op: 'call',
                                method: 'POST',
                                path: '/connectors/link-sessions',
                                body: {
                                  provider: harkProvider,
                                  returnUrl: 'https://app.hark.com/settings/connected-accounts',
                                  origin: 'chat'
                                }
                              })
                              if (res.ok && res.data && typeof res.data === 'object') {
                                const d = res.data as Record<string, unknown>
                                const startUrl = String(d['startUrl'] ?? d['url'] ?? d['authUrl'] ?? '')
                                if (startUrl.startsWith('http')) {
                                  await getBridge()?.muse?.openHttps?.(startUrl)
                                  return
                                }
                              }
                            } catch {
                              /* fall through to sendMessage */
                            }
                          }
                          void sendMessage(botId, b.actionText || b.label)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1 text-[12px] font-medium text-ink hover:bg-hover"
                      >
                        <ConnectorIcon id={harkProvider ?? b.label} name={b.label} className="size-4 border-0 bg-transparent shadow-none" />
                        {b.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </li>
          )
        }
        if (w.kind === 'generic_list') {
          return (
            <li key={w.widgetId} className="rounded-xl border border-line bg-surface p-2.5 shadow-soft">
              {w.title && <p className="mb-1.5 text-[12px] font-medium text-ink-secondary">{w.title}</p>}
              <ul className="divide-y divide-line text-[12px]">
                {w.items.map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{it.title}</span>
                      {it.subtitle && <span className="block truncate text-ink-muted">{it.subtitle}</span>}
                    </span>
                    {it.url ? (
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[11px] text-accent-600 hover:bg-hover"
                      >
                        {t('Open link')}
                      </a>
                    ) : it.sendText ? (
                      <button
                        type="button"
                        onClick={() => void sendMessage(botId, it.sendText!)}
                        className="shrink-0 rounded-full border border-line-strong px-2.5 py-0.5 text-[11px] font-medium text-ink hover:bg-hover"
                      >
                        {t('Send')}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          )
        }
        if (w.kind === 'voice_options') {
          return (
            <li key={w.widgetId} className="rounded-xl border border-line bg-surface p-2.5 shadow-soft">
              <p className="mb-1.5 text-[12px] font-medium text-ink-secondary">{t('Voice options')}</p>
              <div className="flex flex-wrap gap-1.5">
                {w.voices.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => void sendMessage(botId, v.name)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-[12px] transition-colors',
                      v.selected
                        ? 'border-accent-600 bg-accent-50 font-medium text-accent-600'
                        : 'border-line-strong bg-surface text-ink hover:bg-hover'
                    )}
                    title={v.description}
                  >
                    {v.selected ? `✓ ${v.name}` : v.name}
                  </button>
                ))}
              </div>
            </li>
          )
        }
        if (w.kind === 'markdown') {
          const docTitle = w.title || w.path?.split('/').pop() || 'Markdown 文档'
          const wordCount = (w.markdown || '').trim().length
          return (
            <li
              key={w.widgetId}
              className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft transition-shadow hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3 border-b border-line bg-sunken/40 px-3.5 py-2.5">
                <button
                  type="button"
                  onClick={() =>
                    onOpenDoc({
                      accountId,
                      title: docTitle,
                      markdown: w.markdown || undefined,
                      path: w.path,
                      mimeType: 'text/markdown'
                    })
                  }
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-600">
                    <FileText className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink">{docTitle}</span>
                    <span className="block truncate text-[11px] text-ink-muted">
                      文章 / 文档卡片{wordCount > 0 ? ` · ${wordCount} 字` : ''}
                      {w.path ? ` · ${w.path}` : ''}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onOpenDoc({
                      accountId,
                      title: docTitle,
                      markdown: w.markdown || undefined,
                      path: w.path,
                      mimeType: 'text/markdown'
                    })
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-600 px-3 py-1 text-[11.5px] font-medium text-white shadow-hairline hover:bg-accent-700"
                >
                  <Maximize2 className="size-3" /> 右侧画布阅读
                </button>
              </div>
              {w.markdown && (
                <div className="relative max-h-60 overflow-hidden px-4 py-3 text-[13.5px] leading-relaxed text-ink">
                  <MarkdownText
                    text={w.markdown}
                    onFileLinkClick={(path, label) => onOpenDoc({ accountId, title: label, path })}
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent" />
                </div>
              )}
            </li>
          )
        }
        if (w.kind === 'hotel_results') {
          return (
            <li key={w.widgetId} className="rounded-xl border border-line bg-surface p-2.5 shadow-soft">
              <p className="mb-1.5 text-[12px] font-medium text-ink-secondary">酒店推荐</p>
              <ul className="flex flex-col gap-1.5 text-[12px]">
                {w.hotels.map((h, i) => (
                  <li key={`${h.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-hover/40 px-2.5 py-1.5">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{h.name}</span>
                      <span className="block truncate text-[11px] text-ink-muted">
                        {[h.rating && `★ ${h.rating}`, h.price, h.location].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {h.url && (
                      <a
                        href={h.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-accent-600 hover:underline"
                      >
                        查看 <ExternalLink className="size-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          )
        }
        if (w.kind === 'idea_cards') {
          return (
            <li key={w.widgetId} className="rounded-xl border border-line bg-surface p-2.5 shadow-soft">
              <p className="mb-1.5 text-[12px] font-medium text-ink-secondary">灵感卡片</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {w.cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void sendMessage(botId, c.prompt || c.title)}
                    className="flex flex-col items-start rounded-lg border border-line bg-hover/30 p-2 text-left transition-colors hover:bg-hover"
                  >
                    <span className="text-[12.5px] font-medium text-ink">{c.title}</span>
                    {c.subtitle && <span className="mt-0.5 line-clamp-2 text-[11px] text-ink-muted">{c.subtitle}</span>}
                  </button>
                ))}
              </div>
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
  const setActiveDocument = useBotStore((s) => s.setActiveDocument)
  const [docTarget, setDocTarget] = useState<NativeDocumentTarget | null>(null)
  const [articleExpanded, setArticleExpanded] = useState(false)
  const [copiedMsg, setCopiedMsg] = useState(false)

  const openDocument = (target: NativeDocumentTarget) => {
    setActiveDocument(target)
  }

  const isLongMarkdownReport =
    !mine &&
    message.text.length > 360 &&
    (/(^|\n)#{1,4}\s+|\n\|.+\|\n|```/.test(message.text) || message.text.length > 800)
  const reportTitleMatch = !mine ? /^(?:---[\s\S]*?---\s*)?#+\s+(.+)$/m.exec(message.text) : null
  const reportTitle = reportTitleMatch?.[1]?.replace(/[*`]/g, '').trim() || '文章 / 报告文档'

  const copyMessageText = () => {
    if (!message.text) return
    void navigator.clipboard.writeText(message.text).then(
      () => {
        setCopiedMsg(true)
        setTimeout(() => setCopiedMsg(false), 1600)
      },
      () => {}
    )
  }

  return (
    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
      {/* 1. Tool execution trace / thinking status above the assistant reply */}
      {!mine && tools.length > 0 && <ToolChips tools={tools} />}

      {/* 2. User uploaded attachment chips */}
      {message.attachments && message.attachments.length > 0 && (
        <ul className={cn('mb-1.5 flex max-w-[78%] flex-wrap gap-1.5', mine && 'justify-end')}>
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

      {/* 3. Message text or structured inline Article / Document Card */}
      {message.text &&
        (isLongMarkdownReport ? (
          <div className="w-full max-w-[82%] overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
            {/* Article Card Header */}
            <div className="flex items-center justify-between gap-3 border-b border-line bg-sunken/40 px-4 py-2.5">
              <button
                type="button"
                onClick={() =>
                  openDocument({
                    accountId: message.accountId,
                    title: reportTitle,
                    markdown: message.text,
                    mimeType: 'text/markdown'
                  })
                }
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-600">
                  <FileText className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{reportTitle}</span>
                  <span className="block truncate text-[11px] text-ink-muted">
                    Markdown 文章卡片 · {message.text.length} 字 · 支持右侧画布沉浸阅读
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1.5">
                {message.text.length > 720 && (
                  <button
                    type="button"
                    onClick={() => setArticleExpanded((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-secondary hover:bg-hover hover:text-ink"
                  >
                    {articleExpanded ? '收起预览' : '展开全文'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    openDocument({
                      accountId: message.accountId,
                      title: reportTitle,
                      markdown: message.text,
                      mimeType: 'text/markdown'
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-full bg-accent-600 px-3 py-1 text-[11.5px] font-medium text-white shadow-hairline hover:bg-accent-700"
                >
                  <Maximize2 className="size-3" /> 右侧画布阅读
                </button>
              </div>
            </div>

            {/* Article Card Body */}
            <div
              className={cn(
                'relative px-5 py-4 text-[14px] leading-[1.68] text-ink',
                !articleExpanded && message.text.length > 720 && 'max-h-[340px] overflow-hidden'
              )}
            >
              <MarkdownText
                text={message.text}
                onFileLinkClick={(path, label) =>
                  openDocument({
                    accountId: message.accountId,
                    title: label || path.split('/').pop() || 'Document',
                    path
                  })
                }
              />
              {!articleExpanded && message.text.length > 720 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface via-surface/85 to-transparent" />
              )}
            </div>

            {!articleExpanded && message.text.length > 720 && (
              <div className="flex items-center justify-between border-t border-line/70 bg-sunken/25 px-4 py-1.5 text-[11.5px] text-ink-secondary">
                <button
                  type="button"
                  onClick={() => setArticleExpanded(true)}
                  className="font-medium text-ink-secondary hover:text-ink"
                >
                  点击展开完整长文（共 {message.text.length} 字）
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openDocument({
                      accountId: message.accountId,
                      title: reportTitle,
                      markdown: message.text,
                      mimeType: 'text/markdown'
                    })
                  }
                  className="font-medium text-accent-600 hover:underline"
                >
                  在右侧分栏打开 →
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              'max-w-[78%] rounded-[18px] px-3.5 py-2 text-[14px] leading-6',
              mine ? 'bg-bubble-user text-canvas whitespace-pre-wrap break-words' : 'bg-bubble text-ink',
              message.delivery === 'sending' && 'opacity-70',
              message.delivery === 'failed' && 'bg-status-error/10 text-ink ring-1 ring-status-error/30'
            )}
          >
            {mine ? (
              message.text
            ) : (
              <MarkdownText
                text={message.text}
                onFileLinkClick={(path, label) =>
                  openDocument({
                    accountId: message.accountId,
                    title: label || path.split('/').pop() || 'Document',
                    path
                  })
                }
              />
            )}
          </div>
        ))}

      {/* 4. Media / File / Artifact cards below message text */}
      {!mine && media.length > 0 && (
        <div className={cn('w-full', message.text && 'mt-2')}>
          <MediaParts parts={media} accountId={message.accountId} onOpenDoc={openDocument} />
        </div>
      )}

      {/* 5. Rich widgets / interactive cards / CTA buttons below message text */}
      {!mine && rich.length > 0 && (
        <div className={cn('w-full', (message.text || media.length > 0) && 'mt-2')}>
          <RichWidgets
            widgets={rich}
            botId={message.botId}
            accountId={message.accountId}
            onOpenDoc={openDocument}
          />
        </div>
      )}

      <NativeDocumentDialog target={docTarget} onClose={() => setDocTarget(null)} />

      {/* 6. Interactive option chips */}
      {optionWidgets.map((w) => (
        <OptionChips key={w.widgetId || w.options.join('|')} message={message} widget={w} />
      ))}

      {(isLastInRun || message.delivery === 'failed' || message.delivery === 'no-reply' || !mine) && (
        <div
          className={cn(
            'mt-1 flex h-5 items-center gap-2 px-1.5 text-[11px] text-ink-muted transition-opacity duration-150',
            message.delivery === 'failed' || message.delivery === 'sending' || message.delivery === 'accepted' || message.delivery === 'no-reply'
              ? 'opacity-100'
              : 'opacity-0 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100'
          )}
        >
          {accountLabel && <span className="text-ink-secondary">{accountLabel}</span>}
          {accountLabel && <span aria-hidden>·</span>}
          <time dateTime={new Date(message.createdAt).toISOString()} className="tabular-nums">
            {formatClock(message.createdAt)}
          </time>
          {mine ? (
            <DeliveryState message={message} onRetry={onRetry} />
          ) : (
            message.text && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={copyMessageText}
                  title={t('Copy')}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-secondary hover:bg-hover hover:text-ink"
                >
                  {copiedMsg ? <Check className="size-3 text-status-online" /> : <Copy className="size-3" />}
                  <span>{copiedMsg ? '已复制' : t('Copy')}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openDocument({
                      accountId: message.accountId,
                      title: reportTitle,
                      markdown: message.text,
                      mimeType: 'text/markdown'
                    })
                  }
                  title="在右侧画布展开阅读"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-secondary hover:bg-hover hover:text-ink"
                >
                  <Maximize2 className="size-3" />
                  <span>右侧阅读</span>
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
})
