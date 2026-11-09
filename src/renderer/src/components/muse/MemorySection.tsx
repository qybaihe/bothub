import { useCallback, useEffect, useState } from 'react'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

type MemoryHit = { id: string; title: string; snippet: string }

function asHits(raw: unknown): MemoryHit[] {
  if (!raw || typeof raw !== 'object') return []
  const root = raw as Record<string, unknown>
  const lists = [root['results'], root['items'], root['memories'], root['entries'], root['hits']]
  let arr: unknown[] = []
  for (const c of lists) {
    if (Array.isArray(c)) {
      arr = c
      break
    }
  }
  if (!arr.length && Array.isArray(raw)) arr = raw
  const out: MemoryHit[] = []
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const id = String(o['id'] ?? o['memory_id'] ?? o['key'] ?? out.length)
    const title = String(o['title'] ?? o['name'] ?? o['label'] ?? o['kind'] ?? id)
    const snippet = String(
      o['snippet'] ?? o['text'] ?? o['content'] ?? o['summary'] ?? o['value'] ?? ''
    ).slice(0, 280)
    out.push({ id, title, snippet })
  }
  return out
}

export function MemorySection({ accountId }: { accountId: string }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<MemoryHit[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [unavailable, setUnavailable] = useState(false)
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const runSearch = useCallback(
    async (q: string) => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) {
        setUnavailable(true)
        return
      }
      setLoading(true)
      setError(undefined)
      setUnavailable(false)
      try {
        const method = q.trim() ? 'memory.search' : 'memory.get'
        const params = q.trim() ? { query: q.trim(), limit: 20 } : { limit: 20 }
        const raw = await muse.rpc({ accountId, method, params })
        const next = asHits(raw)
        setHits(next)
        if (!next.length && (raw === null || raw === undefined || raw === '')) {
          setUnavailable(true)
        }
      } catch (err) {
        setHits([])
        setError(err instanceof Error ? err.message : String(err))
        setUnavailable(true)
      } finally {
        setLoading(false)
      }
    },
    [accountId]
  )

  useEffect(() => {
    if (status === 'online' || status === 'busy' || status === 'attention') void runSearch('')
  }, [runSearch, status])

  const consolidate = async () => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setBusy(true)
    setError(undefined)
    try {
      await muse.rpc({ accountId, method: 'memory.consolidate', params: {} })
      await runSearch(query)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title={t('Muse memory')}
      count={hits.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void runSearch(query)} />}
    >
      <div className="flex flex-col gap-2">
        <div className="flex gap-1.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch(query)
            }}
            placeholder={t('Search memory…')}
            aria-label={t('Search memory…')}
            className="h-7 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12px] text-ink outline-none placeholder:text-ink-muted"
          />
          <Button size="sm" variant="secondary" disabled={busy || loading} onClick={() => void consolidate()}>
            {t('Consolidate')}
          </Button>
        </div>
        {error && <p className="text-[12px] text-status-error">{error}</p>}
        {unavailable && hits.length === 0 ? (
          <EmptyLine>{t('Memory unavailable')}</EmptyLine>
        ) : hits.length === 0 ? (
          <EmptyLine>{t('No memory hits')}</EmptyLine>
        ) : (
          <ul className="divide-y divide-line">
            {hits.map((h) => (
              <li key={h.id} className="py-1.5">
                <p className="text-[12.5px] font-medium text-ink">{h.title}</p>
                {h.snippet ? <p className="mt-0.5 text-[11.5px] text-ink-secondary">{h.snippet}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}
