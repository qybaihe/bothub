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

type PeerActivityItem = {
  id: string
  text: string
  createdAtMs?: number
}

type PeerRule = {
  id: string
  ruleText: string
  mode?: string
}

type PeerGrant = {
  id: string
  label: string
}

type PeersStatus = {
  supported?: boolean
  availability?: string
  chatPairing?: boolean
  allowedOperations: string[]
  trustPresets: string[]
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
  const presetsRaw = nested['trust_presets'] ?? nested['trustPresets']
  const trustPresets = Array.isArray(presetsRaw)
    ? presetsRaw.map((x) => (typeof x === 'string' ? x : str(asObj(x)?.['id'] ?? asObj(x)?.['name']))).filter(Boolean)
    : ['restricted', 'collaborator', 'trusted']
  return {
    supported: supported || allowedOperations.length > 0 || Object.keys(nested).length > 0,
    availability: str(nested['availability']) || undefined,
    chatPairing: Boolean(nested['chat_pairing'] ?? nested['chatPairing']),
    allowedOperations,
    trustPresets: trustPresets.length ? trustPresets : ['restricted', 'collaborator', 'trusted'],
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

function parseActivities(raw: unknown): PeerActivityItem[] {
  const root = asObj(raw) || {}
  const list =
    (Array.isArray(root['activities']) && root['activities']) ||
    (Array.isArray(root['items']) && root['items']) ||
    (Array.isArray(raw) ? raw : [])
  const out: PeerActivityItem[] = []
  for (const row of list.slice(0, 20)) {
    const o = asObj(row)
    if (!o) continue
    const id = str(o['activity_id'] || o['id'] || out.length)
    const text = str(o['summary'] || o['title'] || o['description'] || o['text'] || id)
    out.push({ id, text })
  }
  return out
}

function parseGrants(raw: unknown): PeerGrant[] {
  const root = asObj(raw) || {}
  const list =
    (Array.isArray(root['grants']) && root['grants']) ||
    (Array.isArray(root['items']) && root['items']) ||
    (Array.isArray(raw) ? raw : [])
  const out: PeerGrant[] = []
  for (const row of list.slice(0, 20)) {
    const o = asObj(row)
    if (!o) continue
    const id = str(o['grant_id'] || o['id'] || out.length)
    const label = str(o['title'] || o['scope'] || o['peer_muse_id'] || o['muse_id'] || id)
    out.push({ id, label })
  }
  return out
}

function parseRules(raw: unknown): PeerRule[] {
  const root = asObj(raw) || {}
  const list =
    (Array.isArray(root['rules']) && root['rules']) ||
    (Array.isArray(root['items']) && root['items']) ||
    (Array.isArray(raw) ? raw : [])
  const out: PeerRule[] = []
  for (const row of list.slice(0, 25)) {
    const o = asObj(row)
    if (!o) continue
    const id = str(o['rule_id'] || o['id'] || out.length)
    const ruleText = str(o['instruction'] || o['rule'] || o['text'] || o['description'] || id)
    out.push({ id, ruleText, mode: str(o['mode'] || o['effect']) || undefined })
  }
  return out
}

function can(ops: string[], name: string): boolean {
  if (!ops.length) return true
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
 * Complete coverage: status, list, update (trust_preset), reset_conversation,
 * rules (list/set/delete), invites (create/list/open/accept/revoke/inbox.deliver),
 * inbox (list/decline/accept), requests (list/sas/sas.confirm), activity (list/dismiss),
 * grants.list, and cross-account local pairing helper.
 */
export function PeersSection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const allAccounts = useBotStore((s) => s.accounts)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [hint, setHint] = useState<string>()
  const [unavailable, setUnavailable] = useState(false)
  const [peersStatus, setPeersStatus] = useState<PeersStatus | null>(null)
  const [contacts, setContacts] = useState<PeerContact[]>([])
  const [invites, setInvites] = useState<PeerInvite[]>([])
  const [inbox, setInbox] = useState<PeerInbox[]>([])
  const [requests, setRequests] = useState<PeerRequest[]>([])
  const [activities, setActivities] = useState<PeerActivityItem[]>([])
  const [grants, setGrants] = useState<PeerGrant[]>([])
  const [selectedPeerForRules, setSelectedPeerForRules] = useState<string | null>(null)
  const [peerRules, setPeerRules] = useState<PeerRule[]>([])
  const [newRuleText, setNewRuleText] = useState('')
  const [fragment, setFragment] = useState('')
  const [targetAccountId, setTargetAccountId] = useState('')
  const [busy, setBusy] = useState<string>()
  const [sasCode, setSasCode] = useState<string>()
  const [confirmDisconnect, setConfirmDisconnect] = useState<string>()

  const otherMuseAccounts = Object.values(allAccounts).filter(
    (a) => a.platformId === 'meta-muse' && a.id !== accountId && a.status !== 'offline'
  )

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
      const [cRaw, iRaw, inRaw, rRaw, actRaw, grRaw] = await Promise.all([
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
          : Promise.resolve(null),
        muse.rpc({ accountId, method: 'peers.activity.list', params: { limit: 20 } }).catch(() => null),
        muse.rpc({ accountId, method: 'grants.list', params: {} }).catch(() => null)
      ])
      setContacts(cRaw ? parseContacts(cRaw) : [])
      setInvites(iRaw ? parseInvites(iRaw) : [])
      setInbox(inRaw ? parseInbox(inRaw) : [])
      setRequests(rRaw ? parseRequests(rRaw) : [])
      setActivities(actRaw ? parseActivities(actRaw) : [])
      setGrants(grRaw ? parseGrants(grRaw) : [])
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

  /** Cross-account helper: create invite on current account and deliver to another local BotHub Muse account's inbox. */
  const deliverInviteToOtherAccount = (inv: PeerInvite, targetId: string) =>
    void run(`deliver:${inv.inviteId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc || !targetId) return
      if (!inv.inviteB64) throw new Error('Invite has no invite_b64 payload for inbox delivery')
      await muse.rpc({
        accountId: targetId,
        method: 'peers.inbox.deliver',
        params: {
          delivery_id: inv.inviteId,
          invite_b64: inv.inviteB64,
          sender_display_name: allAccounts[accountId]?.displayName || accountId,
          expires_at: inv.expiresAtMs ?? Date.now() + 86_400_000
        }
      })
      setHint('已投递到目标账号收件箱 — 请切换到该账号点击接受')
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

  const updateTrustPreset = (peer: PeerContact, preset: string) =>
    void run(`trust:${peer.museId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      await muse.rpc({
        accountId,
        method: 'peers.update',
        params: { muse_id: peer.museId, trust_preset: preset }
      })
      setHint(t('Trust preset updated'))
    })

  const resetPeerConversation = (peer: PeerContact) =>
    void run(`reset-conv:${peer.museId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      await muse.rpc({
        accountId,
        method: 'peers.reset_conversation',
        params: { muse_id: peer.museId }
      })
      setHint(t('Peer conversation reset'))
    })

  const loadPeerRules = async (museId: string) => {
    if (selectedPeerForRules === museId) {
      setSelectedPeerForRules(null)
      return
    }
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setSelectedPeerForRules(museId)
    try {
      const raw = await muse.rpc({ accountId, method: 'peers.rules.list', params: { muse_id: museId } })
      setPeerRules(parseRules(raw))
    } catch {
      setPeerRules([])
    }
  }

  const addPeerRule = (museId: string) =>
    void run(`rule-add:${museId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc || !newRuleText.trim()) return
      await muse.rpc({
        accountId,
        method: 'peers.rules.set',
        params: { muse_id: museId, instruction: newRuleText.trim(), rule: newRuleText.trim() }
      })
      setNewRuleText('')
      const raw = await muse.rpc({ accountId, method: 'peers.rules.list', params: { muse_id: museId } })
      setPeerRules(parseRules(raw))
    })

  const deletePeerRule = (museId: string, ruleId: string) =>
    void run(`rule-del:${ruleId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      await muse.rpc({
        accountId,
        method: 'peers.rules.delete',
        params: { muse_id: museId, rule_id: ruleId }
      })
      const raw = await muse.rpc({ accountId, method: 'peers.rules.list', params: { muse_id: museId } })
      setPeerRules(parseRules(raw))
    })

  const dismissActivity = (activityId: string) =>
    void run(`dismiss:${activityId}`, async () => {
      const muse = getBridge()?.muse
      if (!muse?.rpc) return
      await muse.rpc({ accountId, method: 'peers.activity.dismiss', params: { activity_id: activityId } })
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
  const presets = peersStatus?.trustPresets || ['restricted', 'collaborator', 'trusted']

  return (
    <Section
      title={t('Trusted Network')}
      count={contacts.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="pb-1 text-[12px] text-status-error">{error}</p>}
      {hint && <p className="pb-1 text-[12px] text-ink-secondary">{hint}</p>}
      {sasCode && (
        <p className="mb-2 rounded-lg bg-sunken px-2.5 py-2 font-mono text-[13px] text-ink">{sasCode}</p>
      )}
      {unavailable ? (
        <EmptyLine>{t('Trusted Network unavailable')}</EmptyLine>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              {t('Contacts')}
            </p>
            {contacts.length === 0 ? (
              <EmptyLine>{t('No Trusted Network contacts')}</EmptyLine>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {contacts.map((p) => (
                  <li key={p.museId} className="rounded-lg bg-surface px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-ink">{p.displayName}</span>
                        <span className="block truncate text-[11px] text-ink-muted">
                          {p.museId}
                          {p.trustPreset ? ` · ${p.trustPreset}` : ''}
                        </span>
                      </span>
                      <select
                        value={p.trustPreset ?? ''}
                        onChange={(e) => {
                          if (e.target.value) updateTrustPreset(p, e.target.value)
                        }}
                        aria-label="Trust preset"
                        className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[11px] text-ink"
                      >
                        <option value="">{p.trustPreset || 'trust…'}</option>
                        {presets.map((pr) => (
                          <option key={pr} value={pr}>
                            {pr}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" onClick={() => void loadPeerRules(p.museId)}>
                        {selectedPeerForRules === p.museId ? '收起规则' : '规则'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={Boolean(busy)}
                        onClick={() => resetPeerConversation(p)}
                      >
                        重置对话
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy?.startsWith('disc:')}
                        onClick={() => disconnect(p)}
                      >
                        {confirmDisconnect === p.museId ? t('Confirm remove') : t('Remove')}
                      </Button>
                    </div>
                    {selectedPeerForRules === p.museId && (
                      <div className="mt-2 border-t border-line pt-2 text-[11px]">
                        <div className="mb-1.5 flex gap-1">
                          <TextInput
                            value={newRuleText}
                            onChange={(e) => setNewRuleText(e.target.value)}
                            placeholder="添加针对该联系人的指令规则…"
                            aria-label="Peer rule"
                            className="h-6 flex-1 text-[11px]"
                          />
                          <Button size="sm" onClick={() => addPeerRule(p.museId)}>
                            添加
                          </Button>
                        </div>
                        {peerRules.length === 0 ? (
                          <p className="text-ink-muted">暂无特定规则</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {peerRules.map((r) => (
                              <li key={r.id} className="flex items-center justify-between gap-2 rounded bg-hover px-2 py-1">
                                <span className="truncate text-ink">{r.ruleText}</span>
                                <button
                                  type="button"
                                  onClick={() => deletePeerRule(p.museId, r.id)}
                                  className="text-status-error hover:underline"
                                >
                                  删除
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
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
                  <li key={inv.inviteId} className="flex flex-col gap-1.5 rounded-lg bg-surface px-2.5 py-2 text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-ink">{inv.fragment || inv.inviteId}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === `revoke:${inv.inviteId}`}
                        onClick={() => revokeInvite(inv.inviteId)}
                      >
                        {t('Revoke')}
                      </Button>
                    </div>
                    {inv.inviteB64 && otherMuseAccounts.length > 0 && (
                      <div className="flex items-center gap-1.5 border-t border-line pt-1.5">
                        <select
                          value={targetAccountId}
                          onChange={(e) => setTargetAccountId(e.target.value)}
                          className="min-w-0 flex-1 rounded border border-line bg-canvas px-1.5 py-0.5 text-[11px] text-ink"
                        >
                          <option value="">选择本机其它 Muse 账号投递…</option>
                          {otherMuseAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.displayName} ({acc.handle})
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          disabled={!targetAccountId || Boolean(busy)}
                          onClick={() => deliverInviteToOtherAccount(inv, targetAccountId)}
                        >
                          投递收件箱
                        </Button>
                      </div>
                    )}
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

          {grants.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Issued Access Grants
              </p>
              <ul className="flex flex-col gap-1">
                {grants.map((g) => (
                  <li key={g.id} className="truncate rounded-lg bg-surface px-2.5 py-1.5 text-[12px] text-ink">
                    {g.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activities.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Peer Activity
              </p>
              <ul className="flex flex-col gap-1">
                {activities.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-[12px]">
                    <span className="min-w-0 truncate text-ink">{a.text}</span>
                    <Button size="sm" variant="ghost" onClick={() => dismissActivity(a.id)}>
                      Dismiss
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
