import { useCallback, useEffect, useState } from 'react'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

async function callGrok(accountId: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const grok = getBridge()?.grok
  if (!grok?.rpc) throw new Error('Grok IPC unavailable')
  const res = await grok.rpc({ accountId, op: 'call', method, params })
  if (!res.ok) throw new Error(res.message || `HTTP ${res.status}`)
  return res.data
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

/**
 * 1. Grok Bot Sessions & Conversation Controls
 * (`ListGrokBotAgentSessions`, `StartFreshGrokBotConversation`, `RollBackGrokBotConversation`)
 */
export function GrokSessionsSection({ accountId, agentId, botId }: { accountId: string; agentId?: string; botId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const setSelectedAgent = useBotStore((s) => s.setSelectedAgent)
  const [sessions, setSessions] = useState<Array<{ sessionId: string; kind: string; updatedAtMs: number }>>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [hint, setHint] = useState<string>()

  const refresh = useCallback(async () => {
    if (!agentId) return
    setLoading(true)
    setError(undefined)
    try {
      const raw = await callGrok(accountId, 'ListGrokBotAgentSessions', { agent_id: agentId })
      const o = asObj(raw) || {}
      const list = Array.isArray(o['sessions']) ? o['sessions'] : []
      setSessions(
        list.map((s) => {
          const r = asObj(s) || {}
          return {
            sessionId: str(r['sessionId'] ?? r['session_id']),
            kind: str(r['kind'] ?? 'main'),
            updatedAtMs: Number(r['updatedAtMs'] ?? r['updated_at_ms'] ?? 0)
          }
        })
      )
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [accountId, agentId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const startFresh = async () => {
    if (!agentId) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      await callGrok(accountId, 'StartFreshGrokBotConversation', { agent_id: agentId })
      setHint('已开启全新对话 (StartFreshGrokBotConversation)')
      setSelectedAgent(botId, agentId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const rollBack = async () => {
    if (!agentId) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      await callGrok(accountId, 'RollBackGrokBotConversation', { agent_id: agentId })
      setHint('已回滚上一轮对话 (RollBackGrokBotConversation)')
      setSelectedAgent(botId, agentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="Grok 会话与控制"
      count={sessions.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        {hint && <p className="text-ink-secondary">{hint}</p>}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="secondary" disabled={busy || !agentId} onClick={() => void startFresh()}>
            + 开启新对话
          </Button>
          <Button size="sm" variant="ghost" disabled={busy || !agentId} onClick={() => void rollBack()}>
            回滚上一轮
          </Button>
        </div>
        {sessions.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {sessions.slice(0, 10).map((s) => (
              <li key={s.sessionId} className="flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5 font-mono text-[11px]">
                <span className="truncate text-ink">{s.sessionId || 'main'}</span>
                <span className="text-ink-muted">{s.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

/**
 * 2. Grok Bot Automations & Routines
 * (`ListGrokBotAgentAutomations`, `SetGrokBotAgentAutomationEnabled`, `DeleteGrokBotAgentAutomation`)
 */
export function GrokAutomationsSection({ accountId, agentId }: { accountId: string; agentId?: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [items, setItems] = useState<
    Array<{ id: string; name: string; schedule: string; isEnabled: boolean; prompt?: string }>
  >([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    if (!agentId) return
    setLoading(true)
    setError(undefined)
    try {
      const raw = await callGrok(accountId, 'ListGrokBotAgentAutomations', { agent_id: agentId })
      const o = asObj(raw) || {}
      const list = Array.isArray(o['automations']) ? o['automations'] : []
      const parsed: Array<{ id: string; name: string; schedule: string; isEnabled: boolean; prompt?: string }> = []
      for (const item of list) {
        const row = asObj(item) || {}
        let rec = row
        if (typeof row['recordJson'] === 'string' || typeof row['record_json'] === 'string') {
          try {
            rec = { ...row, ...(JSON.parse(str(row['recordJson'] ?? row['record_json'])) as Record<string, unknown>) }
          } catch {
            /* ignore */
          }
        }
        const id = str(rec['id'] ?? row['automationId'] ?? row['automation_id'])
        if (!id) continue
        parsed.push({
          id,
          name: str(rec['name'] ?? rec['title'] ?? id),
          schedule: str(rec['triggerDescription'] ?? rec['schedule'] ?? 'Scheduled'),
          isEnabled: rec['isEnabled'] !== false && rec['is_enabled'] !== false,
          prompt: str(rec['prompt']) || undefined
        })
      }
      setItems(parsed)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [accountId, agentId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const toggleEnabled = async (id: string, isEnabled: boolean) => {
    if (!agentId) return
    setBusyId(id)
    try {
      await callGrok(accountId, 'SetGrokBotAgentAutomationEnabled', {
        agent_id: agentId,
        automation_id: id,
        is_enabled: isEnabled
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const removeAutomation = async (id: string) => {
    if (!agentId) return
    setBusyId(id)
    try {
      await callGrok(accountId, 'DeleteGrokBotAgentAutomation', {
        agent_id: agentId,
        automation_id: id
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
      title="定时任务 (Automations)"
      count={items.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2 px-3 pb-2.5 pt-1">
        {error && <p className="text-[12px] text-status-error">{error}</p>}
        {items.length === 0 ? (
          <EmptyLine>暂无 Grok 自动化任务</EmptyLine>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((a) => (
              <li key={a.id} className="rounded-lg border border-line bg-surface p-2.5 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-ink">{a.name}</span>
                  <span className="rounded-full bg-hover px-2 py-0.5 text-[10px] text-ink-secondary">
                    {a.isEnabled ? 'Active' : 'Paused'}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-muted">{a.schedule}</p>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === a.id}
                    onClick={() => void toggleEnabled(a.id, !a.isEnabled)}
                  >
                    {a.isEnabled ? '暂停' : '启用'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === a.id}
                    onClick={() => void removeAutomation(a.id)}
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
 * 3. Grok Bot Cloud Memories & Skills
 * (`ListGrokBotUserBotMemories`, `ListGrokBotAgentSkills`, `AddGrokBotAgentSkill`, `RemoveGrokBotAgentSkill`)
 */
export function GrokMemoriesAndSkillsSection({ accountId, agentId }: { accountId: string; agentId?: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [memories, setMemories] = useState<Array<{ factId: string; text: string }>>([])
  const [skills, setSkills] = useState<Array<{ name: string; description: string; body: string }>>([])
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillContent, setNewSkillContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    if (!agentId) return
    setLoading(true)
    setError(undefined)
    try {
      const [memRaw, skRaw] = await Promise.all([
        callGrok(accountId, 'ListGrokBotUserBotMemories', { agent_id: agentId }).catch(() => null),
        callGrok(accountId, 'ListGrokBotAgentSkills', { agent_id: agentId }).catch(() => null)
      ])
      const mObj = asObj(memRaw) || {}
      const mList = Array.isArray(mObj['memories']) ? mObj['memories'] : []
      setMemories(
        mList.map((m, idx) => {
          const r = asObj(m) || {}
          return {
            factId: str(r['factId'] ?? r['fact_id'] ?? idx),
            text: str(r['text'] ?? r['content'])
          }
        }).filter((x) => x.text)
      )

      const sObj = asObj(skRaw) || {}
      const sList = Array.isArray(sObj['skills']) ? sObj['skills'] : []
      setSkills(
        sList.map((s) => {
          const r = asObj(s) || {}
          return {
            name: str(r['name'] ?? r['id']),
            description: str(r['description']),
            body: str(r['body'] ?? r['content'])
          }
        }).filter((x) => x.name)
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId, agentId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const addSkill = async () => {
    if (!agentId || !newSkillName.trim() || !newSkillContent.trim()) return
    setBusy(true)
    setError(undefined)
    try {
      await callGrok(accountId, 'AddGrokBotAgentSkill', {
        agent_id: agentId,
        name: newSkillName.trim(),
        content: newSkillContent.trim()
      })
      setNewSkillName('')
      setNewSkillContent('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const removeSkill = async (name: string) => {
    if (!agentId) return
    setBusy(true)
    try {
      await callGrok(accountId, 'RemoveGrokBotAgentSkill', { agent_id: agentId, name })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Section
        title="Grok 云端记忆 (Memories)"
        count={memories.length || undefined}
        action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
      >
        <div className="flex flex-col gap-1.5 px-3 pb-2.5 pt-1">
          {memories.length === 0 ? (
            <EmptyLine>暂无云端记忆</EmptyLine>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {memories.map((m) => (
                <li key={m.factId} className="rounded-lg border border-line bg-surface px-2.5 py-2 text-[12px] text-ink">
                  {m.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section
        title="Grok 技能 (Skills)"
        count={skills.length || undefined}
        action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
      >
        <div className="flex flex-col gap-2 px-3 pb-2.5 pt-1">
          {error && <p className="text-[12px] text-status-error">{error}</p>}
          <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-2">
            <TextInput
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              placeholder="技能名称 (如 code-review)"
              aria-label="Skill name"
              className="h-7 text-[12px]"
            />
            <textarea
              value={newSkillContent}
              onChange={(e) => setNewSkillContent(e.target.value)}
              placeholder="技能指令内容 (Markdown)…"
              rows={2}
              className="w-full resize-none rounded-lg border border-line bg-canvas p-2 text-[12px] text-ink outline-none"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !newSkillName.trim() || !newSkillContent.trim()}
              onClick={() => void addSkill()}
            >
              添加技能 (AddGrokBotAgentSkill)
            </Button>
          </div>
          {skills.length === 0 ? (
            <EmptyLine>暂无已挂载技能</EmptyLine>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {skills.map((s) => (
                <li key={s.name} className="flex items-start justify-between gap-2 rounded-lg border border-line bg-surface p-2 text-[12px]">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{s.name}</p>
                    {s.description && <p className="text-[11px] text-ink-secondary">{s.description}</p>}
                  </div>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeSkill(s.name)}>
                    {t('Delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </>
  )
}

/**
 * 4. Grok Bot Library Files
 * (`ListGrokBotAgentFiles`, `ListGrokBotUserStoreFiles`, `DeleteGrokBotAgentFile`)
 */
export function GrokFilesSection({ accountId, agentId }: { accountId: string; agentId?: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [files, setFiles] = useState<Array<{ name: string; path: string; sizeBytes: number }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    if (!agentId) return
    setLoading(true)
    setError(undefined)
    try {
      const [aRaw, uRaw] = await Promise.all([
        callGrok(accountId, 'ListGrokBotAgentFiles', { agent_id: agentId, page_token: '' }).catch(() => null),
        callGrok(accountId, 'ListGrokBotUserStoreFiles', { agent_id: agentId }).catch(() => null)
      ])
      const aList = Array.isArray(asObj(aRaw)?.['files']) ? (asObj(aRaw)!['files'] as unknown[]) : []
      const uList = Array.isArray(asObj(uRaw)?.['files']) ? (asObj(uRaw)!['files'] as unknown[]) : []
      const merged = [...aList, ...uList].map((f) => {
        const r = asObj(f) || {}
        return {
          name: str(r['name'] ?? r['path']),
          path: str(r['path'] ?? r['name']),
          sizeBytes: Number(r['sizeBytes'] ?? r['size_bytes'] ?? 0)
        }
      }).filter((x) => x.name)
      setFiles(merged)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId, agentId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const removeFile = async (name: string) => {
    if (!agentId) return
    try {
      await callGrok(accountId, 'DeleteGrokBotAgentFile', { agent_id: agentId, name })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Section
      title={t('Documents and Files')}
      count={files.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-1.5 px-3 pb-2.5 pt-1">
        {error && <p className="text-[12px] text-status-error">{error}</p>}
        {files.length === 0 ? (
          <EmptyLine>{t('Files the bot creates show up here')}</EmptyLine>
        ) : (
          <ul className="divide-y divide-line">
            {files.map((f) => (
              <li key={f.path} className="flex items-center justify-between gap-2 py-2 text-[12px]">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{f.name}</span>
                  <span className="block truncate font-mono text-[11px] text-ink-muted">{f.path}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => void removeFile(f.name)}>
                  {t('Delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

/**
 * 5. Grok Bot Members & Access Invites
 * (`ListGrokBotAgentAccessInvites`, `CreateGrokBotAgentAccessInvite`, `AcceptGrokBotAgentAccessInvite`)
 */
export function GrokMembersSection({ accountId, agentId }: { accountId: string; agentId?: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [invites, setInvites] = useState<Array<{ email: string; expiresAtMs: number }>>([])
  const [email, setEmail] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    if (!agentId) return
    setLoading(true)
    setError(undefined)
    try {
      const raw = await callGrok(accountId, 'ListGrokBotAgentAccessInvites', { agent_id: agentId })
      const o = asObj(raw) || {}
      const list = Array.isArray(o['invites']) ? o['invites'] : []
      setInvites(
        list.map((i) => {
          const r = asObj(i) || {}
          return {
            email: str(r['email']),
            expiresAtMs: Number(r['expiresAtMs'] ?? r['expires_at_ms'] ?? 0)
          }
        }).filter((x) => x.email)
      )
    } catch {
      setInvites([])
    } finally {
      setLoading(false)
    }
  }, [accountId, agentId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const sendInvite = async () => {
    if (!agentId || !email.trim()) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      const res = await callGrok(accountId, 'CreateGrokBotAgentAccessInvite', {
        agent_id: agentId,
        email: email.trim(),
        send_email: true,
        language: 'zh-CN'
      })
      const o = asObj(res) || {}
      const url = str(o['inviteUrl'] ?? o['invite_url'])
      setEmail('')
      setHint(url ? `已创建邀请链接：${url}` : '邀请已发送')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const acceptInvite = async () => {
    if (!inviteCode.trim()) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      await callGrok(accountId, 'AcceptGrokBotAgentAccessInvite', { code: inviteCode.trim() })
      setInviteCode('')
      setHint('已接受共享 Bot 邀请')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="共享与成员邀请 (Access Invites)"
      count={invites.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2.5 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        {hint && <p className="break-all text-ink-secondary">{hint}</p>}

        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
            邀请他人共享此 Bot
          </p>
          <div className="flex gap-1.5">
            <TextInput
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="输入受邀邮箱…"
              aria-label="Invite email"
              className="h-7 flex-1 text-[12px]"
            />
            <Button size="sm" variant="secondary" disabled={busy || !email.trim()} onClick={() => void sendInvite()}>
              发送邀请
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
            接受他人邀请码
          </p>
          <div className="flex gap-1.5">
            <TextInput
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="粘贴邀请码…"
              aria-label="Invite code"
              className="h-7 flex-1 font-mono text-[12px]"
            />
            <Button size="sm" variant="primary" disabled={busy || !inviteCode.trim()} onClick={() => void acceptInvite()}>
              接受
            </Button>
          </div>
        </div>

        {invites.length > 0 && (
          <ul className="flex flex-col gap-1">
            {invites.map((i) => (
              <li key={i.email} className="flex items-center justify-between rounded-lg bg-surface px-2.5 py-1.5">
                <span className="truncate text-ink">{i.email}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

/**
 * 6. Grok Bot Cloud Sandbox Computer (`EnsureSandBox`, `ListGrokBotAgentStatuses`)
 */
export function GrokComputerSection({ accountId, agentId }: { accountId: string; agentId?: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [vmInfo, setVmInfo] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const bridge = getBridge()?.grok
      if (!bridge?.rpc) return
      const res = await bridge.rpc({
        accountId,
        op: 'listAgentStatuses',
        agentIds: agentId ? [agentId] : undefined
      })
      if (res.ok && res.data && typeof res.data === 'object') {
        setVmInfo(res.data as Record<string, unknown>)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId, agentId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  return (
    <Section
      title="Sand 云端沙盒电脑 (CursorVM Sandbox)"
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        <div className="rounded-lg border border-line bg-surface p-2.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink">Grok Sand Pod 状态</span>
            <span className="rounded-full bg-hover px-2 py-0.5 text-[10.5px] font-medium text-ink-secondary">
              {status === 'online' || status === 'busy' ? 'Connected' : 'Standby'}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-ink-muted">
            Agent ID: {agentId || '未选择 Agent'}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
            Workspace: /home/box/sand-data/agents/{agentId || '<id>'}
          </p>
        </div>
        {vmInfo && Object.keys(vmInfo).length > 0 && (
          <pre className="max-h-40 overflow-auto rounded-lg border border-line bg-sunken p-2 font-mono text-[11px] text-ink">
            {JSON.stringify(vmInfo, null, 2)}
          </pre>
        )}
      </div>
    </Section>
  )
}
