import { useCallback, useEffect, useState } from 'react'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

type SkillRow = { id: string; name: string; disabled: boolean; detail?: string }

function asSkills(raw: unknown): SkillRow[] {
  if (!raw || typeof raw !== 'object') return []
  const root = raw as Record<string, unknown>
  const lists = [root['skills'], root['items'], root['results'], root['entries']]
  let arr: unknown[] = []
  for (const c of lists) {
    if (Array.isArray(c)) {
      arr = c
      break
    }
  }
  if (!arr.length && Array.isArray(raw)) arr = raw
  const out: SkillRow[] = []
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const id = String(o['id'] ?? o['skill_id'] ?? o['name'] ?? out.length)
    const name = String(o['name'] ?? o['title'] ?? o['label'] ?? id)
    const disabled = Boolean(o['disabled'] ?? o['is_disabled'] ?? false)
    const detail = o['description']
      ? String(o['description']).slice(0, 160)
      : o['summary']
        ? String(o['summary']).slice(0, 160)
        : undefined
    out.push({ id, name, disabled, detail })
  }
  return out
}

export function SkillsSection({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<SkillRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string>()
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
      const raw = await muse.rpc({ accountId, method: 'skills.list', params: {} })
      const next = asSkills(raw)
      setItems(next)
      if (!next.length && (raw === null || raw === undefined || raw === '')) {
        setUnavailable(true)
      }
    } catch (err) {
      setItems([])
      setError(err instanceof Error ? err.message : String(err))
      setUnavailable(true)
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy' || status === 'attention') void refresh()
  }, [refresh, status])

  const setDisabled = async (id: string, disabled: boolean) => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setBusyId(id)
    setError(undefined)
    try {
      await muse.rpc({
        accountId,
        method: 'skills.set_disabled',
        params: { skill_id: id, id, disabled }
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  return (
    <Section
      title={t('Muse skills')}
      count={items.length || undefined}
      flush={items.length > 0}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="px-3 pt-2 text-[12px] text-status-error">{error}</p>}
      {unavailable && items.length === 0 ? (
        <div className="px-3 pb-2">
          <EmptyLine>{t('Skills unavailable')}</EmptyLine>
        </div>
      ) : items.length === 0 ? (
        <div className="px-3 pb-2">
          <EmptyLine>{t('No skills')}</EmptyLine>
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-2 border-b border-line px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{s.name}</p>
                {s.detail ? <p className="mt-0.5 text-[12px] text-ink-secondary">{s.detail}</p> : null}
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {s.disabled ? t('Disabled') : t('Enabled')}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={busyId === s.id}
                onClick={() => void setDisabled(s.id, !s.disabled)}
              >
                {s.disabled ? t('Enable') : t('Disable')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
