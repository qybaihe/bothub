import { useCallback, useEffect, useState } from 'react'
import { adapterRegistry } from '@adapters/registry'
import type { MuseConnector } from '@adapters/types'
import { Cable, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useBotStore } from '@/store/botStore'

export function ConnectorsSection({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<MuseConnector[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const refresh = useCallback(async () => {
    const adapter = adapterRegistry.get('meta-muse')
    if (!adapter?.listConnectors) return
    setLoading(true)
    setError(undefined)
    try {
      setItems(await adapter.listConnectors(accountId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy' || status === 'attention') void refresh()
  }, [refresh, status])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-caption font-medium text-ink-muted">
          <Cable className="size-3.5" aria-hidden />
          Connectors
        </p>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : 'Refresh'}
        </Button>
      </div>
      {error && <p className="text-caption text-status-error-ink">{error}</p>}
      {items.length === 0 ? (
        <p className="text-caption text-ink-muted">No connectors loaded yet. Sign in and refresh.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-ui font-medium">{c.name}</p>
                {c.description && <p className="truncate text-caption text-ink-muted">{c.description}</p>}
              </div>
              <span
                className={
                  c.connected
                    ? 'rounded-full bg-status-online/10 px-2 py-0.5 text-caption font-medium text-status-online-ink'
                    : 'rounded-full bg-sunken px-2 py-0.5 text-caption font-medium text-ink-muted'
                }
              >
                {c.connected ? 'Connected' : 'Off'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
