import { useCallback, useEffect, useState } from 'react'
import { adapterRegistry } from '@adapters/registry'
import type { MuseConnector } from '@adapters/types'
import { EmptyLine, Section } from '@/components/info/Section'
import { RefreshButton } from './RefreshButton'
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
    <Section
      title="Connectors"
      count={items.length}
      flush={items.length > 0}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="px-3 pt-2 text-[12px] text-status-error">{error}</p>}
      {items.length === 0 ? (
        <EmptyLine>No connectors</EmptyLine>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2.5" title={c.description}>
              <p className="min-w-0 truncate text-[13px] text-ink">{c.name}</p>
              <span
                className={
                  c.connected
                    ? 'shrink-0 rounded-[4px] bg-status-online/10 px-1.5 text-[11px] leading-4 text-status-online-ink'
                    : 'shrink-0 rounded-[4px] bg-sunken px-1.5 text-[11px] leading-4 text-ink-muted'
                }
              >
                {c.connected ? 'On' : 'Off'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
