import { useCallback, useEffect, useState } from 'react'
import { adapterRegistry } from '@adapters/registry'
import type { ApprovalDecision, MuseApproval } from '@adapters/types'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { RefreshButton } from './RefreshButton'
import { useBotStore } from '@/store/botStore'

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
  }, [refresh, status])

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
      title="Approvals"
      count={pending.length}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="pb-1 text-[12px] text-status-error">{error}</p>}
      {pending.length === 0 ? (
        <EmptyLine>No pending approvals</EmptyLine>
      ) : (
        <ul className="flex flex-col gap-2 py-0.5">
          {pending.map((a) => (
            <li key={a.id} className="animate-step-in rounded-lg bg-status-attention/8 p-2.5">
              <p className="text-[13px] font-medium text-ink">{a.title}</p>
              {a.detail && <p className="mt-0.5 text-[12px] text-ink-secondary">{a.detail}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" variant="primary" disabled={busyId === a.id} onClick={() => void decide(a.id, 'allow_once')}>
                  Allow
                </Button>
                <Button size="sm" disabled={busyId === a.id} onClick={() => void decide(a.id, 'deny')}>
                  Deny
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
