import { useCallback, useEffect, useState } from 'react'
import { EmptyLine, Section } from '@/components/info/Section'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

type PermRow = { key: string; label: string; value: string }

function flattenSettings(raw: unknown): PermRow[] {
  if (!raw || typeof raw !== 'object') return []
  const root = raw as Record<string, unknown>
  const out: PermRow[] = []
  const push = (key: string, value: unknown, label?: string) => {
    if (value === undefined || value === null) return
    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        push(`${key}.${k}`, v, k)
      }
      return
    }
    const rendered = Array.isArray(value) ? value.map(String).join(', ') : String(value)
    out.push({ key, label: label || key, value: rendered.slice(0, 200) })
  }

  for (const preferred of [
    'network_default',
    'networkDefault',
    'connector_default',
    'connectorDefault',
    'defaults',
    'settings',
    'hitl',
    'active'
  ]) {
    if (preferred in root) push(preferred, root[preferred])
  }
  // Also surface top-level scalars / known leaves
  for (const [k, v] of Object.entries(root)) {
    if (['network_default', 'networkDefault', 'connector_default', 'connectorDefault', 'defaults', 'settings', 'hitl', 'active'].includes(k))
      continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      push(k, v)
    }
  }
  return out.slice(0, 40)
}

export function PermissionsSection({ accountId }: { accountId: string }) {
  const [rows, setRows] = useState<PermRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [unavailable, setUnavailable] = useState(false)
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) {
      setUnavailable(true)
      return
    }
    setLoading(true)
    setError(undefined)
    setUnavailable(false)
    try {
      let raw: unknown
      try {
        raw = await muse.rpc({ accountId, method: 'permissions.settings', params: {} })
      } catch {
        raw = await muse.rpc({ accountId, method: 'egress.permissions.active', params: {} })
      }
      const next = flattenSettings(raw)
      setRows(next)
      if (!next.length) setUnavailable(true)
    } catch (err) {
      setRows([])
      setError(err instanceof Error ? err.message : String(err))
      setUnavailable(true)
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy' || status === 'attention') void refresh()
  }, [refresh, status])

  return (
    <Section
      title={t('Permissions')}
      count={rows.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="px-3 pt-2 text-[12px] text-status-error">{error}</p>}
      {unavailable || rows.length === 0 ? (
        <div className="px-3 pb-2">
          <EmptyLine>{t('Permissions unavailable')}</EmptyLine>
        </div>
      ) : (
        <ul className="flex flex-col gap-1 px-3 pb-2 pt-1">
          {rows.map((r) => (
            <li key={r.key} className="flex items-start justify-between gap-2 rounded-lg bg-surface px-2.5 py-1.5">
              <span className="min-w-0 truncate text-[12px] font-medium text-ink">{r.label}</span>
              <span className="max-w-[55%] shrink-0 truncate text-right text-[12px] text-ink-secondary" title={r.value}>
                {r.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
