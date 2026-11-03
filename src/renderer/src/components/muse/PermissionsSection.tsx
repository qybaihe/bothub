import { useCallback, useEffect, useState } from 'react'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

type DefaultMode = 'auto_allow' | 'always_ask' | string

type PermState = {
  networkDefault?: DefaultMode
  connectorDefault?: DefaultMode
  raw: Record<string, unknown>
  rows: Array<{ key: string; label: string; value: string }>
}

function pickDefaults(raw: unknown): PermState {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const nested =
    root['settings'] && typeof root['settings'] === 'object'
      ? (root['settings'] as Record<string, unknown>)
      : root['defaults'] && typeof root['defaults'] === 'object'
        ? (root['defaults'] as Record<string, unknown>)
        : root
  const networkDefault = String(
    nested['network_default'] ?? nested['networkDefault'] ?? root['network_default'] ?? root['networkDefault'] ?? ''
  )
  const connectorDefault = String(
    nested['connector_default'] ??
      nested['connectorDefault'] ??
      root['connector_default'] ??
      root['connectorDefault'] ??
      ''
  )
  const rows: Array<{ key: string; label: string; value: string }> = []
  const push = (key: string, value: unknown) => {
    if (value == null) return
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) push(`${key}.${k}`, v)
      return
    }
    rows.push({ key, label: key, value: String(value).slice(0, 200) })
  }
  for (const [k, v] of Object.entries(root)) {
    if (
      ['network_default', 'networkDefault', 'connector_default', 'connectorDefault', 'settings', 'defaults'].includes(
        k
      )
    )
      continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') push(k, v)
  }
  return {
    networkDefault: networkDefault || undefined,
    connectorDefault: connectorDefault || undefined,
    raw: root,
    rows: rows.slice(0, 30)
  }
}

const MODES: Array<{ value: 'auto_allow' | 'always_ask'; label: () => string }> = [
  { value: 'always_ask', label: () => t('Always ask') },
  { value: 'auto_allow', label: () => t('Auto allow') }
]

export function PermissionsSection({ accountId }: { accountId: string }) {
  const [state, setState] = useState<PermState>({ raw: {}, rows: [] })
  const [network, setNetwork] = useState<'auto_allow' | 'always_ask' | ''>('')
  const [connector, setConnector] = useState<'auto_allow' | 'always_ask' | ''>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [hint, setHint] = useState<string>()
  const [unavailable, setUnavailable] = useState(false)
  const [canWrite, setCanWrite] = useState(false)
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
      const next = pickDefaults(raw)
      setState(next)
      const n = next.networkDefault
      const c = next.connectorDefault
      setNetwork(n === 'auto_allow' || n === 'always_ask' ? n : '')
      setConnector(c === 'auto_allow' || c === 'always_ask' ? c : '')
      setCanWrite(Boolean(n || c || (raw && typeof raw === 'object')))
      if (!next.networkDefault && !next.connectorDefault && next.rows.length === 0) setUnavailable(true)
    } catch (err) {
      setState({ raw: {}, rows: [] })
      setError(err instanceof Error ? err.message : String(err))
      setUnavailable(true)
      setCanWrite(false)
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy' || status === 'attention') void refresh()
  }, [refresh, status])

  const save = async () => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    // Explicit user click only — never auto-approve / never silent PATCH.
    setSaving(true)
    setError(undefined)
    setHint(undefined)
    try {
      const body: Record<string, unknown> = {
        ...state.raw,
        network_default: network || state.networkDefault,
        connector_default: connector || state.connectorDefault
      }
      // Official GAPS.md / JS: defaults auto_allow | always_ask on permissions.settings.update
      await muse.rpc({ accountId, method: 'permissions.settings.update', params: body })
      setHint(t('Permissions saved'))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      title={t('Permissions')}
      count={state.rows.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="px-3 pt-2 text-[12px] text-status-error">{error}</p>}
      {hint && <p className="px-3 pt-2 text-[12px] text-ink-secondary">{hint}</p>}
      {unavailable && !canWrite ? (
        <div className="px-3 pb-2">
          <EmptyLine>{t('Permissions unavailable')}</EmptyLine>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-3 pb-2 pt-1">
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="font-medium text-ink">{t('Network default')}</span>
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value as typeof network)}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
            >
              <option value="">{t('Permissions unavailable')}</option>
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label()}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="font-medium text-ink">{t('Connector default')}</span>
            <select
              value={connector}
              onChange={(e) => setConnector(e.target.value as typeof connector)}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
            >
              <option value="">{t('Permissions unavailable')}</option>
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label()}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={saving || (!network && !connector)}
            onClick={() => void save()}
          >
            {t('Save permissions')}
          </Button>
          {state.rows.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1">
              {state.rows.map((r) => (
                <li key={r.key} className="flex justify-between gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-[12px]">
                  <span className="truncate font-medium text-ink">{r.label}</span>
                  <span className="max-w-[55%] truncate text-ink-secondary" title={r.value}>
                    {r.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  )
}
