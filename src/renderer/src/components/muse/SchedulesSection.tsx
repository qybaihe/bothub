import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MuseSchedule, MuseTaskRun } from '@shared/ipc'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

function formatNext(utc: number | null, tz: string | null): string {
  if (utc == null || utc <= 0) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: tz || undefined
    }).format(new Date(utc * 1000))
  } catch {
    return new Date(utc * 1000).toLocaleString()
  }
}

function ScheduleRow({
  item,
  busyId,
  confirmId,
  onRun,
  onAskDelete,
  onConfirmDelete,
  onHistory
}: {
  item: MuseSchedule
  busyId?: string
  confirmId?: string
  onRun: (id: string) => void
  onAskDelete: (id: string) => void
  onConfirmDelete: (id: string) => void
  onHistory: (id: string) => void
}) {
  const confirming = confirmId === item.id
  return (
    <li className="animate-step-in rounded-lg border border-line/60 bg-surface/40 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{item.title}</p>
          <p className="mt-0.5 text-[12px] text-ink-secondary">{item.cadenceLabel}</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">Next · {formatNext(item.nextRunAtUtc, item.timezone)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-hover px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-secondary">
          {item.enabled ? t('Active') : t('Paused')}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" disabled={busyId === item.id} onClick={() => onRun(item.id)}>
          {t('Run now')}
        </Button>
        <Button size="sm" disabled={busyId === item.id} onClick={() => onHistory(item.id)}>
          {t('History')}
        </Button>
        <Button
          size="sm"
          variant={confirming ? 'primary' : undefined}
          disabled={busyId === item.id}
          onClick={() => (confirming ? onConfirmDelete(item.id) : onAskDelete(item.id))}
        >
          {confirming ? t('Click again to delete') : t('Delete')}
        </Button>
      </div>
    </li>
  )
}

export function SchedulesSection({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<MuseSchedule[]>([])
  const [runs, setRuns] = useState<MuseTaskRun[]>([])
  const [runsFor, setRunsFor] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [busyId, setBusyId] = useState<string>()
  const [confirmId, setConfirmId] = useState<string>()
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.listSchedules) return
    setLoading(true)
    setError(undefined)
    try {
      setItems(await muse.listSchedules(accountId))
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
      if (event.type === 'schedules' && event.accountId === accountId) setItems(event.schedules)
    })
  }, [accountId])

  const { active, paused } = useMemo(() => {
    const visible = items.filter((s) => !s.isHeartbeat)
    return {
      active: visible.filter((s) => s.enabled),
      paused: visible.filter((s) => !s.enabled)
    }
  }, [items])

  const runNow = async (id: string) => {
    const muse = getBridge()?.muse
    if (!muse?.runSchedule) return
    setBusyId(id)
    setError(undefined)
    try {
      await muse.runSchedule(accountId, id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const deleteTask = async (id: string) => {
    const muse = getBridge()?.muse
    if (!muse?.deleteSchedule) return
    setBusyId(id)
    setError(undefined)
    try {
      await muse.deleteSchedule(accountId, id)
      setConfirmId(undefined)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const loadHistory = async (id: string) => {
    const muse = getBridge()?.muse
    if (!muse?.listScheduleRuns) return
    setBusyId(id)
    setError(undefined)
    try {
      setRunsFor(id)
      setRuns(await muse.listScheduleRuns(accountId, id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const renderGroup = (title: string, list: MuseSchedule[]) => (
    <div className="mb-3">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{title}</p>
      {list.length === 0 ? (
        <EmptyLine>{t('None')}</EmptyLine>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((item) => (
            <ScheduleRow
              key={item.id}
              item={item}
              busyId={busyId}
              confirmId={confirmId}
              onRun={(id) => void runNow(id)}
              onAskDelete={setConfirmId}
              onConfirmDelete={(id) => void deleteTask(id)}
              onHistory={(id) => void loadHistory(id)}
            />
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <Section
      title="定时任务"
      count={active.length + paused.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="pb-1 text-[12px] text-status-error">{error}</p>}
      {active.length === 0 && paused.length === 0 ? (
        <EmptyLine>暂无定时任务</EmptyLine>
      ) : (
        <>
          {active.length > 0 && renderGroup(t('Active'), active)}
          {paused.length > 0 && renderGroup(t('Paused'), paused)}
        </>
      )}
      {runsFor && (
        <div className="mt-2 rounded-lg bg-hover/50 px-2.5 py-2">
          <p className="text-[12px] font-medium text-ink">History · {runsFor.slice(0, 8)}…</p>
          {runs.length === 0 ? (
            <EmptyLine>{t('No runs')}</EmptyLine>
          ) : (
            <ul className="mt-1 flex flex-col gap-1">
              {runs.slice(0, 8).map((r) => (
                <li key={r.id} className="text-[11px] text-ink-secondary">
                  {r.status}
                  {r.startedAtUtc ? ` · ${formatNext(r.startedAtUtc, null)}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  )
}
