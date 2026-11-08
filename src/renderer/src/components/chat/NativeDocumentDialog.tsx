import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Download, FileCode, FileText, RefreshCw } from 'lucide-react'
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
  /** Optional VM workspace path (`workspace/...`) to load via `fs.raw` / `fs.read`. */
  path?: string
  mimeType?: string
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

export function NativeDocumentDialog({
  target,
  onClose
}: {
  target: NativeDocumentTarget | null
  onClose: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [content, setContent] = useState<string>('')
  const [rawBase64, setRawBase64] = useState<string>()
  const [mime, setMime] = useState<string>('text/markdown')
  const [mode, setMode] = useState<'rendered' | 'source'>('rendered')
  const [copied, setCopied] = useState(false)

  const loadFromVm = useCallback(async () => {
    if (!target) return
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

      if ((isHttpUrl || isDotFileId) && bridge?.dot?.rpc) {
        const dotRes = await bridge.dot.rpc({
          accountId: target.accountId,
          op: 'downloadFile',
          url: isHttpUrl ? rawPath : undefined,
          fileId: !isHttpUrl ? rawPath.replace(/^(sediment|dotfile|dotatt):\/\//i, '') : undefined,
          name: target.title
        })
        if (!dotRes.ok) {
          throw new Error(dotRes.message || `Download failed (${dotRes.status})`)
        }
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

      const muse = bridge?.muse
      if (!muse) return
      const cleanPath = rawPath.replace(/^\/+/, '')
      if (muse.previewWorkspaceFile) {
        const res = await muse.previewWorkspaceFile(target.accountId, cleanPath)
        setRawBase64(res.dataBase64)
        setMime(res.mimeType || target.mimeType || 'text/markdown')
        setContent(decodeBase64Utf8(res.dataBase64))
        return
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [target])

  useEffect(() => {
    if (target) {
      setMode('rendered')
      void loadFromVm()
    }
  }, [target, loadFromVm])

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

  const downloadFile = () => {
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
    const cleanTargetPath = target.path && !/^https?:\/\//i.test(target.path) ? target.path.split('/').pop() : undefined
    const filename =
      (target.title && /\.[a-z0-9]{1,8}$/i.test(target.title) ? target.title : undefined) ||
      cleanTargetPath ||
      (isHtml ? `${target.title || 'document'}.html` : isMarkdown ? `${target.title || 'document'}.md` : target.title || 'document.txt')
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={target.title || target.path || 'Document'}
      className="max-w-[780px]"
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
            <span className="truncate font-mono text-[11px] text-ink-muted" title={target.path}>
              {target.path}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {target.path && (
            <Button size="sm" variant="ghost" disabled={loading} onClick={() => void loadFromVm()}>
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /> {t('Refresh')}
            </Button>
          )}
          {content && (
            <Button size="sm" variant="secondary" onClick={copyContent}>
              {copied ? <Check className="size-3.5 text-status-online" /> : <Copy className="size-3.5" />}
              {copied ? '已复制' : t('Copy')}
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={downloadFile}>
            <Download className="size-3.5" /> {t('Download')}
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
        <article className="max-h-[64vh] overflow-y-auto rounded-xl border border-line bg-surface p-5 text-[14px] leading-relaxed text-ink shadow-soft">
          <MarkdownText text={content} />
        </article>
      ) : mode === 'rendered' && isHtml ? (
        <iframe
          title={target.title}
          sandbox="allow-scripts"
          srcDoc={content}
          className="h-[62vh] w-full rounded-xl border border-line bg-white"
        />
      ) : (
        <pre className="max-h-[64vh] overflow-auto rounded-xl border border-line bg-sunken p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink">
          {content || '（空文件）'}
        </pre>
      )}
    </Dialog>
  )
}
