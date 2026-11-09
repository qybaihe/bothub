import { useCallback, useEffect, useState } from 'react'
import { Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

type ActivityLogItem = {
  id: string
  title: string
  kind?: string
  status?: string
  atMs?: number
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function parseActivityList(raw: unknown): ActivityLogItem[] {
  const root = asObj(raw) || {}
  const list =
    (Array.isArray(root['activities']) && root['activities']) ||
    (Array.isArray(root['items']) && root['items']) ||
    (Array.isArray(root['entries']) && root['entries']) ||
    (Array.isArray(raw) ? raw : [])
  const out: ActivityLogItem[] = []
  for (const row of list.slice(0, 25)) {
    const o = asObj(row)
    if (!o) continue
    const id = String(o['id'] ?? o['activity_id'] ?? out.length)
    const title = String(o['title'] ?? o['summary'] ?? o['description'] ?? o['activity_text'] ?? o['kind'] ?? id)
    out.push({
      id,
      title,
      kind: o['owner_kind'] ? String(o['owner_kind']) : o['kind'] ? String(o['kind']) : undefined,
      status: o['status'] ? String(o['status']) : undefined,
      atMs: typeof o['created_at_ms'] === 'number' ? o['created_at_ms'] : typeof o['ts_ms'] === 'number' ? o['ts_ms'] : undefined
    })
  }
  return out
}

/**
 * Muse Agent Config, Model, Identity, VM Health, Subagents & Activity Log.
 */
export function AgentDiagnosticSection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [hint, setHint] = useState<string>()
  const [modelName, setModelName] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [identityInfo, setIdentityInfo] = useState<Record<string, unknown> | null>(null)
  const [vmHealth, setVmHealth] = useState<string>()
  const [subagentsCount, setSubagentsCount] = useState<number>(0)
  const [activities, setActivities] = useState<ActivityLogItem[]>([])

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setLoading(true)
    setError(undefined)
    try {
      const [modRaw, idRaw, healthRaw, subRaw, actRaw] = await Promise.all([
        muse.rpc({ accountId, method: 'model.get', params: {} }).catch(() => null),
        muse.rpc({ accountId, method: 'identity', params: {} }).catch(() => null),
        muse.rpc({ accountId, method: 'vm.health', params: {} }).catch(() => null),
        muse.rpc({ accountId, method: 'subagents.list', params: {} }).catch(() => null),
        muse.rpc({ accountId, method: 'activity.list', params: { limit: 20 } }).catch(() => null)
      ])
      if (modRaw && typeof modRaw === 'object') {
        const m = modRaw as Record<string, unknown>
        const cur = String(m['model'] ?? m['current_model'] ?? m['id'] ?? m['name'] ?? '')
        if (cur) setModelName(cur)
        const list = m['models'] ?? m['available_models'] ?? m['options']
        if (Array.isArray(list)) {
          setAvailableModels(
            list
              .map((x) => (typeof x === 'string' ? x : String(asObj(x)?.['id'] ?? asObj(x)?.['name'] ?? '')))
              .filter(Boolean)
          )
        }
      }
      if (idRaw && typeof idRaw === 'object') {
        setIdentityInfo(idRaw as Record<string, unknown>)
      }
      if (healthRaw) {
        const h = asObj(healthRaw)
        setVmHealth(h ? String(h['status'] ?? h['state'] ?? JSON.stringify(h).slice(0, 80)) : String(healthRaw))
      }
      if (subRaw && typeof subRaw === 'object') {
        const s = subRaw as Record<string, unknown>
        const arr = s['subagents'] ?? s['items'] ?? (Array.isArray(subRaw) ? subRaw : [])
        setSubagentsCount(Array.isArray(arr) ? arr.length : 0)
      }
      setActivities(actRaw ? parseActivityList(actRaw) : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy' || status === 'attention') void refresh()
  }, [refresh, status])

  const saveModel = async () => {
    const m = modelName.trim()
    if (!m) return
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setSaving(true)
    setError(undefined)
    setHint(undefined)
    try {
      await muse.rpc({ accountId, method: 'model.set', params: { model: m, id: m } })
      setHint('模型已更新')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const agentName = identityInfo ? String(identityInfo['display_name'] ?? identityInfo['name'] ?? '') : ''

  return (
    <Section
      title="模型与运行状态"
      count={activities.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2.5 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        {hint && <p className="text-ink-secondary">{hint}</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-hover/60 px-2.5 py-1.5 text-[11px]">
          <span>
            <span className="text-ink-muted">VM </span>
            <span className="font-mono text-ink">{vmHealth || 'OK'}</span>
          </span>
          {agentName && (
            <span>
              <span className="text-ink-muted">身份 </span>
              <span className="text-ink">{agentName}</span>
            </span>
          )}
          <span>
            <span className="text-ink-muted">子代理 </span>
            <span className="text-ink">{subagentsCount}</span>
          </span>
        </div>

        <div className="flex gap-1.5">
          {availableModels.length > 0 ? (
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-[12px] text-ink"
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <TextInput
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="默认模型"
              aria-label="Model"
              className="h-7 flex-1 text-[12px]"
            />
          )}
          <Button size="sm" variant="secondary" disabled={saving || !modelName.trim()} onClick={() => void saveModel()}>
            {t('Save')}
          </Button>
        </div>

        {activities.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              最近活动
            </p>
            <ul className="divide-y divide-line max-h-48 overflow-y-auto">
              {activities.map((a) => (
                <li key={a.id} className="py-1.5 text-[11.5px]">
                  <p className="truncate font-medium text-ink">{a.title}</p>
                  {(a.kind || a.status) && (
                    <p className="text-[10.5px] text-ink-muted">{[a.kind, a.status].filter(Boolean).join(' · ')}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  )
}
