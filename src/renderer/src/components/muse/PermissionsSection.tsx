import { useCallback, useEffect, useState } from 'react'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

type DefaultMode = 'auto_allow' | 'always_ask' | string

type ActiveGrant = {
  id: string
  label: string
  scope?: string
  raw: Record<string, unknown>
}

type PermState = {
  networkDefault?: DefaultMode
  connectorDefault?: DefaultMode
  tproxyMode?: string
  mitmMode?: string
  sniRejectionMode?: string
  hitlNetworkEnabled?: boolean
  hitlConnectorsEnabled?: boolean
  activeGrants: ActiveGrant[]
  raw: Record<string, unknown>
  rows: Array<{ key: string; label: string; value: string }>
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function pickDefaults(settingsRaw: unknown, permsRaw: unknown, activeRaw: unknown): PermState {
  const root = asObj(settingsRaw) || {}
  const perms = asObj(permsRaw) || {}
  const activeObj = asObj(activeRaw) || {}
  const nested = asObj(root['settings']) || asObj(root['defaults']) || root
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
  const tproxyMode = String(perms['tproxy_mode'] ?? perms['tproxyMode'] ?? root['tproxy_mode'] ?? '') || undefined
  const mitmMode = String(perms['mitm_always_mode'] ?? perms['mitm_mode'] ?? perms['mitmMode'] ?? root['mitm_mode'] ?? '') || undefined
  const sniRejectionMode = String(perms['sni_rejection_mode'] ?? perms['sniRejectionMode'] ?? root['sni_rejection_mode'] ?? '') || undefined

  const hitl = asObj(perms['hitl']) || perms
  const hitlNetworkEnabled =
    typeof hitl['network_enabled'] === 'boolean'
      ? hitl['network_enabled']
      : typeof hitl['networkEnabled'] === 'boolean'
        ? hitl['networkEnabled']
        : undefined
  const hitlConnectorsEnabled =
    typeof hitl['connectors_enabled'] === 'boolean'
      ? hitl['connectors_enabled']
      : typeof hitl['connectorsEnabled'] === 'boolean'
        ? hitl['connectorsEnabled']
        : undefined

  const activeList =
    (Array.isArray(activeObj['grants']) && activeObj['grants']) ||
    (Array.isArray(activeObj['active']) && activeObj['active']) ||
    (Array.isArray(activeObj['rules']) && activeObj['rules']) ||
    (Array.isArray(activeObj['items']) && activeObj['items']) ||
    (Array.isArray(activeRaw) ? activeRaw : [])
  const activeGrants: ActiveGrant[] = []
  for (const row of activeList.slice(0, 30)) {
    const o = asObj(row)
    if (!o) continue
    const id = String(o['id'] ?? o['grant_id'] ?? o['rule_id'] ?? o['host'] ?? o['domain'] ?? activeGrants.length)
    const label = String(o['host'] ?? o['domain'] ?? o['connector'] ?? o['entity'] ?? o['title'] ?? id)
    const scope = String(o['mode'] ?? o['decision'] ?? o['scope'] ?? o['kind'] ?? '') || undefined
    activeGrants.push({ id, label, scope, raw: o })
  }

  const rows: Array<{ key: string; label: string; value: string }> = []
  const merged = { ...perms, ...root }
  const push = (key: string, value: unknown) => {
    if (value == null) return
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) push(`${key}.${k}`, v)
      return
    }
    rows.push({ key, label: key, value: String(value).slice(0, 200) })
  }
  for (const [k, v] of Object.entries(merged)) {
    if (
      [
        'network_default',
        'networkDefault',
        'connector_default',
        'connectorDefault',
        'settings',
        'defaults',
        'tproxy_mode',
        'mitm_mode',
        'mitm_always_mode',
        'sni_rejection_mode'
      ].includes(k)
    )
      continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') push(k, v)
  }
  return {
    networkDefault: networkDefault || undefined,
    connectorDefault: connectorDefault || undefined,
    tproxyMode,
    mitmMode,
    sniRejectionMode,
    hitlNetworkEnabled,
    hitlConnectorsEnabled,
    activeGrants,
    raw: root,
    rows: rows.slice(0, 25)
  }
}

const MODES: Array<{ value: 'auto_allow' | 'always_ask'; label: () => string }> = [
  { value: 'always_ask', label: () => t('Always ask') },
  { value: 'auto_allow', label: () => t('Auto allow') }
]

