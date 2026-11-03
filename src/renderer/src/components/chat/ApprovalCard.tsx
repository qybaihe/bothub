import { useEffect, useState } from 'react'
import { ChevronDown, ShieldAlert } from 'lucide-react'
import { adapterRegistry } from '@adapters/registry'
import type { ApprovalDecision, MuseApproval } from '@adapters/types'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { t } from '@/lib/i18n'
import { useBotStore } from '@/store/botStore'

/** Registrable domain for the "always" note: agent.qq.com → qq.com. Heuristic, display only. */
function baseDomain(host: string): string {
  const parts = host.split('.').filter(Boolean)
  if (parts.length <= 2) return host
  const sld = parts[parts.length - 2]!
  const twoPart = ['com', 'net', 'org', 'gov', 'edu', 'co', 'ac'].includes(sld) && parts[parts.length - 1]!.length === 2
  return parts.slice(twoPart ? -3 : -2).join('.')
}

function str(raw: Record<string, unknown>, key: string): string | undefined {
  const v = raw[key]
  return typeof v === 'string' && v ? v : undefined
}

/** One Sentinel card, in the conversation — mirrors the official Muse permission prompt. Never auto-decides. */
function Card({
  approval,
  busy,
  onDecide
}: {
  approval: MuseApproval
  busy: boolean
  onDecide: (decision: ApprovalDecision) => void
}) {
  const [open, setOpen] = useState(false)
  const raw = (approval.raw ?? {}) as Record<string, unknown>
  const host = approval.host
  const options = approval.decisionOptions?.length ? approval.decisionOptions : (['allow_once', 'allow_always', 'deny'] as ApprovalDecision[])
  const description = str(raw, 'action_description') ?? approval.detail ?? approval.reason
  const title = host ? t('Allow Muse to share information with {host}?', { host }) : approval.title
  const facts: Array<[string, string]> = []
  const method = str(raw, 'method')
  const path = str(raw, 'path')
  if (host) facts.push([t('Destination'), `${str(raw, 'scheme') ?? 'https'}://${host}${path ?? ''}`])
  if (method) facts.push([t('Method'), method])
  if (str(raw, 'display_name')) facts.push([t('Service'), str(raw, 'display_name')!])
  if (approval.reason && approval.reason !== description) facts.push([t('Reason'), approval.reason])
  const preview = raw['payload_preview']
  const label = (d: ApprovalDecision) =>
    d === 'allow_once'
      ? t('Allow once')
      : d === 'allow_session'
        ? t('Allow for this task')
        : d === 'allow_always'
          ? host
            ? t('Always allow this site')
            : t('Always allow')
          : d === 'deny_always'
            ? t('Always deny')
            : t('Deny')

  return (
    <div
      role="alertdialog"
      aria-label={title}
      className="mx-auto mb-2 w-full max-w-[720px] animate-step-in rounded-2xl border border-line-strong bg-surface p-3.5 shadow-card"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-status-attention/12 text-status-attention-ink">
          <ShieldAlert className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-5 font-medium text-ink">{title}</p>
          {description && <p className="mt-0.5 text-[13px] leading-[19px] text-ink-secondary">{description}</p>}
          {(facts.length > 0 || preview != null) && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-1 inline-flex items-center gap-0.5 text-[12px] text-ink-muted hover:text-ink"
            >
              {open ? t('Hide details') : t('Show details')}
              <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
          )}
          {open && (
            <div className="mt-1.5 animate-veil-in rounded-lg bg-sunken px-3 py-2 text-[12px]">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {facts.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-muted">{k}</dt>
                    <dd className="min-w-0 break-all text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              {preview != null && (
                <pre className="mt-1.5 max-h-40 overflow-auto font-mono text-[11.5px] whitespace-pre-wrap text-ink-secondary">
                  {JSON.stringify(preview, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5">
        {options.includes('allow_always') && host && (
          <p className="mr-auto text-[11.5px] text-ink-muted">
            {t('“Always allow” covers {domain} and its subdomains', { domain: baseDomain(host) })}
          </p>
        )}
        {options.map((d) => (
          <Button
            key={d}
            size="sm"
            variant={d === 'allow_once' ? 'primary' : 'secondary'}
            disabled={busy}
            onClick={() => onDecide(d)}
          >
            {label(d)}
          </Button>
        ))}
      </div>
    </div>
  )
}

/** Pending Muse permission requests for the bot's active account, shown above the composer. */
export function ChatApprovals({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [pending, setPending] = useState<MuseApproval[]>([])
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    const adapter = adapterRegistry.get('meta-muse')
    if (!adapter) return
    const unsub = adapter.subscribe((event) => {
      if (event.type === 'approvals' && event.accountId === accountId) setPending(event.pending)
    })
    if (status === 'online' || status === 'busy' || status === 'attention') {
      void adapter.listApprovals?.(accountId).then(setPending).catch(() => {})
    }
    return unsub
  }, [accountId, status])

  if (!pending.length) return null
  const decide = async (id: string, decision: ApprovalDecision) => {
    const adapter = adapterRegistry.get('meta-muse')
    if (!adapter?.decideApproval) return
    setBusyId(id)
    setError(undefined)
    try {
      await adapter.decideApproval(accountId, id, decision)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }
  return (
    <div className="px-4" data-chat-approvals>
      {pending.map((a) => (
        <Card key={a.id} approval={a} busy={busyId === a.id} onDecide={(d) => void decide(a.id, d)} />
      ))}
      {error && <p className="mx-auto mb-2 max-w-[720px] text-[12px] text-status-error">{error}</p>}
    </div>
  )
}
