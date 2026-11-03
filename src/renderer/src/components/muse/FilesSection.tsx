import { useCallback, useEffect, useMemo, useState } from 'react'
import { File, FileCode, FileImage, FileText, Pin, PinOff, Search } from 'lucide-react'
import type { MuseFileEntryView } from '@shared/ipc'
import { EmptyLine, Section } from '@/components/info/Section'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { cn } from '@/lib/cn'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

type Filter = 'all' | 'pinned' | 'artifact' | 'library'
const FILTERS: ReadonlyArray<[Filter, string]> = [
  ['all', 'All'],
  ['pinned', 'Pinned'],
  ['artifact', 'Artifacts'],
  ['library', 'Library']
]

function formatBytes(n: number | null): string {
  if (n == null || n < 0) return ''
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function relativeTime(ms: number | null): string {
  if (!ms) return ''
  const diff = Date.now() - ms
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ms).toLocaleDateString()
}

function FileGlyph({ file }: { file: MuseFileEntryView }) {
  const mime = file.mimeType ?? ''
  const name = file.name.toLowerCase()
  const Icon = mime.startsWith('image/')
    ? FileImage
    : /\.(ts|tsx|js|py|json|sh|html|css)$/.test(name)
      ? FileCode
      : mime.startsWith('text/') || /\.(md|txt|pdf|docx?)$/.test(name)
        ? FileText
        : File
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-hover text-ink-secondary">
      <Icon className="size-4" aria-hidden />
    </span>
  )
}

const PIN_KEY = (accountId: string) => `bothub-library-pins:${accountId}`
function loadPins(accountId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PIN_KEY(accountId)) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

/** Grok-like Library: search, filter chips, local pins, inline detail. Read-only (no fs read RPC wired). */
export function FilesSection({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<MuseFileEntryView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [pins, setPins] = useState<Set<string>>(() => loadPins(accountId))
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.listFiles) return
    setLoading(true)
    setError(undefined)
    try {
      setItems(await muse.listFiles(accountId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    void refresh()
  }, [refresh, status])

  useEffect(() => {
    const muse = getBridge()?.muse
    if (!muse?.onEvent) return
    return muse.onEvent((event) => {
      if (event.type === 'files' && event.accountId === accountId) setItems(event.files)
    })
  }, [accountId])

  useEffect(() => setPins(loadPins(accountId)), [accountId])

  const keyOf = (f: MuseFileEntryView) => f.source + ':' + f.id
  const isPinned = (f: MuseFileEntryView) => f.pinned || pins.has(keyOf(f))
  const togglePin = (f: MuseFileEntryView) => {
    setPins((prev) => {
      const next = new Set(prev)
      const k = keyOf(f)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      localStorage.setItem(PIN_KEY(accountId), JSON.stringify([...next]))
      return next
    })
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((f) => (filter === 'all' ? true : filter === 'pinned' ? isPinned(f) : f.source === filter))
      .filter((f) => !q || f.name.toLowerCase().includes(q) || (f.path ?? '').toLowerCase().includes(q))
      .sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)) || (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, filter, pins])

  return (
    <Section
      title={t('Documents and Files')}
      count={items.length || undefined}
      flush
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2 border-b border-line px-3 py-2.5">
        <label className="flex h-8 items-center gap-2 rounded-lg bg-hover px-2.5 text-ink-muted">
          <Search className="size-3.5 shrink-0" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Search files')}
            aria-label={t('Search files')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
          />
        </label>
        <div className="flex gap-1" role="radiogroup" aria-label={t('Filter files')}>
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={filter === id}
              onClick={() => setFilter(id)}
              className={cn(
                'press h-6 rounded-full px-2.5 text-[11px] font-medium transition-colors',
                filter === id ? 'bg-ink text-canvas' : 'bg-hover text-ink-secondary hover:text-ink'
              )}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="px-3 pt-2 text-[12px] text-status-error">{error}</p>}
      {visible.length === 0 ? (
        <div className="px-3 py-2.5">
          <EmptyLine>
            {loading ? t('Loading files…') : items.length ? t('No files match') : t('Files the bot creates show up here')}
          </EmptyLine>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((f) => {
            const k = keyOf(f)
            const pinned = isPinned(f)
            const expanded = open === k
            const meta = [relativeTime(f.updatedAtMs), formatBytes(f.sizeBytes)].filter(Boolean).join(' · ')
            return (
              <li key={k} className="group/file">
                <div className="flex items-center gap-2.5 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : k)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <FileGlyph file={f} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-ink">{f.name}</span>
                      {meta && <span className="block truncate text-[11px] text-ink-muted">{meta}</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePin(f)}
                    disabled={f.pinned}
                    aria-label={pinned ? t('Unpin') : t('Pin')}
                    title={f.pinned ? t('Pinned in Muse') : pinned ? t('Unpin (local)') : t('Pin (local)')}
                    className={cn(
                      'press-icon grid size-7 shrink-0 place-items-center rounded-full transition-opacity hover:bg-hover',
                      pinned ? 'text-accent-600' : 'text-ink-muted opacity-0 group-hover/file:opacity-100 focus-visible:opacity-100'
                    )}
                  >
                    {pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
                  </button>
                </div>
                {expanded && (
                  <dl className="mx-3 mb-2.5 grid animate-veil-in grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-hover px-3 py-2 text-[11px]">
                    <dt className="text-ink-muted">{t('Source')}</dt>
                    <dd className="text-ink capitalize">{f.source}</dd>
                    <dt className="text-ink-muted">{t('Type')}</dt>
                    <dd className="truncate text-ink">{f.mimeType ?? f.kind}</dd>
                    {f.path && (
                      <>
                        <dt className="text-ink-muted">{t('Path')}</dt>
                        <dd className="truncate font-mono text-ink" title={f.path}>
                          {f.path}
                        </dd>
                      </>
                    )}
                    <dt className="col-span-2 pt-1 text-ink-muted">{t('Preview isn’t available yet — open it in Muse.')}</dt>
                  </dl>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
