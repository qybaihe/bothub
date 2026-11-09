import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Download, FileCode, FileText, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { MarkdownText } from './MarkdownText'
import { getBridge } from '@/lib/bridge'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'

export interface NativeDocumentTarget {
  accountId: string
  title: string
  /** Optional inline markdown/text already available in the message/widget. */
  markdown?: string
  /** Optional raw HTML already available. */
  html?: string
  /** Optional VM workspace path (`workspace/...`) or remote URL/fileId to load. */
  path?: string
  mimeType?: string
  platformId?: string
  agentId?: string
}

function decodeBase64Utf8(b64: string): string {
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return ''
  }
}

function useDocumentContent(target: NativeDocumentTarget | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [content, setContent] = useState<string>('')
  const [rawBase64, setRawBase64] = useState<string>()
  const [mime, setMime] = useState<string>('text/markdown')

  const loadFromVm = useCallback(async () => {
    if (!target) return
    setRawBase64(undefined)
    if (target.markdown) {
      setContent(target.markdown)
      setMime('text/markdown')
      setError(undefined)
      return
    }
    if (target.html) {
      setContent(target.html)
      setMime('text/html')
      setError(undefined)
      return
    }
    if (!target.path) return

    const bridge = getBridge()
    setLoading(true)
    setError(undefined)
    try {
      const rawPath = target.path.trim()
      const isHttpUrl = /^https?:\/\//i.test(rawPath)
      const isDotFileId = /^(CalpicoFile_|file_|libfile_|sediment:\/\/|dotfile:\/\/|dotatt:\/\/)/i.test(rawPath)
      const isHarkFile =
        target.platformId === 'hark' ||
        /^(harkatt:\/\/|harkfile:\/\/)/i.test(rawPath) ||
        /hark\.com|hark\.ai/i.test(rawPath)

      if (isHarkFile && bridge?.hark?.rpc) {
        const cleanRef = rawPath.replace(/^(harkatt|harkfile):\/\//i, '')
        const harkRes = await bridge.hark.rpc({
          accountId: target.accountId,
          op: 'downloadArtifact',
          url: /^https?:\/\//i.test(cleanRef) ? cleanRef : undefined,
          fileId: !/^https?:\/\//i.test(cleanRef) ? cleanRef : undefined,
          name: target.title
        })
        if (harkRes.ok && harkRes.data && typeof harkRes.data === 'object') {
          const d = harkRes.data as {
            dataBase64: string
            mimeType: string
            text?: string
          }
          setRawBase64(d.dataBase64)
          setMime(d.mimeType || target.mimeType || 'text/plain')
          setContent(d.text ?? decodeBase64Utf8(d.dataBase64))
          return
        }
      }

      if ((isHttpUrl || isDotFileId) && bridge?.dot?.rpc && target.platformId !== 'hark') {
        const dotRes = await bridge.dot.rpc({
          accountId: target.accountId,
          op: 'downloadFile',
          url: isHttpUrl ? rawPath : undefined,
          fileId: !isHttpUrl ? rawPath.replace(/^(sediment|dotfile|dotatt):\/\//i, '') : undefined,
          name: target.title
        })
        if (dotRes.ok && dotRes.data && typeof dotRes.data === 'object') {
          const d = dotRes.data as {
            dataBase64: string
            mimeType: string
            filename?: string
            name?: string
            text?: string
          }
          setRawBase64(d.dataBase64)
          setMime(d.mimeType || target.mimeType || 'text/plain')
          setContent(d.text ?? decodeBase64Utf8(d.dataBase64))
          return
        }
        if (!isHttpUrl && !dotRes.ok) {
          throw new Error(dotRes.message || `Download failed (${dotRes.status})`)
        }
      }

      if (isHttpUrl && bridge?.hark?.rpc) {
        const harkRes = await bridge.hark.rpc({
          accountId: target.accountId,
          op: 'downloadArtifact',
          url: rawPath,
          name: target.title
        })
        if (harkRes.ok && harkRes.data && typeof harkRes.data === 'object') {
          const d = harkRes.data as { dataBase64: string; mimeType: string; text?: string }
          setRawBase64(d.dataBase64)
          setMime(d.mimeType || target.mimeType || 'text/plain')
          setContent(d.text ?? decodeBase64Utf8(d.dataBase64))
          return
        }
      }

      const muse = bridge?.muse
      if (muse) {
        const cleanPath = rawPath.replace(/^\/+/, '')
        if (muse.previewWorkspaceFile) {
          try {
            const res = await muse.previewWorkspaceFile(target.accountId, cleanPath)
            setRawBase64(res.dataBase64)
            setMime(res.mimeType || target.mimeType || 'text/markdown')
            setContent(decodeBase64Utf8(res.dataBase64))
            return
          } catch {
            // Fall through to fs.read
          }
        }
        if (muse.rpc) {
          const raw = await muse.rpc({
            accountId: target.accountId,
            method: 'fs.read',
            params: { path: cleanPath }
          })
          const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
          const text =
            typeof o['content'] === 'string'
              ? (o['content'] as string)
              : typeof o['text'] === 'string'
                ? (o['text'] as string)
                : typeof o['data_base64'] === 'string'
                  ? decodeBase64Utf8(o['data_base64'] as string)
                  : JSON.stringify(raw, null, 2)
          setContent(text)
          setMime(target.mimeType || 'text/markdown')
          return
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [target])

  useEffect(() => {
    if (target) {
      void loadFromVm()
    }
  }, [target, loadFromVm])

  return { loading, error, content, rawBase64, mime, reload: loadFromVm }
}

function triggerTargetDownload(
  target: NativeDocumentTarget,
  content: string,
  rawBase64: string | undefined,
  mime: string,
  isHtml: boolean,
  isMarkdown: boolean
) {
  let blob: Blob
  if (rawBase64) {
    const bin = atob(rawBase64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    blob = new Blob([bytes], { type: mime || 'application/octet-stream' })
  } else {
    blob = new Blob([content], { type: `${mime || 'text/plain'};charset=utf-8` })
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const cleanTargetPath =
    target.path && !/^https?:\/\/|^(sediment|dotfile|dotatt|harkatt|harkfile):\/\//i.test(target.path)
      ? target.path.split('/').pop()
      : undefined
  const filename =
    (target.title && /\.[a-z0-9]{1,8}$/i.test(target.title) ? target.title : undefined) ||
    cleanTargetPath ||
    (isHtml
      ? `${target.title || 'document'}.html`
      : isMarkdown
        ? `${target.title || 'document'}.md`
        : target.title || 'document.txt')
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Right-side Split-Pane Document / Artifact Canvas Viewer (aligned with ChatGPT Canvas / Claude Artifacts / Muse Workspace).
 */
export function DocumentCanvasPane({
  target,
  onClose,
  onOpenNestedDoc
}: {
  target: NativeDocumentTarget
  onClose: () => void
  onOpenNestedDoc?: (next: NativeDocumentTarget) => void
}) {
  const { loading, error, content, rawBase64, mime, reload } = useDocumentContent(target)
  const [mode, setMode] = useState<'rendered' | 'source'>('rendered')
  const [copied, setCopied] = useState(false)
  const [expandedModal, setExpandedModal] = useState(false)

  useEffect(() => {
    setMode('rendered')
  }, [target.title, target.path, target.markdown, target.html])

  const lowerName = (target.path || target.title || '').toLowerCase()
  const isMarkdown =
    mime.includes('markdown') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown') ||
    Boolean(target.markdown)
  const isHtml =
    mime.includes('html') ||
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.htm') ||
    Boolean(target.html)
  const isImage = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(lowerName)

  const copyContent = () => {
    void navigator.clipboard.writeText(content).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
      () => {}
    )
  }

  return (
    <aside
      aria-label="Document Viewer"
      className="flex h-full w-[46%] min-w-[380px] max-w-[680px] shrink-0 flex-col border-l border-line bg-surface animate-veil-in"
    >
      {/* Top Canvas Header */}
      <div className="drag-region flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <div className="no-drag flex min-w-0 items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-50 text-accent-600">
            <FileText className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[13.5px] font-semibold text-ink">
              {target.title || target.path?.split('/').pop() || 'Document'}
            </h3>
            <p className="truncate text-[11px] text-ink-muted">
              {isHtml ? 'HTML Artifact' : isMarkdown ? 'Article / Markdown' : target.path || mime || 'Document'}
            </p>
          </div>
        </div>

        <div className="no-drag flex shrink-0 items-center gap-1">
          {(isMarkdown || isHtml) && (
            <div className="mr-1 flex rounded-lg bg-hover p-0.5 text-[11.5px]">
              <button
                type="button"
                onClick={() => setMode('rendered')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors',
                  mode === 'rendered' ? 'bg-surface text-ink shadow-soft' : 'text-ink-secondary hover:text-ink'
                )}
              >
                <FileText className="size-3" /> 排版
              </button>
              <button
                type="button"
                onClick={() => setMode('source')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors',
                  mode === 'source' ? 'bg-surface text-ink shadow-soft' : 'text-ink-secondary hover:text-ink'
                )}
              >
                <FileCode className="size-3" /> 源码
              </button>
            </div>
          )}
          {target.path && (
            <Button size="sm" variant="ghost" disabled={loading} onClick={() => void reload()} title={t('Refresh')}>
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </Button>
          )}
          {content && (
            <Button size="sm" variant="ghost" onClick={copyContent} title={copied ? '已复制' : t('Copy')}>
              {copied ? <Check className="size-3.5 text-status-online" /> : <Copy className="size-3.5" />}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => triggerTargetDownload(target, content, rawBase64, mime, isHtml, isMarkdown)}
            title={t('Download')}
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpandedModal(true)}
            title="弹窗大屏阅读"
          >
            <Maximize2 className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} title="关闭文档侧栏">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Document Body */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-canvas/40 p-5">
        {loading ? (
          <div className="py-16 text-center text-[13px] text-ink-muted">{t('Loading preview…')}</div>
        ) : error ? (
          <div className="rounded-xl border border-status-error/20 bg-status-error/5 p-4 text-[13px] text-status-error">
            {error}
          </div>
        ) : isImage && rawBase64 ? (
          <div className="flex justify-center rounded-2xl border border-line bg-surface p-5 shadow-soft">
            <img
              src={`data:${mime};base64,${rawBase64}`}
              alt={target.title}
              className="max-h-[75vh] max-w-full rounded-lg object-contain"
            />
          </div>
        ) : mode === 'rendered' && isMarkdown ? (
          <article className="mx-auto max-w-[640px] rounded-2xl border border-line bg-surface px-7 py-6 text-[14.5px] leading-[1.7] text-ink shadow-soft">
            <MarkdownText
              text={content}
              onFileLinkClick={(path, label) =>
                onOpenNestedDoc?.({
                  accountId: target.accountId,
                  title: label || path.split('/').pop() || 'Document',
                  path,
                  platformId: target.platformId
                })
              }
            />
          </article>
        ) : mode === 'rendered' && isHtml ? (
          <iframe
            title={target.title}
            sandbox="allow-scripts"
            srcDoc={content}
            className="h-full min-h-[520px] w-full rounded-2xl border border-line bg-white shadow-soft"
          />
        ) : (
          <pre className="overflow-auto rounded-2xl border border-line bg-sunken p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink">
            {content || '（空文件）'}
          </pre>
        )}
      </div>

      {expandedModal && (
        <NativeDocumentDialog target={target} onClose={() => setExpandedModal(false)} />
      )}
    </aside>
  )
}

export function NativeDocumentDialog({
  target,
  onClose
}: {
  target: NativeDocumentTarget | null
  onClose: () => void
}) {
  const { loading, error, content, rawBase64, mime, reload } = useDocumentContent(target)
  const [mode, setMode] = useState<'rendered' | 'source'>('rendered')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (target) setMode('rendered')
  }, [target])

  if (!target) return null

  const lowerName = (target.path || target.title || '').toLowerCase()
  const isMarkdown =
    mime.includes('markdown') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown') ||
    Boolean(target.markdown)
  const isHtml = mime.includes('html') || lowerName.endsWith('.html') || lowerName.endsWith('.htm') || Boolean(target.html)
  const isImage = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(lowerName)

  const copyContent = () => {
    void navigator.clipboard.writeText(content).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
      () => {}
    )
  }

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={target.title || target.path || 'Document'}
      className="max-w-[820px]"
    >
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
        <div className="flex items-center gap-1.5">
          {(isMarkdown || isHtml) && (
            <div className="flex rounded-lg bg-hover p-0.5 text-[12px]">
              <button
                type="button"
                onClick={() => setMode('rendered')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
                  mode === 'rendered' ? 'bg-surface text-ink shadow-soft' : 'text-ink-secondary hover:text-ink'
                )}
              >
                <FileText className="size-3.5" /> 排版视图
              </button>
              <button
                type="button"
                onClick={() => setMode('source')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
                  mode === 'source' ? 'bg-surface text-ink shadow-soft' : 'text-ink-secondary hover:text-ink'
                )}
              >
                <FileCode className="size-3.5" /> 源码
              </button>
            </div>
          )}
          {target.path && (
            <span className="max-w-[320px] truncate font-mono text-[11px] text-ink-muted" title={target.path}>
              {target.path}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {target.path && (
            <Button size="sm" variant="ghost" disabled={loading} onClick={() => void reload()}>
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> {t('Refresh')}
            </Button>
          )}
          {content && (
            <Button size="sm" variant="secondary" onClick={copyContent}>
              {copied ? <Check className="size-3.5 text-status-online" /> : <Copy className="size-3.5" />}
              {copied ? '已复制' : t('Copy')}
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={() => triggerTargetDownload(target, content, rawBase64, mime, isHtml, isMarkdown)}
          >
            <Download className="size-3.5" /> {t('Download')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} title="收起至侧栏">
            <Minimize2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Viewer Body */}
      {loading ? (
        <div className="py-12 text-center text-[13px] text-ink-muted">{t('Loading preview…')}</div>
      ) : error ? (
        <div className="rounded-xl border border-status-error/20 bg-status-error/5 p-4 text-[13px] text-status-error">
          {error}
        </div>
      ) : isImage && rawBase64 ? (
        <div className="flex justify-center rounded-xl bg-sunken p-4">
          <img
            src={`data:${mime};base64,${rawBase64}`}
            alt={target.title}
            className="max-h-[62vh] max-w-full rounded-lg object-contain"
          />
        </div>
      ) : mode === 'rendered' && isMarkdown ? (
        <article className="max-h-[66vh] overflow-y-auto rounded-xl border border-line bg-surface p-6 text-[14.5px] leading-[1.7] text-ink shadow-soft">
          <MarkdownText text={content} />
        </article>
      ) : mode === 'rendered' && isHtml ? (
        <iframe
          title={target.title}
          sandbox="allow-scripts"
          srcDoc={content}
          className="h-[64vh] w-full rounded-xl border border-line bg-white"
        />
      ) : (
        <pre className="max-h-[66vh] overflow-auto rounded-xl border border-line bg-sunken p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink">
          {content || '（空文件）'}
        </pre>
      )}
    </Dialog>
  )
}
