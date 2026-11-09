import { useCallback, useEffect, useState } from 'react'
import { EmptyLine, Section } from '@/components/info/Section'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

type Caps = {
  supported: boolean
  remoteGrant: boolean
  retiredHint: boolean
  flags: string[]
  raw: Record<string, unknown>
}

type SharedAgentRow = {
  id: string
  name: string
  state?: string
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}

function parseCaps(raw: unknown): Caps {
  const root = asObj(raw) || {}
  const nested = asObj(root['capabilities']) || asObj(root['result']) || root
  const flags: string[] = []
  const pushFlag = (k: string, v: unknown) => {
    if (v === true || v === 'true' || v === 1) flags.push(k)
  }
  for (const [k, v] of Object.entries(nested)) {
    if (typeof v === 'boolean' || v === 0 || v === 1 || v === 'true' || v === 'false') pushFlag(k, v)
  }
  const retiredHint =
    nested['retired'] === true ||
    nested['unsupported'] === true ||
    nested['disabled'] === true ||
    (typeof nested['status'] === 'string' && /retired|unsupported|disabled/i.test(nested['status']))
  const supported =
    nested['shared_agents'] === true ||
    nested['supported'] === true ||
    flags.includes('shared_agents') ||
    Object.keys(nested).length > 0
  const remoteGrant = nested['remote_grant_v1'] === true || flags.includes('remote_grant_v1')
  return { supported, remoteGrant, retiredHint, flags, raw: nested }
}

function parseList(raw: unknown): SharedAgentRow[] {
  const root = asObj(raw) || {}
  const list =
    (Array.isArray(root['shared_agents']) && root['shared_agents']) ||
    (Array.isArray(root['agents']) && root['agents']) ||
    (Array.isArray(root['items']) && root['items']) ||
    (Array.isArray(raw) ? raw : [])
  const out: SharedAgentRow[] = []
  for (const row of list.slice(0, 25)) {
    const o = asObj(row)
    if (!o) continue
    const id = str(o['shared_agent_id'] || o['sharedAgentId'] || o['id'])
    if (!id) continue
    out.push({
      id,
      name: str(o['display_name'] || o['displayName'] || o['name'] || id),
      state: str(o['state'] || o['status']) || undefined
    })
  }
  return out
}

/**
 * Shared Agents (shared_agents.*) — Members tab.
 * List/capabilities ride the personal hatch_vm Noise session.
 * remote.open/send need connectionClass=shared_agent + Msg3 ticket — ticket
 * bootstrap not captured; UI stays honest and never fakes a remote connect.
 */
export function SharedAgentsSection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string>()
  const [agents, setAgents] = useState<SharedAgentRow[]>([])

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) {
      setUnavailable(true)
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      let capsRaw: unknown
      try {
        capsRaw = await muse.rpc({ accountId, method: 'shared_agents.capabilities', params: {} })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/404|not.?found|unsupported|unknown.?method|class|retired/i.test(msg)) {
          setUnavailable(true)
          setAgents([])
          return
        }
        throw err
      }
      const c = parseCaps(capsRaw)
      if (!c.supported || c.retiredHint) {
        setUnavailable(true)
        setAgents([])
        return
      }
      setUnavailable(false)
      try {
        const listRaw = await muse.rpc({ accountId, method: 'shared_agents.list', params: {} })
        setAgents(parseList(listRaw))
      } catch {
        setAgents([])
      }
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

  return (
    <Section
      title={t('Shared Agents')}
      count={agents.length || undefined}
      action={<RefreshButton onClick={() => void refresh()} loading={loading} />}
    >
      {error ? <p className="mb-1 text-[12px] text-status-error-ink">{error}</p> : null}
      {unavailable || agents.length === 0 ? (
        <EmptyLine>{unavailable ? t('Shared Agents unavailable') : t('No shared agent definitions')}</EmptyLine>
      ) : (
        <ul className="divide-y divide-line">
          {agents.map((a) => (
            <li key={a.id} className="py-1.5 text-[12px] text-ink">
              <span className="font-medium">{a.name}</span>
              {a.state ? <span className="text-ink-muted"> · {a.state}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