export function PermissionsSection({ accountId }: { accountId: string }) {
  const [state, setState] = useState<PermState>({ activeGrants: [], raw: {}, rows: [] })
  const [network, setNetwork] = useState<'auto_allow' | 'always_ask' | ''>('')
  const [connector, setConnector] = useState<'auto_allow' | 'always_ask' | ''>('')
  const [ruleHost, setRuleHost] = useState('')
  const [ruleMode, setRuleMode] = useState<'allow' | 'ask' | 'deny'>('allow')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
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
      const [settingsRaw, permsRaw, activeRaw] = await Promise.all([
        muse.rpc({ accountId, method: 'permissions.settings', params: {} }).catch(() => null),
        muse.rpc({ accountId, method: 'egress.permissions', params: {} }).catch(() => null),
        muse.rpc({ accountId, method: 'egress.permissions.active', params: {} }).catch(() => null)
      ])
      if (!settingsRaw && !permsRaw && !activeRaw) {
        setUnavailable(true)
        setCanWrite(false)
        return
      }
      const next = pickDefaults(settingsRaw, permsRaw, activeRaw)
      setState(next)
      const n = next.networkDefault
      const c = next.connectorDefault
      setNetwork(n === 'auto_allow' || n === 'always_ask' ? n : '')
      setConnector(c === 'auto_allow' || c === 'always_ask' ? c : '')
      setCanWrite(Boolean(n || c || settingsRaw || permsRaw))
    } catch (err) {
      setState({ activeGrants: [], raw: {}, rows: [] })
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
    setSaving(true)
    setError(undefined)
    setHint(undefined)
    try {
      const body: Record<string, unknown> = {
        ...state.raw,
        network_default: network || state.networkDefault,
        connector_default: connector || state.connectorDefault
      }
      await muse.rpc({ accountId, method: 'permissions.settings.update', params: body })
      setHint(t('Permissions saved'))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const patchPolicy = async (method: string, params: Record<string, unknown>, msg: string) => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setSaving(true)
    setError(undefined)
    setHint(undefined)
    try {
      await muse.rpc({ accountId, method, params })
      setHint(msg)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const addNetworkRule = () => {
    const host = ruleHost.trim().toLowerCase()
    if (!host) return
    void patchPolicy(
      'egress.permissions.network_rules',
      {
        rules: [{ kind: 'network_rule', host, destination_domain: host, mode: ruleMode }],
        host,
        destination_domain: host,
        mode: ruleMode
      },
      t('Network rule updated')
    ).then(() => setRuleHost(''))
  }

  const revokeGrant = (g: ActiveGrant) => {
    void patchPolicy(
      'egress.permissions.revoke',
      { ...g.raw, id: g.id, grant_id: g.id },
      t('Grant revoked')
    )
  }

  const resetAllPermissions = () => {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    setConfirmReset(false)
    void patchPolicy('egress.permissions.reset', {}, t('All custom permissions reset'))
  }

  return (
    <Section
      title={t('Permissions')}
      count={state.activeGrants.length || state.rows.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="pb-1 text-[12px] text-status-error">{error}</p>}
      {hint && <p className="pb-1 text-[12px] text-ink-secondary">{hint}</p>}
      {unavailable && !canWrite ? (
        <EmptyLine>{t('Permissions unavailable')}</EmptyLine>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="font-medium text-ink">{t('Network default')}</span>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value as typeof network)}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-[12px] text-ink"
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
                className="rounded-lg border border-line bg-surface px-2 py-1 text-[12px] text-ink"
              >
                <option value="">{t('Permissions unavailable')}</option>
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={saving || (!network && !connector)}
            onClick={() => void save()}
          >
            {t('Save permissions')}
          </Button>

          {/* VM Egress Policy */}
          <div className="rounded-lg bg-hover/60 p-2 text-[12px]">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink">Transparent Proxy</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() =>
                    void patchPolicy(
                      'egress.permissions.tproxy',
                      { mode: state.tproxyMode === 'enabled' ? 'disabled' : 'enabled', actor: 'user' },
                      'tproxy updated'
                    )
                  }
                >
                  {state.tproxyMode || 'toggle'}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink">TLS MITM</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() =>
                    void patchPolicy(
                      'egress.permissions.mitm',
                      { mode: state.mitmMode === 'enabled' ? 'disabled' : 'enabled', actor: 'user' },
                      'MITM updated'
                    )
                  }
                >
                  {state.mitmMode || 'toggle'}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink">SNI Rejection</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() =>
                    void patchPolicy(
                      'egress.permissions.sni_rejection',
                      { mode: state.sniRejectionMode === 'enabled' ? 'disabled' : 'enabled', actor: 'user' },
                      'SNI rejection updated'
                    )
                  }
                >
                  {state.sniRejectionMode || 'toggle'}
                </Button>
              </div>
            </div>
          </div>

          {/* Add network rule */}
          <div className="flex gap-1.5">
            <TextInput
              value={ruleHost}
              onChange={(e) => setRuleHost(e.target.value)}
              placeholder="添加域名规则 (example.com)"
              aria-label="Host"
              className="h-7 flex-1 text-[12px]"
            />
            <select
              value={ruleMode}
              onChange={(e) => setRuleMode(e.target.value as typeof ruleMode)}
              className="rounded-lg border border-line bg-surface px-2 text-[12px] text-ink"
            >
              <option value="allow">allow</option>
              <option value="ask">ask</option>
              <option value="deny">deny</option>
            </select>
            <Button size="sm" variant="secondary" disabled={saving || !ruleHost.trim()} onClick={addNetworkRule}>
              {t('Add')}
            </Button>
          </div>

          {/* Active grants */}
          {state.activeGrants.length > 0 && (
            <ul className="divide-y divide-line">
              {state.activeGrants.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                  <span className="min-w-0 truncate text-ink">
                    {g.label}
                    {g.scope ? <span className="text-ink-muted"> · {g.scope}</span> : null}
                  </span>
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => revokeGrant(g)}>
                    {t('Revoke')}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end">
            <Button
              size="sm"
              variant={confirmReset ? 'danger-confirm' : 'ghost'}
              disabled={saving}
              onClick={resetAllPermissions}
            >
              {confirmReset ? t('Click again to reset all') : t('Reset custom rules')}
            </Button>
          </div>
        </div>
      )}
    </Section>
  )
}
