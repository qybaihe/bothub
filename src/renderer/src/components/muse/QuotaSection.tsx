import { useCallback, useEffect, useState } from 'react'
import type { MuseQuotaSnapshot } from '@shared/ipc'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hover"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-ink/70 transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function QuotaSection({ accountId }: { accountId: string }) {
  const [snap, setSnap] = useState<MuseQuotaSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.refreshQuota) return
    setLoading(true)
    setError(undefined)
    try {
      const next = await muse.refreshQuota(accountId)
      setSnap(next)
      if (next.error) setError(next.error)
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
      if (event.type === 'quota' && event.accountId === accountId) setSnap(event.snapshot)
    })
  }, [accountId])

  const sub = snap?.subscription
  const upgradeLabel = sub?.entryPointCtaLabel || 'Upgrade'

  return (
    <Section title="额度管理" action={<RefreshButton loading={loading} onClick={() => void refresh()} />}>
      {error && <p className="pb-1 text-[12px] text-status-error">{error}</p>}
      {!sub ? (
        <EmptyLine>{loading ? 'Loading usage…' : 'Usage unavailable'}</EmptyLine>
      ) : (
        <div className="flex flex-col gap-3 py-0.5">
          <div>
            <p className="text-[13px] font-medium text-ink">{sub.tier.name}</p>
            {sub.statusSubtitle && <p className="mt-0.5 text-[12px] text-ink-secondary">{sub.statusSubtitle}</p>}
          </div>
          {sub.usage.state === 'METERED' && (
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] text-ink-secondary">{sub.usageRowLabel || 'Usage'}</span>
                <span className="text-[12px] text-ink">
                  {sub.usageRowValueLabel || `${sub.usage.percentUsed}% used`}
                </span>
              </div>
              <ProgressBar value={sub.usage.percentUsed} />
              {sub.usageRowFooter && <p className="mt-1 text-[11px] text-ink-muted">{sub.usageRowFooter}</p>}
            </div>
          )}
          {sub.usage.state === 'UNLIMITED' && <p className="text-[12px] text-ink-secondary">Unlimited usage</p>}
          {(sub.topupRowLabel || sub.topupRowValueLabel) && (
            <div className="rounded-lg bg-hover/60 px-2.5 py-2">
              <p className="text-[12px] font-medium text-ink">{sub.topupRowLabel || 'Additional tokens'}</p>
              {sub.topupRowValueLabel && (
                <p className="mt-0.5 text-[12px] text-ink-secondary">{sub.topupRowValueLabel}</p>
              )}
            </div>
          )}
          {typeof snap?.inviteUsesRemaining === 'number' && (
            <p className="text-[12px] text-ink-secondary">Invite uses left: {snap.inviteUsesRemaining}</p>
          )}
          {snap?.stale && <p className="text-[11px] text-status-attention">Showing last known usage</p>}
          <div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                void getBridge()?.muse?.openExternal?.('https://muse.ai/')
              }}
            >
              {upgradeLabel}
            </Button>
          </div>
        </div>
      )}
    </Section>
  )
}
