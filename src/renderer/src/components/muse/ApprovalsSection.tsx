import { useCallback, useEffect, useState } from 'react'
import { adapterRegistry } from '@adapters/registry'
import type { ApprovalDecision, MuseApproval } from '@adapters/types'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { RefreshButton } from './RefreshButton'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

const DEFAULT_DECISIONS: ApprovalDecision[] = ['allow_once', 'allow_always', 'deny']

function labelFor(d: ApprovalDecision): string {
  switch (d) {
    case 'allow_once':
      return t('Allow once')
    case 'allow_session':
      return t('Allow for this task')
    case 'allow_always':
      return t('Always allow this site')
    case 'deny':
      return t('Deny')
    case 'deny_always':
      return t('Always deny')
    default:
      return d
  }
}

export function ApprovalsSection({ accountId }: { accountId: string }) {
  const [pending, setPending] = useState<MuseApproval[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [busyId, setBusyId] = useState<string>()
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const refresh = useCallback(async () => {
    const adapter = adapterRegistry.get('meta-muse')
    if (!adapter?.listApprovals) return
    setLoading(true)
    setError(undefined)
    try {
      setPending(await adapter.listApprovals(accountId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    void refresh()
    const adapter = adapterRegistry.get('meta-muse')
    if (!adapter?.subscribe) return
    return adapter.subscribe((event) => {
      if (event.type === 'approvals' && event.accountId === accountId) {
        setPending(event.pending)
      }
    })
  }, [refresh, status, accountId])

  const decide = async (approvalId: string, decision: ApprovalDecision) => {
    const adapter = adapterRegistry.get('meta-muse')
    if (!adapter?.decideApproval) return
    setBusyId(approvalId)
    try {
      await adapter.decideApproval(accountId, approvalId, decision)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  return (
    <Section
      title={t('Approvals')}
      count={pending.length}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="pb-1 text-[12px] text-status-error">{error}</p>}
      {pending.length === 0 ? (
        <EmptyLine>{t('No pending approvals')}</EmptyLine>
      ) : (
        <ul className="flex flex-col gap-2 py-0.5">
          {pending.map((a) => {
            const opts = a.decisionOptions?.length ? a.decisionOptions : DEFAULT_DECISIONS
            return (
              <li key={a.id} className="animate-step-in rounded-lg bg-status-attention/8 p-2.5">
                <p className="text-[13px] font-medium text-ink">
                  {a.host
                    ? t('Allow Muse to share information with {host}?', { host: a.host })
                    : a.title}
                </p>
                {a.detail && <p className="mt-0.5 text-[12px] text-ink-secondary">{a.detail}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {opts.map((d, i) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={i === 0 ? 'primary' : 'secondary'}
                      disabled={busyId === a.id}
                      onClick={() => void decide(a.id, d)}
                    >
                      {labelFor(d)}
                    </Button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
