import { useCallback, useEffect, useState } from 'react'
import { adapterRegistry } from '@adapters/registry'
import type { ApprovalDecision, MuseApproval } from '@adapters/types'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { RefreshButton } from './RefreshButton'
import { getBridge } from '@/lib/bridge'
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

type HistoryItem = {
  id: string
  title: string
  decision: string
  host?: string
  atMs?: number
}

function parseHistory(raw: unknown): HistoryItem[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>
  const list =
    (Array.isArray(o['history']) && o['history']) ||
    (Array.isArray(o['items']) && o['items']) ||
    (Array.isArray(o['approvals']) && o['approvals']) ||
    (Array.isArray(o['recent_approvals']) && o['recent_approvals']) ||
    (Array.isArray(raw) ? raw : [])
  const out: HistoryItem[] = []
  for (const row of list.slice(0, 20)) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const display = (r['display'] as Record<string, unknown> | undefined) ?? {}
    const id = String(r['approval_id'] ?? r['id'] ?? out.length)
    const title = String(display['title'] ?? r['action_description'] ?? r['title'] ?? r['host'] ?? id)
    const decision = String(r['decision'] ?? r['status'] ?? 'decided')
    out.push({
      id,
      title,
      decision,
      host: typeof r['host'] === 'string' ? r['host'] : undefined,
      atMs: typeof r['decided_at_ms'] === 'number' ? r['decided_at_ms'] : typeof r['updated_at_ms'] === 'number' ? r['updated_at_ms'] : undefined
    })
  }
  return out
}

export function ApprovalsSection({ accountId }: { accountId: string }) {
  const [pending, setPending] = useState<MuseApproval[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [busyId, setBusyId] = useState<string>()
  const [editId, setEditId] = useState<string>()
  const [editText, setEditText] = useState('')
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const refresh = useCallback(async () => {
    const adapter = adapterRegistry.get('meta-muse')
    if (!adapter?.listApprovals) return
    setLoading(true)
    setError(undefined)
    try {
      setPending(await adapter.listApprovals(accountId))
      if (showHistory) {
        const muse = getBridge()?.muse
        if (muse?.rpc) {
          const histRaw = await muse.rpc({ accountId, method: 'egress.approval.history', params: {} }).catch(() => null)
          setHistory(parseHistory(histRaw))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId, showHistory])

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

  const openEditableMessage = async (approvalId: string) => {
    if (editId === approvalId) {
      setEditId(undefined)
      return
    }
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setBusyId(approvalId)
    try {
      const raw = await muse.rpc({
        accountId,
        method: 'egress.approval.editable_message',
        params: { approval_id: approvalId }
      })
      const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      setEditText(String(o['message'] ?? o['body'] ?? o['text'] ?? JSON.stringify(raw, null, 2)))
      setEditId(approvalId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const saveEditableMessage = async (approvalId: string) => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setBusyId(approvalId)
    try {
      await muse.rpc({
        accountId,
        method: 'egress.approval.edit_message',
        params: { approval_id: approvalId, message: editText, text: editText }
      })
      setEditId(undefined)
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
      <div className="mb-1.5 flex items-center justify-end">
        <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? t('Hide history') : t('History')}
        </Button>
      </div>
      {pending.length === 0 ? (
        <EmptyLine>{t('No pending approvals')}</EmptyLine>
      ) : (
        <ul className="flex flex-col gap-2 py-0.5">
          {pending.map((a) => {
            const opts = a.decisionOptions?.length ? a.decisionOptions : DEFAULT_DECISIONS
            const raw = (a.raw ?? {}) as Record<string, unknown>
            const isEditable = Boolean(raw['editable_message'] || raw['is_editable'])
            return (
              <li key={a.id} className="animate-step-in rounded-lg bg-status-attention/8 p-2.5">
                <p className="text-[13px] font-medium text-ink">
                  {a.host
                    ? t('Allow Muse to share information with {host}?', { host: a.host })
                    : a.title}
                </p>
                {a.detail && <p className="mt-0.5 text-[12px] text-ink-secondary">{a.detail}</p>}
                {editId === a.id && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-line bg-surface p-2 text-[12px] text-ink outline-none"
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="primary" disabled={busyId === a.id} onClick={() => void saveEditableMessage(a.id)}>
                        {t('Save')}
                      </Button>
                      <Button size="sm" onClick={() => setEditId(undefined)}>
                        {t('Cancel')}
                      </Button>
                    </div>
                  </div>
                )}
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
                  {isEditable && (
                    <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => void openEditableMessage(a.id)}>
                      {t('Edit message')}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {showHistory && (
        <div className="mt-2 border-t border-line pt-2">
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{t('Approval history')}</p>
          {history.length === 0 ? (
            <EmptyLine>{t('No history')}</EmptyLine>
          ) : (
            <ul className="flex flex-col gap-1">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 rounded bg-surface px-2 py-1 text-[11px]">
                  <span className="min-w-0 truncate text-ink">{h.host || h.title}</span>
                  <span className="shrink-0 font-mono text-ink-secondary">{h.decision}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  )
}
