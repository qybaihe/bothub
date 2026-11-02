import { useCallback, useEffect, useState } from 'react'
import { adapterRegistry } from '@adapters/registry'
import type { ApprovalDecision, MuseApproval } from '@adapters/types'
import { Loader2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-caption font-medium text-ink-muted">
          <ShieldAlert className="size-3.5 text-status-attention" aria-hidden />
          Sentinel approvals
        </p>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : 'Refresh'}
        </Button>
      </div>
      {error && <p className="text-caption text-status-error-ink">{error}</p>}
      {pending.length === 0 ? (
        <p className="text-caption text-ink-muted">No pending confirmation cards.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pending.map((a) => (
            <li key={a.id} className="rounded-xl border border-status-attention/30 bg-status-attention/5 p-3">
              <p className="text-ui font-medium text-ink">{a.title}</p>
              {a.detail && <p className="mt-0.5 text-caption text-ink-muted">{a.detail}</p>}
              {a.approvalType && <p className="mt-1 text-caption text-ink-faint">{a.approvalType}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  disabled={busyId === a.id}
                  onClick={() => void decide(a.id, 'allow_once')}
                >
                  Allow
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === a.id}
                  onClick={() => void decide(a.id, 'deny')}
                >
                  Deny
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
