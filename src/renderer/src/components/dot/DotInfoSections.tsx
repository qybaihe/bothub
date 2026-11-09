import { useCallback, useEffect, useState } from 'react'
import { Download, Eye, FileText, KeyRound, LogIn, Pause, Play, Plus, Sparkles, Target, Trash2 } from 'lucide-react'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { NativeDocumentDialog, type NativeDocumentTarget } from '@/components/chat/NativeDocumentDialog'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'
import type { ChatMessage } from '@/types'

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

/**
 * 1. Dot Credentials (ChatGPT browser login or AT / RT / JSON import) & Rate Limits (`account/rateLimits/read`)
 */
export function DotCredentialsAndQuotaSection({
  accountId,
  botId
}: {
  accountId: string
  botId: string
}) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const connectAccount = useBotStore((s) => s.connectAccount)
  const renameAccount = useBotStore((s) => s.renameAccount)
  const openDotLogin = useBotStore((s) => s.openDotLogin)

  const [authInfo, setAuthInfo] = useState<{
    signedIn: boolean
    handle?: string
    displayName?: string
    planType?: string
    chatgptAccountId?: string
    mode?: 'dot' | 'native'
    model?: string
    effort?: string
  } | null>(null)

  const [rateLimits, setRateLimits] = useState<{
    planType?: string
    primaryUsedPct?: number
    primaryResetsAt?: number
    secondaryUsedPct?: number
    secondaryResetsAt?: number
  } | null>(null)

  const [showTokenBox, setShowTokenBox] = useState(false)
  const [rawTokenInput, setRawTokenInput] = useState('')
  const [refreshTokenInput, setRefreshTokenInput] = useState('')
  const [autoMigrateMemory, setAutoMigrateMemory] = useState(true)

  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    const dot = getBridge()?.dot
    if (!dot) return
    setLoading(true)
    setError(undefined)
    try {
      const st = await dot.authStatus(accountId)
      setAuthInfo(st)
      if (st.signedIn) {
        const rlRes = await dot.rpc({ accountId, op: 'rateLimits' })
        if (rlRes.ok && rlRes.data && typeof rlRes.data === 'object') {
          const root = asObj(rlRes.data) || {}
          const rl = asObj(root['rateLimits']) || root
          const primary = asObj(rl['primary'])
          const secondary = asObj(rl['secondary'])
          setRateLimits({
            planType: str(rl['planType'] || st.planType || 'pro'),
            primaryUsedPct:
              typeof primary?.['usedPercent'] === 'number' ? primary['usedPercent'] : undefined,
            primaryResetsAt:
              typeof primary?.['resetsAt'] === 'number' ? primary['resetsAt'] : undefined,
            secondaryUsedPct:
              typeof secondary?.['usedPercent'] === 'number' ? secondary['usedPercent'] : undefined,
            secondaryResetsAt:
              typeof secondary?.['resetsAt'] === 'number' ? secondary['resetsAt'] : undefined
          })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    void refresh()
  }, [refresh, status])

  const handleImportRaw = async () => {
    const dot = getBridge()?.dot
    if (!dot?.importCredentials || (!rawTokenInput.trim() && !refreshTokenInput.trim())) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      let priorSnapshot = ''
      let priorGoal: string | undefined
      if (autoMigrateMemory && authInfo?.signedIn && dot.rpc) {
        const expRes = await dot.rpc({ accountId, op: 'exportMemory', mode: 'fast' }).catch(() => null)
        if (expRes && expRes.ok && expRes.data && typeof expRes.data === 'object') {
          const d = expRes.data as { markdown?: string; goal?: string }
          if (d.markdown) {
            priorSnapshot = d.markdown
            priorGoal = d.goal
            try {
              window.localStorage.setItem('bothub.dot.memorySnapshot', d.markdown)
            } catch {
              /* ignore */
            }
          }
        }
      }

      const st = await dot.importCredentials({
        accountId,
        rawInput: rawTokenInput.trim(),
        refreshToken: refreshTokenInput.trim() || undefined
      })
      if (st.displayName || st.handle) {
        renameAccount(accountId, st.displayName || st.handle || 'Dot')
      }
      setRawTokenInput('')
      setRefreshTokenInput('')
      setShowTokenBox(false)
      await connectAccount(accountId)
      if (priorSnapshot && dot.rpc) {
        setHint(`已导入凭据 ${st.handle ?? ''}，正在自动迁移原 Dot 记忆…`)
        await dot
          .rpc({
            accountId,
            op: 'importMemory',
            markdown: priorSnapshot,
            goal: priorGoal,
            botId
          })
          .catch(() => null)
        setHint(`已导入 Dot 凭据 ${st.handle ?? ''} 并完成记忆迁移`)
      } else {
        setHint(`已导入 Dot 凭据：${st.handle ?? accountId}`)
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="Dot 账号凭据与速率配额 (chatgpt.com/dots)"
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2.5 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        {hint && <p className="text-status-online-ink">{hint}</p>}

        <div className="flex flex-col gap-2 rounded-lg bg-surface p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-ink">
              {authInfo?.signedIn
                ? `${authInfo.handle || authInfo.displayName || 'Dot'}`
                : '未登录 ChatGPT Dot'}
            </span>
            {authInfo?.planType && (
              <span className="rounded-full bg-accent-600/15 px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase text-accent-600">
                {authInfo.planType}
              </span>
            )}
          </div>

          {rateLimits && (
            <div className="flex flex-col gap-1.5 pt-1">
              {typeof rateLimits.primaryUsedPct === 'number' && (
                <div>
                  <div className="flex justify-between text-[11.5px]">
                    <span className="text-ink-secondary">5h 窗口已用 (Primary)</span>
                    <span className="font-mono text-ink">{rateLimits.primaryUsedPct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hover">
                    <div
                      className="h-full rounded-full bg-ink/75"
                      style={{ width: `${Math.min(100, rateLimits.primaryUsedPct)}%` }}
                    />
                  </div>
                </div>
              )}
              {typeof rateLimits.secondaryUsedPct === 'number' && (
                <div>
                  <div className="flex justify-between text-[11.5px]">
                    <span className="text-ink-secondary">7d 周额度已用 (Weekly)</span>
                    <span className="font-mono text-ink">{rateLimits.secondaryUsedPct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hover">
                    <div
                      className="h-full rounded-full bg-accent-600"
                      style={{ width: `${Math.min(100, rateLimits.secondaryUsedPct)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-1 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => void openDotLogin(accountId)}
            >
              <LogIn className="size-3.5" /> 网页登录 Dot
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => setShowTokenBox((v) => !v)}
            >
              <KeyRound className="size-3.5" /> 导入 AT / RT 凭据
            </Button>
          </div>
        </div>

        {showTokenBox && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-2.5">
            <textarea
              value={rawTokenInput}
              onChange={(e) => setRawTokenInput(e.target.value)}
              placeholder="粘贴 ChatGPT access_token (eyJ...)、refresh_token (rt_...) 或 JSON (auth.json)…"
              rows={3}
              className="w-full rounded border border-line bg-transparent p-2 font-mono text-[11px] text-ink outline-none"
            />
            <TextInput
              value={refreshTokenInput}
              onChange={(e) => setRefreshTokenInput(e.target.value)}
              placeholder="可选：单独粘贴 refresh_token (rt_...) 用于自动续期"
              aria-label="Refresh Token"
              className="h-7 font-mono text-[11px]"
            />
            {authInfo?.signedIn && (
              <label className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[11px] text-ink-secondary">
                <input
                  type="checkbox"
                  checked={autoMigrateMemory}
                  onChange={(e) => setAutoMigrateMemory(e.target.checked)}
                  className="size-3 accent-accent-600"
                />
                更换账号时自动迁移当前 Dot 记忆
              </label>
            )}
            <Button
              size="sm"
              variant="primary"
              disabled={busy || (!rawTokenInput.trim() && !refreshTokenInput.trim())}
              onClick={() => void handleImportRaw()}
            >
              {busy ? '正在验证并连接…' : '保存并连接 Dot'}
            </Button>
          </div>
        )}
      </div>
    </Section>
  )
}

/**
 * 2. Dot Orbit Profiles (`/backend-api/tbo`), Engine Mode (`dot` Room vs `native` `gpt-6-astra`), & Runtime Pause
 */
export function DotOrbitProfilesSection({
  accountId,
  botId
}: {
  accountId: string
  botId: string
}) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [dots, setDots] = useState<
    Array<{
      id: string
      displayName: string
      messagingRoomId: string
      activeRootThreadId: string
      status: string
      isPaused?: boolean
      isPrimary?: boolean
    }>
  >([])
  const [activeDotId, setActiveDotId] = useState<string>('')
  const [newDotName, setNewDotName] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc) return
    setLoading(true)
    setError(undefined)
    try {
      const st = await dotBridge.authStatus(accountId)
      if (!st.signedIn) return

      const res = await dotBridge.rpc({ accountId, op: 'listDots', ensureDefault: false })
      if (res.ok && res.data && typeof res.data === 'object') {
        const d = res.data as {
          items?: typeof dots
          activeDot?: (typeof dots)[number]
        }
        if (Array.isArray(d.items)) setDots(d.items)
        if (d.activeDot?.id) setActiveDotId(d.activeDot.id)
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

  const selectDotProfile = async (dotId: string) => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await dotBridge.rpc({ accountId, op: 'selectDot', dotId, botId })
      if (res.ok && res.data && typeof res.data === 'object') {
        const d = res.data as {
          dot?: { id: string; displayName: string; messagingRoomId: string }
          messages?: Array<{
            id: string
            role: 'user' | 'bot'
            text: string
            createdAtMs: number
            media?: ChatMessage['media']
          }>
        }
        if (d.dot?.id) setActiveDotId(d.dot.id)
        if (Array.isArray(d.messages)) {
          const hydrated: ChatMessage[] = d.messages
            .filter((m) => (m.text && m.text.trim()) || (m.media && m.media.length > 0))
            .map((m) => {
              const cleanId = m.id.replace(/^(dot_u_|dot_)+/, '')
              return {
                id: m.role === 'user' ? `dot_u_${cleanId}` : `dot_${cleanId}`,
                botId,
                accountId,
                role: m.role,
                text: m.text || '',
                createdAt: m.createdAtMs || Date.now(),
                delivery: m.role === 'user' ? 'sent' : undefined,
                ...(m.media && m.media.length > 0 ? { media: m.media } : {})
              }
            })
          useBotStore.setState((s) => ({
            messages: { ...s.messages, [botId]: hydrated }
          }))
        }
        setHint(`已切换到 ${d.dot?.displayName || dotId}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleCreateDot = async () => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc) return
    setBusy(true)
    setError(undefined)
    try {
      const res = await dotBridge.rpc({
        accountId,
        op: 'createDot',
        displayName: newDotName.trim() || 'Dot'
      })
      if (res.ok) {
        setNewDotName('')
        setHint('已创建新的 Dot 分身 (/backend-api/tbo)')
        await refresh()
      } else {
        setError(res.message)
      }
    } finally {
      setBusy(false)
    }
  }

  const handlePauseResume = async (dotId: string, isPaused?: boolean) => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc) return
    setBusy(true)
    try {
      await dotBridge.rpc({
        accountId,
        op: isPaused ? 'resumeRuntime' : 'pauseRuntime',
        dotId
      })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteDot = async (dotId: string) => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc) return
    setBusy(true)
    try {
      await dotBridge.rpc({ accountId, op: 'deleteDot', dotId })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="Dot 实例管理 (Orbit / Aeon)"
      count={dots.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2.5 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        {hint && <p className="text-ink-secondary">{hint}</p>}

        {/* Dot Profiles List */}
        {dots.length === 0 ? (
          <EmptyLine>暂无 Dot 实例，点击下方新建或发送消息自动初始化</EmptyLine>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {dots.map((d) => {
              const isSelected = d.id === activeDotId
              return (
                <li
                  key={d.id}
                  className={
                    isSelected
                      ? 'rounded-lg border border-accent-600/50 bg-accent-600/5 p-2.5'
                      : 'rounded-lg border border-line bg-surface p-2.5'
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void selectDotProfile(d.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    >
                      <span className="truncate font-medium text-ink">{d.displayName}</span>
                      {isSelected && (
                        <span className="rounded bg-accent-600/15 px-1.5 py-0.5 text-[10px] font-medium text-accent-600">
                          当前
                        </span>
                      )}
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void handlePauseResume(d.id, d.isPaused)}
                        title={d.isPaused ? '恢复运行' : '暂停当前轮次'}
                      >
                        {d.isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                      </Button>
                      {dots.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void handleDeleteDot(d.id)}
                          title={t('Delete')}
                        >
                          <Trash2 className="size-3.5 text-status-error" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10.5px] text-ink-muted">
                    Room: {d.messagingRoomId.slice(0, 18)}…
                  </p>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex gap-1.5">
          <TextInput
            value={newDotName}
            onChange={(e) => setNewDotName(e.target.value)}
            placeholder="新 Dot 名称 (如 Research Dot)…"
            aria-label="New Dot name"
            className="h-7 flex-1 text-[12px]"
          />
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void handleCreateDot()}>
            <Plus className="size-3.5" /> 新建 Dot
          </Button>
        </div>
      </div>
    </Section>
  )
}

/**
 * 3. Dot Thread Goal (`thread/goal/get`, `thread/goal/set`, `thread/goal/clear`),
 *    Cross-Account Memory Snapshot & Migration (`exportMemory` / `importMemory`), & Threads (`/backend-api/tbo/{id}/threads`)
 */
export function DotGoalAndThreadsSection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const bots = useBotStore((s) => s.bots)
  const [goal, setGoal] = useState('')
  const [threads, setThreads] = useState<Array<{ id: string; title: string; updatedAt?: string }>>([])
  const [memorySnapshot, setMemorySnapshot] = useState(() => {
    try {
      return typeof window !== 'undefined'
        ? window.localStorage.getItem('bothub.dot.memorySnapshot') || ''
        : ''
    } catch {
      return ''
    }
  })
  const [targetBotId, setTargetBotId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string>()
  const [error, setError] = useState<string>()

  const otherDotBots = bots.filter(
    (b) => b.platformId === 'dot' && b.activeAccountId && b.activeAccountId !== accountId
  )

  const updateSnapshotText = (val: string) => {
    setMemorySnapshot(val)
    try {
      window.localStorage.setItem('bothub.dot.memorySnapshot', val)
    } catch {
      /* ignore */
    }
  }

  const refresh = useCallback(async () => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc) return
    setLoading(true)
    try {
      const [gRes, tRes] = await Promise.all([
        dotBridge.rpc({ accountId, op: 'getGoal' }).catch(() => null),
        dotBridge.rpc({ accountId, op: 'listThreads' }).catch(() => null)
      ])
      if (gRes && gRes.ok && gRes.data && typeof gRes.data === 'object') {
        const go = asObj(gRes.data)
        setGoal(str(go?.['goal'] ?? ''))
      }
      if (tRes && tRes.ok && tRes.data && typeof tRes.data === 'object') {
        const to = asObj(tRes.data)
        const items = Array.isArray(to?.['items']) ? to['items'] : []
        setThreads(
          items.map((item, idx) => {
            const r = asObj(item) || {}
            return {
              id: str(r['thread_id'] ?? r['id'] ?? idx),
              title: str(r['title'] ?? r['summary'] ?? r['thread_id'] ?? `Thread ${idx + 1}`),
              updatedAt: str(r['updated_at'] ?? '')
            }
          })
        )
      }
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy') void refresh()
  }, [refresh, status])

  const saveGoal = async () => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc) return
    setBusy(true)
    try {
      if (goal.trim()) {
        await dotBridge.rpc({ accountId, op: 'setGoal', goal: goal.trim() })
        setHint('已保存 Dot 长期目标 (thread/goal/set)')
      } else {
        await dotBridge.rpc({ accountId, op: 'clearGoal' })
        setHint('已清除 Dot 目标')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleExportMemory = async (mode: 'fast' | 'deep') => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc) return
    setBusy(true)
    setError(undefined)
    setHint(
      mode === 'deep'
        ? '正在请求 Dot (aeon) 完整盘点并导出 # Dot 记忆快照（约需 25–40 秒）…'
        : '正在提取当前 Dot 记忆快照…'
    )
    try {
      const res = await dotBridge.rpc({ accountId, op: 'exportMemory', mode })
      if (res.ok && res.data && typeof res.data === 'object') {
        const d = res.data as {
          markdown?: string
          sourceHandle?: string
          roomMessagesCount?: number
          globalMemoriesCount?: number
        }
        if (d.markdown) {
          updateSnapshotText(d.markdown)
          setHint(
            `已提取 ${d.sourceHandle || accountId} 的记忆快照（Room 消息 ${d.roomMessagesCount ?? 0} 条 · 全局记忆 ${d.globalMemoriesCount ?? 0} 条），可一键注入任意新账号`
          )
        }
      } else if (!res.ok) {
        setError(res.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleImportMemoryTo = async (destAccountId: string, destBotId?: string) => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc || !memorySnapshot.trim()) return
    setBusy(true)
    setError(undefined)
    setHint('正在将 # Dot 记忆快照 注入目标 Dot 的 Calpico Room 与长期目标…')
    try {
      const res = await dotBridge.rpc({
        accountId: destAccountId,
        op: 'importMemory',
        markdown: memorySnapshot.trim(),
        goal: goal.trim() || undefined,
        botId: destBotId
      })
      if (res.ok) {
        setHint('记忆迁移完成！Dot 已将身份、项目栈、偏好与上下文写入新账号长期记忆')
      } else {
        setError(res.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const currentBot = bots.find((b) => b.activeAccountId === accountId)

  return (
    <Section
      title="Dot 跨号记忆迁移与长期目标 (Memory & Goal)"
      count={threads.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2.5 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}
        {hint && <p className="text-status-online-ink">{hint}</p>}

        {/* Cross-account Memory Snapshot & Migration */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-medium text-ink">
              跨账号记忆快照 (`# Dot 记忆快照`)
            </span>
            <span className="text-[10.5px] text-ink-muted">全局共享 · 换号可一键注入</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void handleExportMemory('fast')}
            >
              提取当前记忆 (秒级)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void handleExportMemory('deep')}
            >
              <Sparkles className="size-3.5" /> 让 Dot 深度整理快照
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !memorySnapshot.trim()}
              onClick={() => void handleImportMemoryTo(accountId, currentBot?.id)}
            >
              注入记忆到当前账号
            </Button>
          </div>

          <textarea
            value={memorySnapshot}
            onChange={(e) => updateSnapshotText(e.target.value)}
            placeholder="点击“提取当前记忆”生成 # Dot 记忆快照（含身份、技术栈、回复偏好、目标与上下文），切换新账号或新建 Dot Bot 后点击“注入记忆到当前账号”即可完成跨号记忆迁移…"
            rows={6}
            className="mt-1 w-full rounded border border-line bg-transparent p-2 font-mono text-[11px] leading-[15px] text-ink outline-none"
          />

          {otherDotBots.length > 0 && memorySnapshot.trim() && (
            <div className="mt-1 flex items-center gap-1.5">
              <select
                value={targetBotId || otherDotBots[0]?.id || ''}
                onChange={(e) => setTargetBotId(e.target.value)}
                className="h-7 min-w-0 flex-1 rounded border border-line bg-main px-2 text-[11.5px] text-ink outline-none"
              >
                {otherDotBots.map((b) => (
                  <option key={b.id} value={b.id}>
                    迁移至：{b.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  const dest =
                    otherDotBots.find((b) => b.id === targetBotId) ?? otherDotBots[0]
                  if (dest?.activeAccountId) {
                    void handleImportMemoryTo(dest.activeAccountId, dest.id)
                  }
                }}
              >
                一键跨 Bot 迁移
              </Button>
            </div>
          )}
        </div>

        <div className="flex gap-1.5">
          <TextInput
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="设置此 Dot 的长期目标 (thread/goal/set)…"
            aria-label="Dot goal"
            className="h-7 flex-1 text-[12px]"
          />
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void saveGoal()}>
            <Target className="size-3.5" /> 保存
          </Button>
        </div>

        {threads.length > 0 && (
          <ul className="flex flex-col gap-1">
            {threads.map((th) => (
              <li
                key={th.id}
                className="flex items-center justify-between rounded bg-surface px-2.5 py-1.5 text-[11.5px]"
              >
                <span className="truncate font-mono text-ink">{th.title}</span>
                <span className="ml-2 shrink-0 font-mono text-[10px] text-ink-muted">
                  {th.id.slice(0, 8)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

/**
 * 4. Dot Library & Dynamic Pages (`/backend-api/files/library/nodes` & `/backend-api/pages`)
 */
export function DotLibrarySection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const setActiveDocument = useBotStore((s) => s.setActiveDocument)
  const [nodes, setNodes] = useState<
    Array<{
      id: string
      title: string
      kind: string
      updatedAt?: string
    }>
  >([])
  const [newPageTitle, setNewPageTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [docTarget, setDocTarget] = useState<NativeDocumentTarget | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleDownloadNode = async (n: { id: string; title: string }) => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc) return
    setDownloadingId(n.id)
    setError(undefined)
    try {
      const res = await dotBridge.rpc({
        accountId,
        op: 'downloadFile',
        fileId: n.id,
        name: n.title
      })
      if (!res.ok) {
        setError(res.message || `下载失败 (${res.status})`)
        return
      }
      const d = res.data as { dataBase64: string; mimeType: string; filename: string }
      const bin = atob(d.dataBase64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], { type: d.mimeType || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = d.filename || n.title || 'download'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDownloadingId(null)
    }
  }

  const refresh = useCallback(async () => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc) return
    setLoading(true)
    setError(undefined)
    try {
      const res = await dotBridge.rpc({ accountId, op: 'listLibrary', limit: 25 })
      if (res.ok && res.data && typeof res.data === 'object') {
        const o = asObj(res.data) || {}
        const list =
          (Array.isArray(o['items']) && o['items']) ||
          (Array.isArray(o['nodes']) && o['nodes']) ||
          []
        setNodes(
          list.map((item, idx) => {
            const r = asObj(item) || {}
            return {
              id: str(r['id'] ?? r['page_id'] ?? r['node_id'] ?? idx),
              title: str(r['title'] ?? r['name'] ?? 'Untitled Page'),
              kind: str(r['node_type'] ?? r['type'] ?? r['layout'] ?? 'page'),
              updatedAt: str(r['updated_at'] ?? '')
            }
          })
        )
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

  const handleCreatePage = async () => {
    const dotBridge = getBridge()?.dot
    if (!dotBridge?.rpc || !newPageTitle.trim()) return
    setBusy(true)
    try {
      await dotBridge.rpc({
        accountId,
        op: 'createPage',
        title: newPageTitle.trim(),
        layout: 'document'
      })
      setNewPageTitle('')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="Dot 动态页面与资料库 (Dynamic Pages & Library)"
      count={nodes.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2 px-3 pb-2.5 pt-1 text-[12px]">
        {error && <p className="text-status-error">{error}</p>}

        <div className="flex gap-1.5">
          <TextInput
            value={newPageTitle}
            onChange={(e) => setNewPageTitle(e.target.value)}
            placeholder="新建 Dynamic Page 标题 (/backend-api/pages)…"
            aria-label="New Dynamic Page title"
            className="h-7 flex-1 text-[12px]"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !newPageTitle.trim()}
            onClick={() => void handleCreatePage()}
          >
            <Plus className="size-3.5" /> 新建页面
          </Button>
        </div>

        {nodes.length === 0 ? (
          <EmptyLine>{t('Files the bot creates show up here')}</EmptyLine>
        ) : (
          <ul className="divide-y divide-line">
            {nodes.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-2 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-hover text-ink-secondary">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{n.title}</p>
                    <p className="truncate font-mono text-[11px] text-ink-muted">
                      {n.kind} · {n.id}
                    </p>
                  </div>
                </div>
                {(n.id.startsWith('file_') ||
                  n.id.startsWith('libfile_') ||
                  n.kind === 'file') && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setActiveDocument({
                          accountId,
                          title: n.title,
                          path: n.id,
                          platformId: 'dot'
                        })
                      }
                      title="在右侧画布预览文件"
                    >
                      <Eye className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={downloadingId === n.id}
                      onClick={() => void handleDownloadNode(n)}
                      title="下载文件"
                    >
                      <Download className="size-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <NativeDocumentDialog target={docTarget} onClose={() => setDocTarget(null)} />
    </Section>
  )
}
