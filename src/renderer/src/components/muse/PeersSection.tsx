import { useCallback, useEffect, useState } from 'react'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

type PeerContact = {
  museId: string
  displayName: string
  trustPreset?: string
  relationshipGenerationId?: string
  relationshipRevision?: number
  relationshipStartedAtMs?: number
  requestExpiresAtMs?: number
}

type PeerInvite = {
  inviteId: string
  fragment?: string
  expiresAtMs?: number
  inviteB64?: string
}

type PeerInbox = {
  deliveryId: string
  senderDisplayName?: string
  inviteB64?: string
}

type PeerRequest = {
  relationshipGenerationId: string
  direction?: string
  status?: string
  displayName?: string
}

type PeersStatus = {
  supported?: boolean
  availability?: string
  chatPairing?: boolean
  allowedOperations: string[]
  raw: Record<string, unknown>
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function parseStatus(raw: unknown): PeersStatus {
  const root = asObj(raw) || {}
  const nested = asObj(root['status']) || asObj(root['result']) || root
  const supported =
    nested['supported'] === true ||
    nested['availability'] === 'enabled' ||
    nested['availability'] === 'available'
  const opsRaw = nested['allowed_operations'] ?? nested['allowedOperations']
  const allowedOperations = Array.isArray(opsRaw) ? opsRaw.map((x) => str(x)).filter(Boolean) : []
  return {
    supported: supported || allowedOperations.length > 0 || Object.keys(nested).length > 0,
    availability: str(nested['availability']) || undefined,
    chatPairing: Boolean(nested['chat_pairing'] ?? nested['chatPairing']),
    allowedOperations,
    raw: nested
  }
}

function parseContacts(raw: unknown): PeerContact[] {
  const root = asObj(raw) || {}
  const list =
    (Array.isArray(root['peers']) && root['peers']) ||
    (Array.isArray(root['contacts']) && root['contacts']) ||
    (Array.isArray(root['items']) && root['items']) ||
    (Array.isArray(raw) ? raw : [])
  const out: PeerContact[] = []
  for (const row of list) {
    const o = asObj(row)
    if (!o) continue
    const museId = str(o['muse_id'] || o['museId'] || o['id'])
    if (!museId) continue
    out.push({
      museId,
      displayName: str(o['display_name'] || o['displayName'] || o['name'] || museId),
      trustPreset: str(o['trust_preset'] || o['trustPreset']) || undefined,
      relationshipGenerationId: str(o['relationship_generation_id'] || o['relationshipGenerationId']) || undefined,
      relationshipRevision:
        typeof o['relationship_revision'] === 'number'
          ? o['relationship_revision']
          : typeof o['relationshipRevision'] === 'number'
            ? (o['relationshipRevision'] as number)
            : undefined,
      relationshipStartedAtMs:
        typeof o['relationship_started_at_ms'] === 'number'
          ? (o['relationship_started_at_ms'] as number)
          : typeof o['relationshipStartedAtMs'] === 'number'
            ? (o['relationshipStartedAtMs'] as number)
            : undefined,
      requestExpiresAtMs:
        typeof o['request_expires_at_ms'] === 'number'
          ? (o['request_expires_at_ms'] as number)
          : typeof o['requestExpiresAtMs'] === 'number'
            ? (o['requestExpiresAtMs'] as number)
            : undefined
    })
  }
  return out
}

function parseInvites(raw: unknown): PeerInvite[] {
  const root = asObj(raw) || {}
  const list =
    (Array.isArray(root['invites']) && root['invites']) ||
    (Array.isArray(root['items']) && root['items']) ||
    (Array.isArray(raw) ? raw : [])
  const out: PeerInvite[] = []
  for (const row of list) {
    const o = asObj(row)
    if (!o) continue
    const inviteId = str(o['invite_id_b64'] || o['invite_id'] || o['inviteId'] || o['id'])
    if (!inviteId) continue
    out.push({
      inviteId,
      fragment: str(o['fragment']) || undefined,
      inviteB64: str(o['invite_b64'] || o['inviteB64']) || undefined,
      expiresAtMs:
        typeof o['expires_at_ms'] === 'number'
          ? (o['expires_at_ms'] as number)
          : typeof o['expiresAtMs'] === 'number'
            ? (o['expiresAtMs'] as number)
            : undefined
    })
  }
  return out
}

function parseInbox(raw: unknown): PeerInbox[] {
  const root = asObj(raw) || {}
  const list =
    (Array.isArray(root['deliveries']) && root['deliveries']) ||
    (Array.isArray(root['inbox']) && root['inbox']) ||
    (Array.isArray(root['items']) && root['items']) ||
    (Array.isArray(raw) ? raw : [])
  const out: PeerInbox[] = []
  for (const row of list) {
    const o = asObj(row)
    if (!o) continue
    const deliveryId = str(o['delivery_id'] || o['deliveryId'] || o['id'])
    if (!deliveryId) continue
    out.push({
      deliveryId,
      senderDisplayName: str(o['sender_display_name'] || o['senderDisplayName'] || o['from']) || undefined,
      inviteB64: str(o['invite_b64'] || o['inviteB64']) || undefined
    })
  }
  return out
}

function parseRequests(raw: unknown): PeerRequest[] {
  const root = asObj(raw) || {}
  const list =
    (Array.isArray(root['requests']) && root['requests']) ||
    (Array.isArray(root['items']) && root['items']) ||
    (Array.isArray(raw) ? raw : [])
  const out: PeerRequest[] = []
  for (const row of list) {
    const o = asObj(row)
    if (!o) continue
    const relationshipGenerationId = str(
      o['relationship_generation_id'] || o['relationshipGenerationId'] || o['id']
    )
    if (!relationshipGenerationId) continue
    out.push({
      relationshipGenerationId,
      direction: str(o['direction']) || undefined,
      status: str(o['status']) || undefined,
      displayName: str(o['display_name'] || o['displayName'] || o['name']) || undefined
    })
  }
  return out
}

function can(ops: string[], name: string): boolean {
  if (!ops.length) return true // unknown catalog — allow attempt; server will refuse
  // If the gateway uses unfamiliar operation ids, don't blank the UI — try and let RPC fail honestly.
  const known = [
    'list_contacts',
    'list_invitations',
    'list_requests',
    'create_invitation',
    'accept_invitation',
    'revoke_invitation',
    'disconnect'
  ]
  if (!ops.some((op) => known.includes(op))) return true
  return ops.includes(name)
}

/**
 * Trusted Network (peers.*) — Members tab.
 * Never auto-accept invites/requests; every mutating action needs an explicit click.
 */
export function PeersSection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [hint, setHint] = useState<string>()
  const [unavailable, setUnavailable] = useState(false)
  const [peersStatus, setPeersStatus] = useState<PeersStatus | null>(null)
  const [contacts, setContacts] = useState<PeerContact[]>([])
  const [invites, setInvites] = useState<PeerInvite[]>([])
  const [inbox, setInbox] = useState<PeerInbox[]>([])
  const [requests, setRequests] = useState<PeerRequest[]>([])
  const [fragment, setFragment] = useState('')
  const [busy, setBusy] = useState<string>()
  const [sasCode, setSasCode] = useState<string>()
  const [confirmDisconnect, setConfirmDisconnect] = useState<string>()

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) {
      setUnavailable(true)
      return
    }
    setLoading(true)
    setError(undefined)
    setHint(undefined)
    try {
      let stRaw: unknown
      try {
        stRaw = await muse.rpc({ accountId, method: 'peers.status', params: {} })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // Class / capability missing — honest empty.
        if (/404|not.?found|unsupported|unknown.?method|class/i.test(msg)) {
          setUnavailable(true)
          setPeersStatus(null)
          setContacts([])
          setInvites([])
          setInbox([])
          setRequests([])
          return
        }
        throw err
      }
      const st = parseStatus(stRaw)
      setPeersStatus(st)
      if (st.supported === false && st.availability && /disabled|unavailable|unsupported/i.test(st.availability)) {
        setUnavailable(true)
        return
      }
      setUnavailable(false)
      const ops = st.allowedOperations
      const [cRaw, iRaw, inRaw, rRaw] = await Promise.all([
        can(ops, 'list_contacts')
          ? muse.rpc({ accountId, method: 'peers.list', params: {} }).catch(() => null)
          : Promise.resolve(null),
        can(ops, 'list_invitations')
          ? muse.rpc({ accountId, method: 'peers.invites.list', params: {} }).catch(() => null)
          : Promise.resolve(null),
        can(ops, 'list_invitations') || can(ops, 'accept_invitation')
          ? muse.rpc({ accountId, method: 'peers.inbox.list', params: {} }).catch(() => null)
          : Promise.resolve(null),
        can(ops, 'list_requests')
          ? muse.rpc({ accountId, method: 'peers.requests.list', params: {} }).catch(() => null)
          : Promise.resolve(null)
      ])
      setContacts(cRaw ? parseContacts(cRaw) : [])
      setInvites(iRaw ? parseInvites(iRaw) : [])
      setInbox(inRaw ? parseInbox(inRaw) : [])
      setRequests(rRaw ? parseRequests(rRaw) : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setUnavailable(true)
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy' || status === 'attention') void refresh()
  }, [refresh, status])

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(undefined)
    setHint(undefined)
    try {
      await fn()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(undefined)
    }
  }

  const createInvite = () =>
    void run('create', async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      const raw = await muse.rpc({ accountId, method: 'peers.invites.create', params: {} })
      const o = asObj(raw) || {}
      const frag = str(o['fragment'])
      const inviteId = str(o['invite_id_b64'] || o['invite_id'] || o['inviteId'])
      setHint(
        frag
          ? t('Invite created — copy fragment below')
          : inviteId
            ? `${t('Invite created')}: ${inviteId}`
            : t('Invite created')
      )
      if (frag) {
        try {
          await navigator.clipboard.writeText(frag)
          setHint(t('Invite fragment copied'))
        } catch {
          /* ignore */
        }
      }
    })

  const revokeInvite = (inviteId: string) =>
    void run(`revoke:${inviteId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      await muse.rpc({ accountId, method: 'peers.invites.revoke', params: { invite_id: inviteId } })
      setHint(t('Invite revoked'))
    })

  const openAndAccept = () =>
    void run('accept', async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      const frag = fragment.trim()
      if (!frag) throw new Error(t('Paste an invite fragment first'))
      // Explicit user click only — never auto-accept.
      await muse.rpc({ accountId, method: 'peers.invites.open', params: { fragment: frag } })
      await muse.rpc({ accountId, method: 'peers.invites.accept', params: { fragment: frag } })
      setFragment('')
      setHint(t('Invite accepted — confirm SAS if prompted'))
    })

  const declineInbox = (deliveryId: string) =>
    void run(`decline:${deliveryId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      await muse.rpc({ accountId, method: 'peers.inbox.decline', params: { delivery_id: deliveryId } })
      setHint(t('Inbox invite declined'))
    })

  const acceptInbox = (item: PeerInbox) =>
    void run(`accept-inbox:${item.deliveryId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      // Explicit click only. Prefer invite_b64 → accept; else delivery_id.
      // Never auto-accept; never call inbox.deliver here (that is outbound).
      await muse.rpc({
        accountId,
        method: 'peers.invites.accept',
        params: item.inviteB64
          ? { invite_b64: item.inviteB64, delivery_id: item.deliveryId }
          : { delivery_id: item.deliveryId }
      })
      setHint(t('Invite accepted — confirm SAS if prompted'))
    })

  const readSas = (relationshipGenerationId: string) =>
    void run(`sas:${relationshipGenerationId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      const raw = await muse.rpc({
        accountId,
        method: 'peers.requests.sas',
        params: { relationship_generation_id: relationshipGenerationId }
      })
      const o = asObj(raw) || {}
      const code = str(o['sas'] || o['code'] || o['safety_code'] || o['safetyCode'] || JSON.stringify(raw).slice(0, 120))
      setSasCode(code)
      setHint(t('Compare this safety code with your peer, then confirm'))
    })

  const confirmSas = (relationshipGenerationId: string) =>
    void run(`sas-confirm:${relationshipGenerationId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      await muse.rpc({
        accountId,
        method: 'peers.requests.sas.confirm',
        params: { relationship_generation_id: relationshipGenerationId }
      })
      setSasCode(undefined)
      setHint(t('Safety code confirmed'))
    })

  const disconnect = (peer: PeerContact) => {
    if (confirmDisconnect !== peer.museId) {
      setConfirmDisconnect(peer.museId)
      return
    }
    void run(`disc:${peer.museId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      if (!peer.relationshipGenerationId) throw new Error(t('Missing relationship ids for disconnect'))
      await muse.rpc({
        accountId,
        method: 'peers.disconnect',
        params: {
          muse_id: peer.museId,
          relationship_generation_id: peer.relationshipGenerationId,
          relationship_revision: peer.relationshipRevision ?? 1,
          relationship_started_at_ms: peer.relationshipStartedAtMs ?? Date.now(),
          request_expires_at_ms: peer.requestExpiresAtMs ?? Date.now() + 60_000
        }
      })
      setConfirmDisconnect(undefined)
      setHint(t('Peer disconnected'))
    })
  }

  const ops = peersStatus?.allowedOperations || []

  return (
    <Section
      title={t('Trusted Network')}
      count={contacts.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="px-3 pt-2 text-[12px] text-status-error">{error}</p>}
      {hint && <p className="px-3 pt-2 text-[12px] text-ink-secondary">{hint}</p>}
      {sasCode && (
        <p className="mx-3 mt-2 rounded-lg bg-sunken px-2.5 py-2 font-mono text-[13px] text-ink">{sasCode}</p>
      )}
      {unavailable ? (
        <div className="px-3 pb-2">
          <EmptyLine>{t('Trusted Network unavailable')}</EmptyLine>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-3 pb-2 pt-1">
          <p className="text-[11px] text-ink-muted">
            {peersStatus?.chatPairing ? t('Chat pairing enabled') : t('Chat pairing unknown / off')}
            {peersStatus?.availability ? ` · ${peersStatus.availability}` : ''}
          </p>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              {t('Contacts')}
            </p>
            {contacts.length === 0 ? (
              <EmptyLine>{t('No Trusted Network contacts')}</EmptyLine>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {contacts.map((p) => (
                  <li key={p.museId} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2.5 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-ink">{p.displayName}</span>
                      <span className="block truncate text-[11px] text-ink-muted">
                        {p.museId}
                        {p.trustPreset ? ` · ${p.trustPreset}` : ''}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy?.startsWith('disc:')}
                      onClick={() => disconnect(p)}
                    >
                      {confirmDisconnect === p.museId ? t('Confirm remove') : t('Remove')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              {t('Outbound invites')}
            </p>
            <div className="mb-2 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={Boolean(busy) || !can(ops, 'create_invitation')}
                onClick={createInvite}
              >
                {t('Create invite')}
              </Button>
            </div>
            {invites.length === 0 ? (
              <EmptyLine>{t('No outbound invites')}</EmptyLine>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {invites.map((inv) => (
                  <li key={inv.inviteId} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2.5 py-2 text-[12px]">
                    <span className="min-w-0 truncate font-mono text-ink">{inv.fragment || inv.inviteId}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === `revoke:${inv.inviteId}`}
                      onClick={() => revokeInvite(inv.inviteId)}
                    >
                      {t('Revoke')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              {t('Accept invite')}
            </p>
            <div className="flex gap-2">
              <TextInput
                value={fragment}
                onChange={(e) => setFragment(e.target.value)}
                placeholder={t('Invite fragment')}
                aria-label={t('Invite fragment')}
                disabled={Boolean(busy)}
              />
              <Button
                size="sm"
                variant="primary"
                disabled={Boolean(busy) || fragment.trim().length < 4 || !can(ops, 'accept_invitation')}
                onClick={openAndAccept}
              >
                {t('Accept')}
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">{t('Never auto-accepts — requires your click')}</p>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              {t('Inbox')}
            </p>
            {inbox.length === 0 ? (
              <EmptyLine>{t('Inbox empty')}</EmptyLine>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {inbox.map((item) => (
                  <li key={item.deliveryId} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2.5 py-2">
                    <span className="min-w-0 truncate text-[12px] text-ink">
                      {item.senderDisplayName || item.deliveryId}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button size="sm" disabled={Boolean(busy)} onClick={() => acceptInbox(item)}>
                        {t('Accept')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={Boolean(busy)}
                        onClick={() => declineInbox(item.deliveryId)}
                      >
                        {t('Decline')}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              {t('Pairing requests')}
            </p>
            {requests.length === 0 ? (
              <EmptyLine>{t('No pairing requests')}</EmptyLine>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {requests.map((req) => (
                  <li key={req.relationshipGenerationId} className="rounded-lg bg-surface px-2.5 py-2">
                    <p className="truncate text-[12px] font-medium text-ink">
                      {req.displayName || req.relationshipGenerationId}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {[req.direction, req.status].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-1.5 flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={Boolean(busy)}
                        onClick={() => readSas(req.relationshipGenerationId)}
                      >
                        {t('Show SAS')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={Boolean(busy)}
                        onClick={() => confirmSas(req.relationshipGenerationId)}
                      >
                        {t('Confirm SAS')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Section>
  )
}
