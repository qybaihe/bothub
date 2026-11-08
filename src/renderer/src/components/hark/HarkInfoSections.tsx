import { useCallback, useEffect, useState } from 'react'
import { Download, FileText, Globe, KeyRound, Monitor, ShieldAlert, Terminal } from 'lucide-react'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

async function callHark(
  accountId: string,
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
    query?: Record<string, string | undefined>
    body?: unknown
  } = {}
): Promise<unknown> {
  const hark = getBridge()?.hark
  if (!hark?.rpc) throw new Error('Hark IPC unavailable')
  const res = await hark.rpc({
    accountId,
    op: 'call',
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    path,
    query: opts.query,
    body: opts.body
  })
  if (!res.ok) throw new Error(res.message || `HTTP ${res.status}`)
  return res.data
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/**
 * 1. Hark Billing & Token Meters (`/billing/summary`, `/profile`)
 */
export function HarkBillingSection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [sumRaw, profRaw] = await Promise.all([
        callHark(accountId, '/billing/summary').catch(() => null),
        callHark(accountId, '/profile').catch(() => null)
      ])
      if (sumRaw && typeof sumRaw === 'object') setSummary(sumRaw as Record<string, unknown>)
      if (profRaw && typeof profRaw === 'object') setProfile(profRaw as Record<string, unknown>)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const plan = asObj(summary?.['plan'])
  const planName = str(plan?.['name'] ?? summary?.['tier'] ?? 'Hark Pro')
  const meters = asObj(summary?.['meters'])
  const harkTokens = asObj(meters?.['harkTokens'])
  const dailyUsed = Number(harkTokens?.['dailyUsed'] ?? 0)
  const dailyLimit = Number(harkTokens?.['dailyLimit'] ?? 0)
  const poolUsed = Number(harkTokens?.['poolUsed'] ?? 0)
  const poolLimit = Number(harkTokens?.['poolLimit'] ?? 0)
  const dailyPct = dailyLimit > 0 ? Math.min(100, Math.round((dailyUsed / dailyLimit) * 100)) : 0
  const poolPct = poolLimit > 0 ? Math.min(100, Math.round((poolUsed / poolLimit) * 100)) : 0

  return (
    <Section
      title="额度与套餐 (Billing)"
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2.5 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        {!summary && !profile ? (
          <EmptyLine>{loading ? '正在加载用量…' : '登录后展示套餐与额度'}</EmptyLine>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg bg-surface p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink">{planName}</span>
              {profile && (
                <span className="truncate text-[11px] text-ink-muted">
                  {str(profile['email'] || profile['name'])}
                </span>
              )}
            </div>

            {dailyLimit > 0 && (
              <div>
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-ink-secondary">今日额度 (Daily)</span>
                  <span className="font-mono text-ink">
                    {fmtTokens(dailyUsed)} / {fmtTokens(dailyLimit)} ({dailyPct}%)
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hover">
                  <div className="h-full rounded-full bg-ink/75" style={{ width: `${dailyPct}%` }} />
                </div>
              </div>
            )}

            {poolLimit > 0 && (
              <div>
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-ink-secondary">周期总额度 (Pool)</span>
                  <span className="font-mono text-ink">
                    {fmtTokens(poolUsed)} / {fmtTokens(poolLimit)} ({poolPct}%)
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hover">
                  <div className="h-full rounded-full bg-accent-600" style={{ width: `${poolPct}%` }} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}

/**
 * 2. Hark Home Cards & Proactive Actions (`/home/cards`, `/act`, `/dismiss`, `/refresh`)
 */
export function HarkHomeCardsSection({ accountId, botId }: { accountId: string; botId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const sendMessage = useBotStore((s) => s.sendMessage)
  const [cards, setCards] = useState<
    Array<{
      id: string
      kind: string
      title: string
      subtitle?: string
      taskPrompt?: string
      provider?: string
    }>
  >([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string>()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const raw = await callHark(accountId, '/home/cards', {
        query: { widgetRuntimeVersion: '3.1.0' }
      })
      const o = asObj(raw) || {}
      const list = Array.isArray(o['cards']) ? o['cards'] : []
      const parsed: typeof cards = []
      for (const item of list) {
        const c = asObj(item)
        if (!c) continue
        const id = str(c['id'])
        const kind = str(c['kind'])
        const payload = asObj(c['payload']) || {}
        const action = str(payload['action'])
        const sentence = str(payload['sentence'])
        const title =
          action && sentence
            ? `${action} ${sentence}`
            : str(payload['title'] ?? payload['headline'] ?? c['dedupKey'] ?? kind)
        const subtitle = str(payload['reason'] ?? payload['description'] ?? '') || undefined
        const taskPrompt = str(payload['task'] ?? '') || (action && sentence ? `${action} ${sentence}` : undefined)
        const providers = Array.isArray(payload['providers']) ? payload['providers'] : []
        parsed.push({
          id,
          kind,
          title,
          subtitle,
          taskPrompt,
          provider: typeof providers[0] === 'string' ? providers[0] : undefined
        })
      }
      setCards(parsed)
    } catch {
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const dismissCard = async (id: string) => {
    setBusyId(id)
    try {
      await callHark(accountId, `/home/cards/${encodeURIComponent(id)}/dismiss`, {
        method: 'POST',
        body: { reason: 'rejected' }
      })
      await refresh()
    } finally {
      setBusyId(undefined)
    }
  }

  if (cards.length === 0 && !loading) return null

  return (
    <Section
      title="Hark 智能建议卡片 (Home Cards)"
      count={cards.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-1.5 px-3 pb-2.5 pt-1 text-[12px]">
        {cards.map((c) => (
          <div key={c.id} className="rounded-lg border border-line bg-surface p-2.5">
            <p className="font-medium text-ink">{c.title}</p>
            {c.subtitle && <p className="mt-0.5 text-[11px] text-ink-secondary">{c.subtitle}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.taskPrompt && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busyId === c.id}
                  onClick={() => void sendMessage(botId, c.taskPrompt!)}
                >
                  在对话中执行
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busyId === c.id}
                onClick={() => void dismissCard(c.id)}
              >
                忽略
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/**
 * 3. Hark Conversations & Message Search
 * (`/conversations`, `/conversations/clear`, `/search/messages`)
 */
export function HarkConversationsSection({ accountId, botId }: { accountId: string; botId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const connectAccount = useBotStore((s) => s.connectAccount)
  const [convs, setConvs] = useState<Array<{ id: string; title: string; updatedAt: string }>>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Array<{ id: string; text: string }> | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [hint, setHint] = useState<string>()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const raw = await callHark(accountId, '/conversations')
      const o = asObj(raw) || {}
      const list =
        (Array.isArray(o['conversations']) && o['conversations']) ||
        (Array.isArray(o['items']) && o['items']) ||
        (Array.isArray(raw) ? raw : [])
      setConvs(
        list
          .slice(0, 20)
          .map((c) => {
            const r = asObj(c) || {}
            return {
              id: str(r['id'] ?? r['conversationId']),
              title: str(r['title'] ?? 'Main conversation') || 'Main conversation',
              updatedAt: str(r['updatedAt'] ?? r['createdAt'])
            }
          })
          .filter((x) => x.id)
      )
    } catch {
      setConvs([])
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const clearConversation = async () => {
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      await callHark(accountId, '/conversations/clear', { method: 'POST', body: {} })
      useBotStore.setState((s) => ({ messages: { ...s.messages, [botId]: [] } }))
      setHint('已清空当前 Hark 会话上下文 (/conversations/clear)')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const runSearch = async () => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    setBusy(true)
    try {
      const raw = await callHark(accountId, '/search/messages', { query: { q } })
      const o = asObj(raw) || {}
      const list =
        (Array.isArray(o['messages']) && o['messages']) ||
        (Array.isArray(o['results']) && o['results']) ||
        (Array.isArray(o['items']) && o['items']) ||
        (Array.isArray(raw) ? raw : [])
      setHits(
        list
          .slice(0, 20)
          .map((m, idx) => {
            const r = asObj(m) || {}
            return {
              id: str(r['id'] ?? r['messageId'] ?? idx),
              text: str(r['content'] ?? r['text'] ?? r['snippet']).slice(0, 180)
            }
          })
          .filter((x) => x.text)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="Hark 会话与搜索"
      count={convs.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        {hint && <p className="text-ink-secondary">{hint}</p>}

        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void connectAccount(accountId)}>
            同步最新消息
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void clearConversation()}>
            清空上下文
          </Button>
        </div>

        <div className="flex gap-1.5">
          <TextInput
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (!e.target.value.trim()) setHits(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch()
            }}
            placeholder="搜索历史消息 (/search/messages)…"
            aria-label="Search Hark messages"
            className="h-7 flex-1 text-[12px]"
          />
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void runSearch()}>
            搜索
          </Button>
        </div>

        {hits && (
          <div className="rounded-lg border border-line bg-surface p-2">
            <p className="mb-1 text-[11px] font-medium text-ink-secondary">搜索结果 ({hits.length})</p>
            {hits.length === 0 ? (
              <p className="text-ink-muted">无匹配消息</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {hits.map((h) => (
                  <li key={h.id} className="truncate rounded bg-hover px-2 py-1 text-ink">
                    {h.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}

/**
 * 4. Hark Scheduled Tasks
 * (`/scheduled-tasks`, `/scheduled-tasks/:id/pause`, `/resume`, `DELETE /scheduled-tasks/:id`)
 */
export function HarkScheduledTasksSection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [tasks, setTasks] = useState<
    Array<{ id: string; title: string; schedule: string; paused: boolean }>
  >([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const raw = await callHark(accountId, '/scheduled-tasks')
      const o = asObj(raw) || {}
      const list =
        (Array.isArray(o['tasks']) && o['tasks']) ||
        (Array.isArray(o['scheduledTasks']) && o['scheduledTasks']) ||
        (Array.isArray(o['items']) && o['items']) ||
        (Array.isArray(raw) ? raw : [])
      setTasks(
        list
          .map((item) => {
            const r = asObj(item) || {}
            return {
              id: str(r['id'] ?? r['taskId']),
              title: str(r['title'] ?? r['name'] ?? r['prompt'] ?? 'Task'),
              schedule: str(r['schedule'] ?? r['cron'] ?? r['cadence'] ?? ''),
              paused: Boolean(r['paused'] ?? r['isPaused'] ?? r['status'] === 'paused')
            }
          })
          .filter((x) => x.id)
      )
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const togglePause = async (id: string, paused: boolean) => {
    setBusyId(id)
    try {
      await callHark(
        accountId,
        `/scheduled-tasks/${encodeURIComponent(id)}/${paused ? 'resume' : 'pause'}`,
        { method: 'POST', body: {} }
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const removeTask = async (id: string) => {
    setBusyId(id)
    try {
      await callHark(accountId, `/scheduled-tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  return (
    <Section
      title="定时任务 (Scheduled Tasks)"
      count={tasks.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        {tasks.length === 0 ? (
          <EmptyLine>暂无定时任务（在对话中让 Hark 定时执行即可创建）</EmptyLine>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-lg border border-line bg-surface p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-ink">{task.title}</span>
                  <span className="rounded-full bg-hover px-2 py-0.5 text-[10px] text-ink-secondary">
                    {task.paused ? t('Paused') : t('Active')}
                  </span>
                </div>
                {task.schedule && <p className="mt-0.5 text-[11px] text-ink-muted">{task.schedule}</p>}
                <div className="mt-2 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === task.id}
                    onClick={() => void togglePause(task.id, task.paused)}
                  >
                    {task.paused ? '恢复' : '暂停'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === task.id}
                    onClick={() => void removeTask(task.id)}
                  >
                    {t('Delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

/**
 * 5. Hark Connectors, Channel Bindings & Managed Credentials
 * (`/connectors`, `POST /connectors/link-sessions`, `/channel-bindings/list`, `/managed-credentials`)
 */
export function HarkConnectorsSection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [connectors, setConnectors] = useState<
    Array<{
      id: string
      displayName: string
      capabilities: string[]
      configured: boolean
      connected: boolean
      iconUrl?: string
      setupUrl?: string
      accounts: Array<{ id: string; accountId: string; label?: string; email?: string }>
    }>
  >([])
  const [credentials, setCredentials] = useState<Array<{ domain: string; email?: string; label?: string }>>([])
  const [newDomain, setNewDomain] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showAddCred, setShowAddCred] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string>()
  const [hint, setHint] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [connRaw, credRaw] = await Promise.all([
        callHark(accountId, '/connectors').catch(() => null),
        callHark(accountId, '/managed-credentials').catch(() => null)
      ])
      const o = asObj(connRaw) || {}
      const list = Array.isArray(o['connectors']) ? o['connectors'] : []
      setConnectors(
        list.map((c, idx) => {
          const r = asObj(c) || {}
          const id = str(r['id'] ?? r['provider'] ?? idx)
          const caps = Array.isArray(r['capabilities']) ? r['capabilities'].map(str).filter(Boolean) : []
          const accsRaw = Array.isArray(r['accounts']) ? r['accounts'] : []
          const accs = accsRaw.map((a) => {
            const ao = asObj(a) || {}
            return {
              id: str(ao['id'] ?? ao['accountId']),
              accountId: str(ao['accountId'] ?? ao['id']),
              label: str(ao['label'] ?? ao['accountEmail']) || undefined,
              email: str(ao['accountEmail'] ?? ao['email']) || undefined
            }
          })
          const setupObj = asObj(r['setup'])
          return {
            id,
            displayName: str(r['displayName'] ?? r['name'] ?? id),
            capabilities: caps,
            configured: r['configured'] !== false,
            connected: Boolean(r['connected']) || accs.length > 0,
            iconUrl: str(r['iconUrl']) || undefined,
            setupUrl: str(setupObj?.['url']) || undefined,
            accounts: accs
          }
        })
      )

      const co = asObj(credRaw) || {}
      const logins = Array.isArray(co['logins']) ? co['logins'] : []
      setCredentials(
        logins
          .map((l) => {
            const lo = asObj(l) || {}
            return {
              domain: str(lo['domain']),
              email: str(lo['email']) || undefined,
              label: str(lo['label']) || undefined
            }
          })
          .filter((x) => x.domain)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  /**
   * Exact payload from `DB0LnIrM.js` (`Q.handleConnect`) + `AD8nd0FV.js` (`l`):
   * `POST /api/connectors/link-sessions` `{ provider: id, returnUrl: "https://app.hark.com/settings/connected-accounts", origin: "settings" }`
   * → returns `{ sessionId, startUrl }`.
   */
  const connectProvider = async (c: (typeof connectors)[number]) => {
    setBusyId(c.id)
    setError(undefined)
    setHint(undefined)
    try {
      const res = await callHark(accountId, '/connectors/link-sessions', {
        method: 'POST',
        body: {
          provider: c.id,
          returnUrl: 'https://app.hark.com/settings/connected-accounts',
          origin: 'settings'
        }
      })
      const o = asObj(res) || {}
      const startUrl = str(o['startUrl'] ?? o['url'] ?? o['authUrl'] ?? c.setupUrl)
      if (startUrl && /^https?:\/\//i.test(startUrl)) {
        await getBridge()?.muse?.openHttps?.(startUrl)
        setHint(`已在浏览器打开 ${c.displayName} 授权页，授权完成后点击刷新`)
      } else if (c.setupUrl) {
        await getBridge()?.muse?.openHttps?.(c.setupUrl)
        setHint(`已在浏览器打开 ${c.displayName} 安装页`)
      }
      await refresh()
    } catch (err) {
      if (c.setupUrl) {
        await getBridge()?.muse?.openHttps?.(c.setupUrl)
        setHint(`已打开 ${c.displayName} 安装页`)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusyId(undefined)
    }
  }

  const disconnectProvider = async (provider: string, subAccountId?: string) => {
    if (!subAccountId) return
    setBusyId(provider)
    try {
      await callHark(
        accountId,
        `/connectors/${encodeURIComponent(provider)}/accounts/${encodeURIComponent(subAccountId)}`,
        { method: 'DELETE' }
      )
      setHint('已断开连接器')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const connectChannel = async (channel: 'slack' | 'telegram') => {
    setBusyId(`chan_${channel}`)
    setError(undefined)
    setHint(undefined)
    try {
      const path =
        channel === 'slack' ? '/channel-bindings/slack/link' : '/channel-bindings/telegram/start-link'
      const res = await callHark(accountId, path, { method: 'POST', body: {} })
      const o = asObj(res) || {}
      const url = str(o['url'] ?? o['startUrl'] ?? o['linkUrl'] ?? o['deepLink'])
      if (url && /^https?:\/\//i.test(url)) {
        await getBridge()?.muse?.openHttps?.(url)
        setHint(`已打开 ${channel === 'slack' ? 'Slack' : 'Telegram'} 绑定链接`)
      } else {
        setHint(JSON.stringify(res).slice(0, 120))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const saveManagedCredential = async () => {
    if (!newDomain.trim() || !newEmail.trim() || !newPassword) return
    setBusyId('add_cred')
    setError(undefined)
    try {
      await callHark(accountId, '/managed-credentials', {
        method: 'POST',
        body: {
          domain: newDomain.trim(),
          ssoProvider: 'password',
          email: newEmail.trim(),
          password: newPassword
        }
      })
      setNewDomain('')
      setNewEmail('')
      setNewPassword('')
      setShowAddCred(false)
      setHint('已保存站点托管凭据')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const removeManagedCredential = async (domain: string) => {
    setBusyId(`del_${domain}`)
    try {
      await callHark(accountId, '/managed-credential/disconnect', {
        method: 'POST',
        body: { domain }
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  return (
    <Section
      title="连接器与账号绑定 (Connectors)"
      count={connectors.length || undefined}
      flush={connectors.length > 0}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="px-3 pt-2 text-[12px] text-status-error">{error}</p>}
      {hint && <p className="px-3 pt-2 text-[12px] text-ink-secondary">{hint}</p>}

      {connectors.length === 0 ? (
        <div className="px-3 pb-2">
          <EmptyLine>暂无连接器数据</EmptyLine>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {connectors.map((c) => {
            const firstAcc = c.accounts[0]
            return (
              <li key={c.id} className="flex items-center justify-between gap-2.5 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  {c.iconUrl ? (
                    <img src={c.iconUrl} alt="" className="size-6 shrink-0 rounded object-contain" />
                  ) : (
                    <span className="grid size-6 shrink-0 place-items-center rounded bg-hover text-[11px] font-semibold">
                      {c.displayName.slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-ink">{c.displayName}</span>
                      <span
                        className={
                          c.connected
                            ? 'rounded bg-status-online/10 px-1.5 text-[10.5px] leading-4 text-status-online-ink'
                            : 'rounded bg-sunken px-1.5 text-[10.5px] leading-4 text-ink-muted'
                        }
                      >
                        {c.connected ? '已连接' : c.configured ? '未连接' : '高级'}
                      </span>
                    </div>
                    {c.capabilities.length > 0 && (
                      <p className="truncate text-[11px] text-ink-muted">
                        {firstAcc?.email ? `${firstAcc.email} · ` : ''}
                        {c.capabilities.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                {c.connected && firstAcc ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyId === c.id}
                    onClick={() => void disconnectProvider(c.id, firstAcc.accountId)}
                  >
                    断开
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant={c.configured ? 'primary' : 'secondary'}
                    disabled={busyId === c.id}
                    onClick={() => void connectProvider(c)}
                  >
                    连接
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Channel Bindings (Slack / Telegram) + Managed Credentials */}
      <div className="border-t border-line bg-sunken/30 px-3 py-2.5 text-[12px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
            消息频道与站点凭据
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              disabled={busyId === 'chan_slack'}
              onClick={() => void connectChannel('slack')}
            >
              绑定 Slack
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busyId === 'chan_telegram'}
              onClick={() => void connectChannel('telegram')}
            >
              绑定 Telegram
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddCred((v) => !v)}>
              <KeyRound className="size-3.5" /> 站点登录
            </Button>
          </div>
        </div>

        {showAddCred && (
          <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-2">
            <TextInput
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="网站域名 (如 github.com)"
              aria-label="Website domain"
              className="h-7 text-[12px]"
            />
            <TextInput
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="登录邮箱或账号"
              aria-label="Login email"
              className="h-7 text-[12px]"
            />
            <TextInput
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="密码 (Secured by Hark)"
              aria-label="Login password"
              className="h-7 text-[12px]"
            />
            <Button
              size="sm"
              variant="primary"
              disabled={busyId === 'add_cred' || !newDomain.trim() || !newEmail.trim() || !newPassword}
              onClick={() => void saveManagedCredential()}
            >
              保存站点登录凭据
            </Button>
          </div>
        )}

        {credentials.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {credentials.map((cred) => (
              <li
                key={cred.domain}
                className="flex items-center justify-between rounded bg-surface px-2.5 py-1 text-[11.5px]"
              >
                <span className="truncate text-ink">
                  {cred.domain} {cred.email ? `(${cred.email})` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => void removeManagedCredential(cred.domain)}
                  className="text-status-error hover:underline"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

/**
 * 6. Hark Computer & Live Agent Activity Window (`windows`, `panels`, `asks`, `/images/presign`, `/messages/tool-response`, `/messages/stop-tool`)
 */
export function HarkComputerSection({ accountId, botId: _botId }: { accountId: string; botId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const toggleWebSession = useBotStore((s) => s.toggleWebSession)
  const webSessionOpen = useBotStore((s) => s.webSessionOpen)

  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState<string>()
  const [hint, setHint] = useState<string>()
  const [conversationId, setConversationId] = useState<string>('')
  const [panels, setPanels] = useState<
    Array<{
      dispatchId: string
      kind: string
      status: string
      title?: string
      url?: string
      liveViewUrl?: string
      screenshotKey?: string
      screenshotUrl?: string
      command?: string
    }>
  >([])
  const [asks, setAsks] = useState<
    Array<{
      id: string
      dispatchId?: string
      requestId?: string
      displayHint?: string
      prompt?: string
      domain?: string
      status: string
    }>
  >([])
  const [presignedUrls, setPresignedUrls] = useState<Record<string, string>>({})
  const [askInput, setAskInput] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    const hark = getBridge()?.hark
    if (!hark?.rpc) return
    setLoading(true)
    setError(undefined)
    try {
      const res = await hark.rpc({ accountId, op: 'mainConversation' })
      if (!res.ok || !res.data || typeof res.data !== 'object') return
      const d = res.data as {
        conversationId?: string
        panels?: typeof panels
        asks?: typeof asks
      }
      if (d.conversationId) setConversationId(d.conversationId)
      const pList = Array.isArray(d.panels) ? d.panels : []
      setPanels(pList)
      setAsks(Array.isArray(d.asks) ? d.asks : [])

      // Presign any S3 screenshot keys via `POST /api/images/presign` `{ keys: [...] }`
      const keys = pList.map((p) => p.screenshotKey).filter((k): k is string => Boolean(k))
      if (keys.length > 0) {
        const presignRaw = await callHark(accountId, '/images/presign', {
          method: 'POST',
          body: { keys }
        }).catch(() => null)
        const urlsObj = asObj(asObj(presignRaw)?.['urls'])
        if (urlsObj) {
          const map: Record<string, string> = {}
          for (const [k, v] of Object.entries(urlsObj)) {
            if (typeof v === 'string' && v) map[k] = v
          }
          setPresignedUrls((prev) => ({ ...prev, ...map }))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const stopTool = async (dispatchId: string) => {
    if (!conversationId) return
    setBusyId(dispatchId)
    try {
      await callHark(accountId, '/messages/stop-tool', {
        method: 'POST',
        body: { conversationId, dispatchId }
      })
      setHint('已停止该电脑/工具任务 (/messages/stop-tool)')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const submitToolResponse = async (ask: (typeof asks)[number], value: string) => {
    if (!conversationId || !ask.requestId) return
    setBusyId(ask.id)
    setError(undefined)
    try {
      await callHark(accountId, '/messages/tool-response', {
        method: 'POST',
        body: {
          conversationId,
          requestId: ask.requestId,
          type: 'user_input',
          dispatchId: ask.dispatchId,
          value
        }
      })
      setHint('已提交工具确认响应 (/messages/tool-response)')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const activeBrowserPanel = [...panels].reverse().find((p) => p.screenshotUrl || (p.screenshotKey && presignedUrls[p.screenshotKey]) || p.liveViewUrl)

  return (
    <Section
      title={t('Computer')}
      count={panels.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-3 px-3 pb-3 pt-1 text-[12px]">
        {/* Hark Cloud Computer / CUA Screen Preview */}
        <div className="relative overflow-hidden rounded-xl border border-line bg-ink/[0.04] p-3">
          {activeBrowserPanel ? (
            <div className="flex flex-col gap-2">
              {(activeBrowserPanel.screenshotUrl ||
                (activeBrowserPanel.screenshotKey && presignedUrls[activeBrowserPanel.screenshotKey])) && (
                <img
                  src={
                    activeBrowserPanel.screenshotUrl ||
                    (activeBrowserPanel.screenshotKey ? presignedUrls[activeBrowserPanel.screenshotKey] : '')
                  }
                  alt="Hark computer screen"
                  className="max-h-52 w-full rounded-lg border border-line bg-black object-contain"
                />
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-ink-secondary">
                  {activeBrowserPanel.url || activeBrowserPanel.title || activeBrowserPanel.kind}
                </span>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-ink">
                  {activeBrowserPanel.status}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-5 text-center">
              <span className="grid size-9 place-items-center rounded-xl bg-surface text-ink-secondary shadow-soft">
                <Monitor className="size-4.5" aria-hidden />
              </span>
              <div>
                <p className="text-[13px] font-medium text-ink">
                  Hark Cloud Computer · <span className="font-mono text-[12px] text-status-online-ink">READY</span>
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-muted">
                  Hark 拥有独立的云端电脑与浏览器（CUA）、Shell 终端与网站构建器。当你在对话中让 Hark 浏览网页、查资料或写代码时，实时画面与终端输出会同步到这里。
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={toggleWebSession}>
                {webSessionOpen ? t('Back to conversation') : t('Show web session')}
              </Button>
            </div>
          )}
        </div>

        {error && <p className="text-status-error">{error}</p>}
        {hint && <p className="text-ink-secondary">{hint}</p>}

        {/* Pending User Input / Device Permission Asks (`/messages/tool-response`) */}
        {asks.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold tracking-wide text-status-attention-ink uppercase">
              待处理确认 / 授权请求 (Asks)
            </p>
            {asks.map((ask) => (
              <div key={ask.id} className="rounded-xl border border-status-attention/30 bg-status-attention/8 p-2.5">
                <div className="flex items-center gap-1.5 font-medium text-ink">
                  <ShieldAlert className="size-4 text-status-attention" />
                  <span>{ask.prompt || ask.displayHint || 'Hark 请求你的确认'}</span>
                </div>
                {ask.domain && <p className="mt-0.5 font-mono text-[11px] text-ink-muted">{ask.domain}</p>}
                <div className="mt-2 flex gap-1.5">
                  <TextInput
                    value={askInput[ask.id] ?? ''}
                    onChange={(e) => setAskInput((prev) => ({ ...prev, [ask.id]: e.target.value }))}
                    placeholder="输入回复或直接点击允许…"
                    aria-label="Tool response"
                    className="h-7 flex-1 text-[12px]"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busyId === ask.id}
                    onClick={() => void submitToolResponse(ask, askInput[ask.id]?.trim() || 'approved')}
                  >
                    允许 / 提交
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === ask.id}
                    onClick={() => void submitToolResponse(ask, 'denied')}
                  >
                    拒绝
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Activity Panels List (Browser / Shell / Coding / Search) */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
            云端电脑活动面板 (Agent Activity Panels · {panels.length})
          </p>
          {panels.length === 0 ? (
            <EmptyLine>当前会话暂无电脑/终端活动记录（可在对话中发送如“帮我打开 hacker news 看看头条”）</EmptyLine>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {panels.map((p) => {
                const imgUrl = p.screenshotUrl || (p.screenshotKey ? presignedUrls[p.screenshotKey] : undefined)
                return (
                  <li key={p.dispatchId} className="rounded-lg border border-line bg-surface p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-medium text-ink">
                        {p.kind.includes('shell') ? (
                          <Terminal className="size-3.5 shrink-0 text-accent-600" />
                        ) : (
                          <Globe className="size-3.5 shrink-0 text-accent-600" />
                        )}
                        <span className="truncate">{p.title || p.url || p.command || p.kind}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-hover px-2 py-0.5 text-[10px] text-ink-secondary">
                        {p.status}
                      </span>
                    </div>
                    {p.command && (
                      <pre className="mt-1.5 overflow-x-auto rounded bg-sunken px-2 py-1 font-mono text-[11px] text-ink">
                        $ {p.command}
                      </pre>
                    )}
                    {imgUrl && (
                      <img
                        src={imgUrl}
                        alt={p.kind}
                        className="mt-2 max-h-36 w-full rounded border border-line object-contain"
                      />
                    )}
                    {p.status === 'running' || p.status === 'active' ? (
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === p.dispatchId}
                          onClick={() => void stopTool(p.dispatchId)}
                        >
                          停止此任务
                        </Button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Section>
  )
}

/**
 * 7. Hark Library / Artifacts & Files (`artifacts`, `/images/presign`, `/project/artifact`)
 */
export function HarkLibrarySection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [artifacts, setArtifacts] = useState<
    Array<{
      name: string
      path: string
      s3Key?: string
      downloadUrl?: string
      mimeType?: string
      sizeBytes?: number
    }>
  >([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    const hark = getBridge()?.hark
    if (!hark?.rpc) return
    setLoading(true)
    setError(undefined)
    try {
      const res = await hark.rpc({ accountId, op: 'mainConversation' })
      if (!res.ok || !res.data || typeof res.data !== 'object') return
      const d = res.data as { artifacts?: typeof artifacts }
      setArtifacts(Array.isArray(d.artifacts) ? d.artifacts : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const openOrDownload = async (a: (typeof artifacts)[number]) => {
    if (a.downloadUrl && /^https?:\/\//i.test(a.downloadUrl)) {
      await getBridge()?.muse?.openHttps?.(a.downloadUrl)
      return
    }
    if (a.s3Key) {
      try {
        const raw = await callHark(accountId, '/images/presign', {
          method: 'POST',
          body: { keys: [a.s3Key] }
        })
        const urls = asObj(asObj(raw)?.['urls'])
        const signed = urls ? str(urls[a.s3Key]) : ''
        if (signed && /^https?:\/\//i.test(signed)) {
          await getBridge()?.muse?.openHttps?.(signed)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  return (
    <Section
      title={t('Documents and Files')}
      count={artifacts.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-1.5 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        {artifacts.length === 0 ? (
          <EmptyLine>{t('Files the bot creates show up here')}</EmptyLine>
        ) : (
          <ul className="divide-y divide-line">
            {artifacts.map((a) => (
              <li key={a.s3Key || a.path} className="flex items-center justify-between gap-2 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-hover text-ink-secondary">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{a.name}</p>
                    <p className="truncate font-mono text-[11px] text-ink-muted">{a.path}</p>
                  </div>
                </div>
                {(a.downloadUrl || a.s3Key) && (
                  <Button size="sm" variant="secondary" onClick={() => void openOrDownload(a)}>
                    <Download className="size-3.5" /> 打开
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

/**
 * 8. Hark Invite & Device Sessions (`/invite`, `/invite/claim`, `/sessions`)
 */
export function HarkInviteAndSessionsSection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [inviteInfo, setInviteInfo] = useState<Record<string, unknown> | null>(null)
  const [claimCode, setClaimCode] = useState('')
  const [sessions, setSessions] = useState<
    Array<{ id: string; label: string; location?: string; isCurrent?: boolean }>
  >([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [invRaw, sesRaw] = await Promise.all([
        callHark(accountId, '/invite').catch(() => null),
        callHark(accountId, '/sessions').catch(() => null)
      ])
      if (invRaw && typeof invRaw === 'object') setInviteInfo(invRaw as Record<string, unknown>)
      const sObj = asObj(sesRaw) || {}
      const sList =
        (Array.isArray(sObj['sessions']) && sObj['sessions']) ||
        (Array.isArray(sesRaw) ? sesRaw : [])
      setSessions(
        sList.slice(0, 15).map((s, idx) => {
          const r = asObj(s) || {}
          const loc = [str(r['city']), str(r['country']), str(r['ipAddress'])].filter(Boolean).join(' · ')
          return {
            id: str(r['id'] ?? idx),
            label: str(r['deviceLabel'] ?? r['userAgent'] ?? r['device'] ?? r['id'] ?? `Session ${idx + 1}`),
            location: loc || undefined,
            isCurrent: Boolean(r['isCurrent'])
          }
        })
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const claim = async () => {
    if (!claimCode.trim()) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      await callHark(accountId, '/invite/claim', {
        method: 'POST',
        body: { code: claimCode.trim() }
      })
      setClaimCode('')
      setHint('邀请码兑换成功')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const revokeSession = async (id: string) => {
    setBusy(true)
    try {
      await callHark(accountId, `/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const code = str(inviteInfo?.['code'] ?? inviteInfo?.['inviteCode'])

  return (
    <Section
      title="Hark 邀请与登录设备"
      count={sessions.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2.5 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        {hint && <p className="text-ink-secondary">{hint}</p>}

        {code && (
          <div className="flex items-center justify-between rounded-lg bg-surface p-2">
            <span className="font-mono text-ink">{code}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(code)}
            >
              {t('Copy')}
            </Button>
          </div>
        )}

        <div className="flex gap-1.5">
          <TextInput
            value={claimCode}
            onChange={(e) => setClaimCode(e.target.value)}
            placeholder="输入邀请码兑换 (/invite/claim)…"
            aria-label="Hark invite code"
            className="h-7 flex-1 text-[12px]"
          />
          <Button size="sm" variant="primary" disabled={busy || !claimCode.trim()} onClick={() => void claim()}>
            兑换
          </Button>
        </div>

        {sessions.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              登录设备管理 (/sessions)
            </p>
            <ul className="flex flex-col gap-1.5">
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-surface px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {s.label} {s.isCurrent ? '· 当前会话' : ''}
                    </p>
                    {s.location && <p className="truncate text-[11px] text-ink-muted">{s.location}</p>}
                  </div>
                  {!s.isCurrent && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revokeSession(s.id)}>
                      踢出
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  )
}
