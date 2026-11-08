import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Download,
  FileUp,
  FolderPlus,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  Trash2,
  Users
} from 'lucide-react'
import type { PlatformId } from '@adapters/types'
import type { MuseProxyMode, MuseProxyPoolItemView, MuseProxyView } from '@shared/ipc'
import { createId } from '@shared/id'
import { PaneHeader } from '@/components/layout/PaneHeader'
import { MuseBatchImport } from '@/components/add-bot/MuseBatchImport'
import { BotAvatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { StatusBadge } from '@/components/ui/Status'
import { getBridge } from '@/lib/bridge'
import { cn } from '@/lib/cn'
import { useT, t } from '@/lib/i18n'
import { platformIcon } from '@/lib/platformIcons'
import { useBotStore } from '@/store/botStore'
import { usePrefsStore, type Locale, type ThemePref } from '@/store/prefsStore'

type SettingsTab =
  | 'overview'
  | 'muse-accounts'
  | 'dot-accounts'
  | 'grok-accounts'
  | 'hark-accounts'
  | 'proxy-pool'
  | 'general'

interface DotStoredMeta {
  accountId: string
  handle?: string
  displayName?: string
  planType?: string
  activeDotId?: string
  roomId?: string
  mode?: 'dot' | 'native'
  model?: string
  effort?: string
  hasRefreshToken?: boolean
  expiresAtMs?: number
  updatedAt?: number
  hasProxy?: boolean
}

const PROXY_PLACEHOLDER = `# 支持每行一个代理（自动识别格式）：
socks5://user:pass@127.0.0.1:1080
socks5h://127.0.0.1:1080
http://user:pass@127.0.0.1:7890
192.168.1.10:1080:username:password
127.0.0.1:7890`

const PLATFORM_LABELS: Record<PlatformId, string> = {
  'meta-muse': 'Meta Muse',
  dot: 'ChatGPT Dot',
  grok: 'Grok Bot',
  hark: 'Hark Pro'
}

export function SettingsView() {
  const tr = useT()
  const settingsTab = useBotStore((s) => s.settingsTab)
  const setSettingsOpen = useBotStore((s) => s.setSettingsOpen)
  const groups = useBotStore((s) => s.groups)
  const bots = useBotStore((s) => s.bots)
  const accounts = useBotStore((s) => s.accounts)
  const messages = useBotStore((s) => s.messages)
  const addBot = useBotStore((s) => s.addBot)
  const selectBot = useBotStore((s) => s.selectBot)
  const connectAccount = useBotStore((s) => s.connectAccount)
  const openMuseLogin = useBotStore((s) => s.openMuseLogin)
  const openGrokLogin = useBotStore((s) => s.openGrokLogin)
  const openHarkLogin = useBotStore((s) => s.openHarkLogin)
  const openDotLogin = useBotStore((s) => s.openDotLogin)
  const renameAccount = useBotStore((s) => s.renameAccount)
  const renameBot = useBotStore((s) => s.renameBot)
  const addGroup = useBotStore((s) => s.addGroup)
  const renameGroup = useBotStore((s) => s.renameGroup)
  const removeGroup = useBotStore((s) => s.removeGroup)
  const moveBotToGroup = useBotStore((s) => s.moveBotToGroup)
  const togglePinBot = useBotStore((s) => s.togglePinBot)
  const setGrokAccessToken = useBotStore((s) => s.setGrokAccessToken)
  const signOutAccount = useBotStore((s) => s.signOutAccount)
  const removeBot = useBotStore((s) => s.removeBot)
  const clearAllCredentials = useBotStore((s) => s.clearAllCredentials)
  const resetWorkspace = useBotStore((s) => s.resetWorkspace)

  const theme = usePrefsStore((s) => s.theme)
  const setTheme = usePrefsStore((s) => s.setTheme)
  const locale = usePrefsStore((s) => s.locale)
  const setLocale = usePrefsStore((s) => s.setLocale)

  const [pool, setPool] = useState<MuseProxyPoolItemView[]>([])
  const [accountProxies, setAccountProxies] = useState<Record<string, MuseProxyView>>({})
  const [dotMetaMap, setDotMetaMap] = useState<Record<string, DotStoredMeta>>({})
  const [rawProxyText, setRawProxyText] = useState('')
  const [defaultMode, setDefaultMode] = useState<Exclude<MuseProxyMode, 'direct'>>('socks5')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string>()
  const [error, setError] = useState<string>()
  const [batchOpen, setBatchOpen] = useState(false)

  // Overview filters & inline editing
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState<'all' | 'meta-muse' | 'dot' | 'grok' | 'hark'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [editingBotId, setEditingBotId] = useState<string | null>(null)
  const [editingBotName, setEditingBotName] = useState('')

  // Platform credential import states
  const [grokTokenInput, setGrokTokenInput] = useState('')
  const [grokRefreshInput, setGrokRefreshInput] = useState('')
  const [grokTargetAccountId, setGrokTargetAccountId] = useState<string>('__new__')

  const [dotRawInput, setDotRawInput] = useState('')
  const [dotRefreshInput, setDotRefreshInput] = useState('')
  const [dotTargetAccountId, setDotTargetAccountId] = useState<string>('__new__')
  const [dotMigrateMemory, setDotMigrateMemory] = useState(true)

  const [harkRawInput, setHarkRawInput] = useState('')
  const [harkTargetAccountId, setHarkTargetAccountId] = useState<string>('__new__')

  // Group management states
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')

  // Security confirmation states
  const [confirmWipeCreds, setConfirmWipeCreds] = useState(false)
  const [confirmResetAll, setConfirmResetAll] = useState(false)

  const [version, setVersion] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dotInputRef = useRef<HTMLTextAreaElement>(null)

  const allAccounts = useMemo(() => Object.values(accounts), [accounts])
  const museBots = useMemo(() => bots.filter((b) => b.platformId === 'meta-muse'), [bots])
  const museAccounts = useMemo(() => allAccounts.filter((a) => a.platformId === 'meta-muse'), [allAccounts])
  const dotBots = useMemo(() => bots.filter((b) => b.platformId === 'dot'), [bots])
  const dotAccounts = useMemo(() => allAccounts.filter((a) => a.platformId === 'dot'), [allAccounts])
  const grokBots = useMemo(() => bots.filter((b) => b.platformId === 'grok'), [bots])
  const grokAccounts = useMemo(() => allAccounts.filter((a) => a.platformId === 'grok'), [allAccounts])
  const harkBots = useMemo(() => bots.filter((b) => b.platformId === 'hark'), [bots])
  const harkAccounts = useMemo(() => allAccounts.filter((a) => a.platformId === 'hark'), [allAccounts])

  const onlineAccountsCount = useMemo(
    () => allAccounts.filter((a) => a.status === 'online' || a.status === 'busy' || a.status === 'attention').length,
    [allAccounts]
  )

  const refreshProxiesAndPool = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse) return
    try {
      if (muse.listProxyPool) {
        const items = await muse.listProxyPool()
        setPool(items)
      }
      if (muse.getProxy) {
        const nextMap: Record<string, MuseProxyView> = {}
        const allAccs = Object.values(useBotStore.getState().accounts).filter(
          (a) => a.platformId === 'meta-muse'
        )
        await Promise.all(
          allAccs.map(async (acc) => {
            try {
              nextMap[acc.id] = await muse.getProxy(acc.id)
            } catch {
              /* ignore */
            }
          })
        )
        setAccountProxies(nextMap)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const refreshDotStoredMeta = useCallback(async () => {
    const dot = getBridge()?.dot
    if (!dot?.rpc) return
    try {
      const res = await dot.rpc({ accountId: '_', op: 'listStoredAccounts' })
      if (res.ok && Array.isArray(res.data)) {
        const map: Record<string, DotStoredMeta> = {}
        for (const item of res.data as DotStoredMeta[]) {
          if (item && typeof item.accountId === 'string') {
            map[item.accountId] = item
          }
        }
        setDotMetaMap(map)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refreshProxiesAndPool()
  }, [refreshProxiesAndPool, museAccounts.length])

  useEffect(() => {
    void refreshDotStoredMeta()
  }, [refreshDotStoredMeta, dotAccounts.length, settingsTab])

  useEffect(() => {
    const updates = getBridge()?.updates
    if (!updates) return
    void updates.version().then(setVersion)
    return updates.onEvent((ev) => setCheckingUpdate(ev.type === 'checking'))
  }, [])

  const filteredBots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return bots.filter((bot) => {
      if (platformFilter !== 'all' && bot.platformId !== platformFilter) return false
      const acc = accounts[bot.activeAccountId]
      const isOnline = acc?.status === 'online' || acc?.status === 'busy' || acc?.status === 'attention'
      if (statusFilter === 'online' && !isOnline) return false
      if (statusFilter === 'offline' && isOnline) return false
      if (!q) return true
      const hay = `${bot.name} ${acc?.displayName ?? ''} ${acc?.handle ?? ''} ${bot.activeAccountId}`.toLowerCase()
      return hay.includes(q)
    })
  }, [bots, accounts, searchQuery, platformFilter, statusFilter])

  const handleReconnectAll = async (onlyOffline = false) => {
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      const targets = allAccounts.filter((a) => (onlyOffline ? a.status === 'offline' || a.status === 'error' : true))
      await Promise.all(targets.map((a) => connectAccount(a.id).catch(() => undefined)))
      await refreshDotStoredMeta()
      setHint(`已完成 ${targets.length} 个账号的连接巡检与会话同步`)
    } finally {
      setBusy(false)
    }
  }

  const handleImportPool = async () => {
    const muse = getBridge()?.muse
    if (!muse?.importProxyPool || !rawProxyText.trim()) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      const res = await muse.importProxyPool(rawProxyText, defaultMode)
      setRawProxyText('')
      setPool(res.items)
      const ids = museAccounts.map((a) => a.id)
      if (ids.length > 0 && muse.assignProxyPool) {
        const assigned = await muse.assignProxyPool(ids)
        setPool(assigned.items)
        setHint(`已导入 ${res.added} 个代理（池共 ${res.total} 个），并已自动为 ${assigned.assignedCount} 个 Muse 账号一对一绑定代理`)
      } else {
        setHint(`已导入 ${res.added} 个代理（池共 ${res.total} 个）；新建或导入 Muse 账号时将自动一对一分配`)
      }
      await refreshProxiesAndPool()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleAutoAssignAll = async () => {
    const muse = getBridge()?.muse
    if (!muse?.assignProxyPool) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      const ids = museAccounts.map((a) => a.id)
      const res = await muse.assignProxyPool(ids)
      setPool(res.items)
      setHint(`已为 ${res.assignedCount} / ${ids.length} 个 Muse 账号完成一对一代理匹配`)
      await refreshProxiesAndPool()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleRemovePoolItem = async (id: string) => {
    const muse = getBridge()?.muse
    if (!muse?.removeProxyPoolItem) return
    const next = await muse.removeProxyPoolItem(id)
    setPool(next)
  }

  const handleClearPool = async () => {
    const muse = getBridge()?.muse
    if (!muse?.clearProxyPool) return
    const next = await muse.clearProxyPool()
    setPool(next)
    setHint('已清空代理池')
  }

  const handleQuickAddMuseAccount = async () => {
    const accountId = createId('acc')
    const botId = createId('bot')
    const index = museBots.length + 1
    const muse = getBridge()?.muse
    if (muse?.assignProxyPool) {
      const ids = [...museAccounts.map((a) => a.id), accountId]
      await muse.assignProxyPool(ids).catch(() => undefined)
    }
    addBot({
      id: botId,
      platformId: 'meta-muse',
      name: `Muse ${index}`,
      accounts: [{ key: accountId, accountId, displayName: `Muse ${index}`, handle: '' }],
      background: true
    })
    await refreshProxiesAndPool()
    void openMuseLogin(accountId)
  }

  const handleQuickAddGrokAccount = () => {
    const accountId = createId('acc')
    const botId = createId('bot')
    const index = grokBots.length + 1
    addBot({
      id: botId,
      platformId: 'grok',
      name: `Grok Bot ${index}`,
      accounts: [{ key: accountId, accountId, displayName: `Grok ${index}`, handle: '' }],
      background: true
    })
    void openGrokLogin(accountId)
  }

  const handleImportGrokToken = async () => {
    const token = grokTokenInput.trim()
    const rt = grokRefreshInput.trim() || undefined
    if (!token) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      const isNew = grokTargetAccountId === '__new__' || !accounts[grokTargetAccountId]
      const accountId = isNew ? createId('acc') : grokTargetAccountId
      if (isNew) {
        const botId = createId('bot')
        const index = grokBots.length + 1
        addBot({
          id: botId,
          platformId: 'grok',
          name: `Grok Bot ${index}`,
          accounts: [{ key: accountId, accountId, displayName: `Grok ${index}`, handle: '' }],
          background: true
        })
      }
      setGrokTokenInput('')
      setGrokRefreshInput('')
      setGrokTargetAccountId('__new__')
      await setGrokAccessToken(accountId, token, undefined, undefined, rt)
      setHint(isNew ? '已导入 Grok Sand Token 并新建 Grok Bot' : '已更新 Grok 账号 Token 并重新同步')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleQuickAddHarkAccount = async () => {
    const accountId = createId('acc')
    const botId = createId('bot')
    const index = harkBots.length + 1
    const muse = getBridge()?.muse
    if (muse?.assignProxyPool) {
      const ids = [...museAccounts.map((a) => a.id), ...harkAccounts.map((a) => a.id), accountId]
      await muse.assignProxyPool(ids).catch(() => undefined)
    }
    addBot({
      id: botId,
      platformId: 'hark',
      name: `Hark ${index}`,
      accounts: [{ key: accountId, accountId, displayName: `Hark ${index}`, handle: '' }],
      background: true
    })
    await refreshProxiesAndPool()
    void openHarkLogin(accountId)
  }

  const handleImportHarkCredentials = async () => {
    const hark = getBridge()?.hark
    if (!hark?.importCredentials || !harkRawInput.trim()) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      const isNew = harkTargetAccountId === '__new__' || !accounts[harkTargetAccountId]
      const targetId = isNew ? createId('acc_hark') : harkTargetAccountId
      const st = await hark.importCredentials({
        accountId: targetId,
        rawInput: harkRawInput.trim()
      })
      if (!st.signedIn) {
        setError('未检测到有效 Hark 会话，请检查 Cookie（含 __Secure-hark.session_token）或 Token 是否有效')
        return
      }
      const label = st.displayName || st.handle || `Hark ${harkBots.length + 1}`
      if (isNew) {
        addBot({
          id: `bot_${targetId}`,
          platformId: 'hark',
          name: `Hark · ${label}`,
          emoji: '✨',
          accounts: [{ key: targetId, accountId: targetId, displayName: label, handle: st.handle ?? '' }],
          background: true
        })
      } else {
        renameAccount(targetId, label)
        await connectAccount(targetId)
      }
      setHarkRawInput('')
      setHarkTargetAccountId('__new__')
      setHint(`已成功导入 Hark 账号：${label} (${st.handle || targetId}) 并同步对话历史`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleQuickAddDotAccount = () => {
    const accountId = createId('acc_dot')
    const botId = createId('bot')
    const index = dotBots.length + 1
    addBot({
      id: botId,
      platformId: 'dot',
      name: `Dot ${index}`,
      emoji: '🪐',
      accounts: [{ key: accountId, accountId, displayName: `Dot ${index}`, handle: '' }],
      background: true
    })
    void openDotLogin(accountId)
  }

  const handleImportDotCredentials = async () => {
    const dot = getBridge()?.dot
    if (!dot?.importCredentials) return
    const raw = dotRawInput.trim()
    const rt = dotRefreshInput.trim()
    if (!raw && !rt) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      const isNew = dotTargetAccountId === '__new__' || !accounts[dotTargetAccountId]

      // Support batch multi-line AT/RT or JSON array when creating new Dot Bots
      if (isNew && !rt) {
        let batchItems: string[] = []
        if (raw.startsWith('[')) {
          try {
            const arr = JSON.parse(raw) as unknown[]
            if (Array.isArray(arr) && arr.length > 1) {
              batchItems = arr.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
            }
          } catch {
            /* single payload */
          }
        } else if (!raw.startsWith('{')) {
          const lines = raw
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('#'))
          if (lines.length > 1) {
            batchItems = lines
          }
        }

        if (batchItems.length > 1) {
          let okCount = 0
          const importedNames: string[] = []
          for (const item of batchItems) {
            try {
              const accId = createId('acc_dot')
              const st = await dot.importCredentials({ accountId: accId, rawInput: item })
              const label = st.handle || st.displayName || accId
              addBot({
                id: `bot_${accId}`,
                platformId: 'dot',
                name: `Dot · ${label}`,
                emoji: '🪐',
                accounts: [{ key: accId, accountId: accId, displayName: label, handle: st.handle ?? label }],
                background: true
              })
              okCount++
              importedNames.push(label)
            } catch {
              /* continue remaining items */
            }
          }
          setDotRawInput('')
          await refreshDotStoredMeta()
          if (okCount === 0) {
            setError('批量导入未成功，请检查每行 AT / RT 或 JSON 格式是否正确')
          } else {
            setHint(`已批量导入 ${okCount} / ${batchItems.length} 个 Dot 账号：${importedNames.join('、')}`)
          }
          return
        }
      }

      const accountId = isNew ? createId('acc_dot') : dotTargetAccountId
      const st = await dot.importCredentials({
        accountId,
        rawInput: raw,
        refreshToken: rt || undefined,
        migrateDataFromAccountId: !isNew && dotMigrateMemory ? accountId : undefined
      })
      const label = st.handle || st.displayName || accountId
      if (isNew) {
        const botId = `bot_${accountId}`
        addBot({
          id: botId,
          platformId: 'dot',
          name: `Dot · ${label}`,
          emoji: '🪐',
          accounts: [
            {
              key: accountId,
              accountId,
              displayName: label,
              handle: st.handle ?? label
            }
          ],
          background: true
        })
      } else {
        renameAccount(accountId, label)
        const ownerBot = bots.find((b) => b.accountIds.includes(accountId))
        if (ownerBot && ownerBot.name.startsWith('Dot')) {
          renameBot(ownerBot.id, `Dot · ${label}`)
        }
        await connectAccount(accountId)
      }
      setDotRawInput('')
      setDotRefreshInput('')
      setDotTargetAccountId('__new__')
      await refreshDotStoredMeta()
      const migratedMsg = st.migration
        ? `（已迁移目标 ${st.migration.goalCopied ? '✓' : '—'}、记忆 ${st.migration.memoriesCopied} 条）`
        : ''
      setHint(
        `已成功导入 Dot 账号：${label}${st.planType ? ` (${st.planType})` : ''} ${migratedMsg}`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleExportSanitizedConfig = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: version || '0.2.8',
      sanitized: true,
      groups,
      bots: bots.map((b) => ({
        id: b.id,
        name: b.name,
        platformId: b.platformId,
        emoji: b.emoji,
        groupId: b.groupId,
        pinned: Boolean(b.pinned)
      })),
      accounts: allAccounts.map((a) => ({
        id: a.id,
        platformId: a.platformId,
        displayName: a.displayName,
        status: a.status
      }))
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bothub-workspace-sanitized-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setHint('已导出不含任何 Token、Cookie 或密码的脱敏工作区结构文件')
  }

  const handleWipeAllCredentials = async () => {
    if (!confirmWipeCreds) {
      setConfirmWipeCreds(true)
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      await clearAllCredentials()
      setPool([])
      setAccountProxies({})
      setDotMetaMap({})
      setConfirmWipeCreds(false)
      setHint('已彻底清除所有平台的登录凭据、OAuth Token、会话 Cookie 与代理池密码')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleFactoryReset = async () => {
    if (!confirmResetAll) {
      setConfirmResetAll(true)
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      await resetWorkspace()
      setPool([])
      setAccountProxies({})
      setDotMetaMap({})
      setConfirmResetAll(false)
      setHint('已清空全部敏感凭据、测试账号与对话记录，应用已恢复至可发布的纯净初始状态')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const NAV: Array<{ id: SettingsTab; label: string; icon: typeof Users; platformId?: PlatformId; count?: number }> = [
    { id: 'overview', label: '全局总览与巡检', icon: LayoutDashboard, count: bots.length },
    { id: 'muse-accounts', label: 'Muse 账号管理', icon: Users, platformId: 'meta-muse', count: museAccounts.length },
    { id: 'dot-accounts', label: 'Dot 账号管理', icon: Users, platformId: 'dot', count: dotAccounts.length },
    { id: 'grok-accounts', label: 'Grok Bot 账号管理', icon: Users, platformId: 'grok', count: grokAccounts.length },
    { id: 'hark-accounts', label: 'Hark 账号管理', icon: Users, platformId: 'hark', count: harkAccounts.length },
    { id: 'proxy-pool', label: '代理池与自动分配', icon: Server, count: pool.length },
    { id: 'general', label: '常规、分组与安全', icon: Settings }
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-main">
      <PaneHeader className="justify-between px-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="no-drag press inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-soft hover:bg-hover"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            返回对话
          </button>
          <h1 className="text-[15px] font-semibold tracking-tight text-ink">BotHub 管理控制台</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-status-online/10 px-2.5 py-0.5 text-[11px] font-medium text-status-online-ink">
            <ShieldCheck className="size-3" /> Keychain safeStorage 加密已启用
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || allAccounts.length === 0}
            onClick={() => void handleReconnectAll(false)}
          >
            <Activity className={cn('size-3.5', busy && 'animate-spin')} /> 全量健康巡检
          </Button>
        </div>
      </PaneHeader>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Settings Sub-navigation */}
        <aside className="flex w-[220px] shrink-0 flex-col gap-1 border-r border-line px-3 py-4">
          {NAV.map((item) => {
            const Icon = item.icon
            const pIcon = platformIcon(item.platformId)
            const active = settingsTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSettingsOpen(true, item.id)
                  setHint(undefined)
                  setError(undefined)
                  setConfirmWipeCreds(false)
                  setConfirmResetAll(false)
                }}
                className={cn(
                  'press flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13px] font-medium transition-colors',
                  active ? 'bg-active text-ink' : 'text-ink-secondary hover:bg-hover hover:text-ink'
                )}
              >
                {pIcon ? (
                  <img
                    src={pIcon}
                    alt=""
                    aria-hidden
                    draggable={false}
                    className="size-4 shrink-0 rounded-[4px] object-cover ring-1 ring-line"
                  />
                ) : (
                  <Icon className="size-4 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="rounded-full bg-sunken px-1.5 py-0.2 text-[11px] text-ink-muted tabular-nums">
                    {item.count}
                  </span>
                )}
              </button>
            )
          })}
        </aside>

        {/* Right Content Area */}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto max-w-[820px]">
            {error && (
              <div className="mb-4 rounded-xl border border-status-error/25 bg-status-error/8 px-3.5 py-2.5 text-[13px] text-status-error">
                {error}
              </div>
            )}
            {hint && (
              <div className="mb-4 rounded-xl border border-accent-600/20 bg-accent-50 px-3.5 py-2.5 text-[13px] text-ink">
                {hint}
              </div>
            )}

            {settingsTab === 'overview' && (
              <div className="flex flex-col gap-5 animate-veil-in">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-semibold tracking-tight text-ink">多平台 Bot 与账号全局总览</h2>
                    <p className="mt-1 text-[13px] text-ink-secondary">
                      集中巡检所有已接入的 AI 平台账号状态、分组归属、自动续期凭据与独立代理分配。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy || allAccounts.length === 0}
                      onClick={() => void handleReconnectAll(true)}
                    >
                      <RefreshCw className="size-3.5" /> 重连离线账号
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSettingsOpen(true, 'general')}
                    >
                      <ShieldAlert className="size-3.5" /> 凭据清理与导出
                    </Button>
                  </div>
                </div>

                {/* Top KPI Cards */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
                    <p className="text-[12px] text-ink-muted">工作区 Bot 总数</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums text-ink">{bots.length}</p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">共 {groups.length} 个侧栏分组</p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
                    <p className="text-[12px] text-ink-muted">在线就绪账号</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums text-status-online-ink">
                      {onlineAccountsCount} <span className="text-[13px] font-normal text-ink-muted">/ {allAccounts.length}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">实时流式通道就绪</p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
                    <p className="text-[12px] text-ink-muted">Dot 自动续期凭据</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums text-ink">
                      {Object.values(dotMetaMap).filter((m) => m.hasRefreshToken).length}
                      <span className="text-[13px] font-normal text-ink-muted"> / {dotAccounts.length}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">含 RT 自动换取 AT</p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
                    <p className="text-[12px] text-ink-muted">代理池与安全存储</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums text-ink">{pool.length}</p>
                    <p className="mt-0.5 text-[11px] text-status-online-ink">Keychain 0600 加密</p>
                  </div>
                </div>

                {/* Platform Breakdown Cards */}
                <div className="grid grid-cols-4 gap-2.5">
                  {(
                    [
                      { id: 'meta-muse', tab: 'muse-accounts', name: 'Meta Muse', list: museAccounts, desc: 'Noise WSS 隧道' },
                      { id: 'dot', tab: 'dot-accounts', name: 'ChatGPT Dot', list: dotAccounts, desc: 'Calpico + OAuth RT' },
                      { id: 'grok', tab: 'grok-accounts', name: 'Grok Bot', list: grokAccounts, desc: 'Sand PKCE OAuth' },
                      { id: 'hark', tab: 'hark-accounts', name: 'Hark Pro', list: harkAccounts, desc: 'Sync SSE + Session' }
                    ] as const
                  ).map((p) => {
                    const onCount = p.list.filter(
                      (a) => a.status === 'online' || a.status === 'busy' || a.status === 'attention'
                    ).length
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSettingsOpen(true, p.tab)}
                        className="press flex flex-col justify-between rounded-2xl border border-line bg-surface p-3 text-left transition-colors hover:border-line-strong hover:bg-hover/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex min-w-0 items-center gap-2">
                            {platformIcon(p.id) && (
                              <img
                                src={platformIcon(p.id)}
                                alt=""
                                aria-hidden
                                draggable={false}
                                className="size-5 shrink-0 rounded-[5px] object-cover ring-1 ring-line"
                              />
                            )}
                            <span className="truncate text-[13px] font-semibold text-ink">{p.name}</span>
                          </span>
                          <span className="rounded-full bg-sunken px-2 py-0.5 font-mono text-[11px] text-ink-secondary">
                            {onCount}/{p.list.length}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] text-ink-muted">{p.desc} →</p>
                      </button>
                    )
                  })}
                </div>

                {/* Unified Bot & Account Management Table */}
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sunken/40 px-4 py-2.5">
                    <div className="relative min-w-[200px] flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted" />
                      <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索 Bot 名称、邮箱 Handle 或账号 ID…"
                        className="h-8 w-full rounded-xl border border-line bg-canvas pr-3 pl-8 text-[12px] text-ink outline-none placeholder:text-ink-muted focus:border-accent-600"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={platformFilter}
                        onChange={(e) => setPlatformFilter(e.target.value as typeof platformFilter)}
                        className="h-8 rounded-xl border border-line bg-canvas px-2.5 text-[12px] text-ink"
                      >
                        <option value="all">全部平台 ({bots.length})</option>
                        <option value="meta-muse">Meta Muse ({museBots.length})</option>
                        <option value="dot">ChatGPT Dot ({dotBots.length})</option>
                        <option value="grok">Grok Bot ({grokBots.length})</option>
                        <option value="hark">Hark Pro ({harkBots.length})</option>
                      </select>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                        className="h-8 rounded-xl border border-line bg-canvas px-2.5 text-[12px] text-ink"
                      >
                        <option value="all">全部状态</option>
                        <option value="online">仅在线</option>
                        <option value="offline">仅离线 / 异常</option>
                      </select>
                    </div>
                  </div>

                  {filteredBots.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-[13.5px] font-medium text-ink">
                        {bots.length === 0 ? '当前工作区暂无任何 Bot 账号' : '没有符合筛选条件的 Bot'}
                      </p>
                      <p className="mt-1 text-[12px] text-ink-muted">
                        {bots.length === 0
                          ? '可从左侧平台标签页添加或批量导入账号，所有凭据均使用系统安全存储加密。'
                          : '请尝试清空搜索词或切换平台筛选器。'}
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-line">
                      {filteredBots.map((bot) => {
                        const acc = accounts[bot.activeAccountId]
                        const msgCount = (messages[bot.id] ?? []).length
                        const dotMeta = bot.platformId === 'dot' ? dotMetaMap[bot.activeAccountId] : undefined
                        const isEditing = editingBotId === bot.id
                        return (
                          <li
                            key={bot.id}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-hover/30"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <BotAvatar
                                seed={bot.id}
                                avatar={bot.avatar}
                                avatarShape={bot.avatarShape}
                                avatarColor={bot.avatarColor}
                                emoji={bot.emoji}
                                platformId={bot.platformId}
                                status={acc?.status ?? 'offline'}
                                size="md"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {isEditing ? (
                                    <form
                                      className="inline-flex items-center gap-1"
                                      onSubmit={(e) => {
                                        e.preventDefault()
                                        if (editingBotName.trim()) {
                                          renameBot(bot.id, editingBotName.trim())
                                          if (acc) renameAccount(acc.id, editingBotName.trim())
                                        }
                                        setEditingBotId(null)
                                      }}
                                    >
                                      <input
                                        autoFocus
                                        value={editingBotName}
                                        onChange={(e) => setEditingBotName(e.target.value)}
                                        onBlur={() => {
                                          if (editingBotName.trim()) {
                                            renameBot(bot.id, editingBotName.trim())
                                          }
                                          setEditingBotId(null)
                                        }}
                                        className="h-6 rounded border border-accent-600 bg-canvas px-2 text-[13px] font-medium text-ink outline-none"
                                      />
                                    </form>
                                  ) : (
                                    <span className="truncate text-[14px] font-medium text-ink">{bot.name}</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingBotId(bot.id)
                                      setEditingBotName(bot.name)
                                    }}
                                    className="rounded p-0.5 text-ink-muted hover:bg-hover hover:text-ink"
                                    title="重命名 Bot"
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                  <span className="inline-flex items-center gap-1 rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-medium text-ink-secondary">
                                    {platformIcon(bot.platformId) && (
                                      <img
                                        src={platformIcon(bot.platformId)}
                                        alt=""
                                        aria-hidden
                                        draggable={false}
                                        className="size-3 shrink-0 rounded-[3px] object-cover"
                                      />
                                    )}
                                    {PLATFORM_LABELS[bot.platformId] ?? bot.platformId}
                                  </span>
                                  {acc && <StatusBadge status={acc.status} />}
                                  {dotMeta?.hasRefreshToken && (
                                    <span className="rounded-md bg-status-online/10 px-1.5 py-0.5 text-[10.5px] font-medium text-status-online-ink">
                                      RT 自动续期
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-muted">
                                  <span className="font-mono text-[11px]">
                                    {acc?.handle || dotMeta?.handle || bot.activeAccountId}
                                  </span>
                                  <span>·</span>
                                  <span>{msgCount} 条消息</span>
                                  {dotMeta?.planType && (
                                    <>
                                      <span>·</span>
                                      <span className="uppercase">{dotMeta.planType}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              <select
                                value={bot.groupId}
                                onChange={(e) => moveBotToGroup(bot.id, e.target.value)}
                                title="调整所属分组"
                                className="h-7 rounded-lg border border-line bg-canvas px-2 text-[11.5px] text-ink-secondary"
                              >
                                {groups.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => togglePinBot(bot.id)}
                                title={bot.pinned ? '取消置顶' : '置顶到侧边栏顶部'}
                                className={cn(
                                  'inline-flex size-7 items-center justify-center rounded-lg border border-line transition-colors',
                                  bot.pinned
                                    ? 'bg-accent-50 text-accent-600'
                                    : 'bg-canvas text-ink-muted hover:bg-hover hover:text-ink'
                                )}
                              >
                                {bot.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                              </button>
                              <Button size="sm" variant="secondary" onClick={() => selectBot(bot.id)}>
                                进入对话
                              </Button>
                              {acc && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={acc.pending}
                                  onClick={() => void connectAccount(acc.id)}
                                >
                                  重连
                                </Button>
                              )}
                              {acc && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={acc.pending}
                                  onClick={() => void signOutAccount(acc.id)}
                                  title="退出并清除该账号凭据"
                                >
                                  <LogOut className="size-3.5" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void removeBot(bot.id)}
                                title="删除该 Bot 与账号"
                              >
                                <Trash2 className="size-3.5 text-status-error" />
                              </Button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {settingsTab === 'muse-accounts' && (
              <div className="flex flex-col gap-5 animate-veil-in">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-semibold tracking-tight text-ink">Muse 多账号管理</h2>
                    <p className="mt-1 text-[13px] text-ink-secondary">
                      管理所有已添加的 Muse 账号与独立会话分区。当代理池中有可用代理时，新建或批量导入的每个账号会自动一对一绑定一个专属代理。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setBatchOpen(true)}>
                      批量导入账号 (邮箱 | 收件箱)
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => void handleQuickAddMuseAccount()}>
                      <Plus className="size-3.5" /> 新增 Muse 账号
                    </Button>
                  </div>
                </div>

                {/* Quick Summary Bar */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
                    <p className="text-[12px] text-ink-muted">Muse 账号总数</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums text-ink">{museAccounts.length}</p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
                    <p className="text-[12px] text-ink-muted">在线就绪</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums text-status-online-ink">
                      {museAccounts.filter((a) => a.status === 'online' || a.status === 'busy' || a.status === 'attention').length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
                    <p className="text-[12px] text-ink-muted">已绑定独立代理</p>
                    <p className="mt-1 flex items-baseline justify-between">
                      <span className="text-[22px] font-semibold tabular-nums text-ink">
                        {Object.values(accountProxies).filter((p) => p && p.mode !== 'direct').length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true, 'proxy-pool')}
                        className="text-[12px] font-medium text-accent-600 hover:underline"
                      >
                        配置代理池 →
                      </button>
                    </p>
                  </div>
                </div>

                {/* Accounts List */}
                {museAccounts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line py-12 text-center">
                    <p className="text-[14px] font-medium text-ink">暂无 Muse 账号</p>
                    <p className="max-w-md text-[12.5px] text-ink-muted">
                      你可以先在「代理池与自动分配」导入一批代理，然后点击「批量导入账号」或「新增 Muse 账号」，系统会自动实现一号一代理。
                    </p>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true, 'proxy-pool')}>
                        先导入代理池
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => setBatchOpen(true)}>
                        批量导入 Muse 账号
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
                    <div className="flex items-center justify-between border-b border-line bg-sunken/40 px-4 py-2.5 text-[12px] font-medium text-ink-secondary">
                      <span>账号与对应 Bot</span>
                      <div className="flex items-center gap-2">
                        {pool.length > 0 && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void handleAutoAssignAll()}>
                            <Shuffle className="size-3.5" /> 一键按代理池重新一对一匹配
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => void refreshProxiesAndPool()}>
                          <RefreshCw className="size-3.5" /> 刷新
                        </Button>
                      </div>
                    </div>
                    <ul className="divide-y divide-line">
                      {museAccounts.map((acc) => {
                        const ownerBot = bots.find((b) => b.accountIds.includes(acc.id))
                        const px = accountProxies[acc.id]
                        const hasProxy = px && px.mode !== 'direct' && px.host && px.port
                        return (
                          <li key={acc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-hover/30">
                            <div className="flex min-w-0 items-center gap-3">
                              <BotAvatar
                                seed={ownerBot?.id ?? acc.id}
                                avatar={ownerBot?.avatar}
                                avatarShape={ownerBot?.avatarShape}
                                avatarColor={ownerBot?.avatarColor}
                                status={acc.status}
                                size="md"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[14px] font-medium text-ink">
                                    {ownerBot?.name || acc.displayName}
                                  </span>
                                  <StatusBadge status={acc.status} />
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                                  <span className="font-mono text-[11px]">{acc.handle || acc.id}</span>
                                  <span>·</span>
                                  {hasProxy ? (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-accent-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent-600">
                                      <Globe className="size-3" />
                                      {px.mode}://{px.username ? `${px.username}@` : ''}
                                      {px.host}:{px.port}
                                    </span>
                                  ) : (
                                    <span className="rounded-md bg-sunken px-1.5 py-0.5 text-[11px] text-ink-muted">
                                      直连 (无代理)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              {ownerBot && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => selectBot(ownerBot.id)}
                                >
                                  进入对话
                                </Button>
                              )}
                              {acc.status === 'offline' ? (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={acc.pending}
                                  onClick={() => void openMuseLogin(acc.id)}
                                >
                                  登录
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={acc.pending}
                                  onClick={() => void connectAccount(acc.id)}
                                >
                                  重连
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={acc.pending}
                                onClick={() => void signOutAccount(acc.id)}
                                title="退出登录"
                              >
                                <LogOut className="size-3.5" />
                              </Button>
                              {ownerBot && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void removeBot(ownerBot.id)}
                                  title="删除该账号与 Bot"
                                >
                                  <Trash2 className="size-3.5 text-status-error" />
                                </Button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {settingsTab === 'dot-accounts' && (
              <div className="flex flex-col gap-5 animate-veil-in">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-semibold tracking-tight text-ink">ChatGPT Dot (chatgpt.com/dots) 账号管理</h2>
                    <p className="mt-1 text-[13px] text-ink-secondary">
                      管理所有已接入的 ChatGPT Dot 账号（一号一 Bot）。支持网页登录（`chatgpt.com/dots`）或单条/批量导入 ChatGPT `access_token (AT)`、`refresh_token (RT)` 与 `auth.json` 会话凭据，所有 Token 均使用系统 Keychain `safeStorage` 加密存储并支持 OAuth 自动续期。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" size="sm" onClick={handleQuickAddDotAccount}>
                      <Plus className="size-3.5" /> 网页登录新增 Dot 账号
                    </Button>
                  </div>
                </div>

                {/* Quick Summary Bar */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
                    <p className="text-[12px] text-ink-muted">Dot 账号总数</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums text-ink">{dotAccounts.length}</p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
                    <p className="text-[12px] text-ink-muted">在线就绪</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums text-status-online-ink">
                      {dotAccounts.filter((a) => a.status === 'online' || a.status === 'busy' || a.status === 'attention').length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
                    <p className="text-[12px] text-ink-muted">RT 自动续期就绪</p>
                    <p className="mt-1 text-[22px] font-semibold tabular-nums text-ink">
                      {Object.values(dotMetaMap).filter((m) => m.hasRefreshToken).length}
                      <span className="text-[13px] font-normal text-ink-muted"> / {dotAccounts.length}</span>
                    </p>
                  </div>
                </div>

                {/* AT / RT / JSON Single & Batch Import Card */}
                <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
                      <KeyRound className="size-3.5 text-accent-600" />
                      导入 ChatGPT AT / RT / JSON 凭据（支持多行批量导入）
                    </span>
                    <label className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
                      导入目标：
                      <select
                        value={dotTargetAccountId}
                        onChange={(e) => setDotTargetAccountId(e.target.value)}
                        className="rounded-lg border border-line bg-canvas px-2 py-1 text-[12px] text-ink"
                      >
                        <option value="__new__">+ 新建独立 Dot Bot（支持多行批量导入）</option>
                        {dotAccounts.map((acc) => {
                          const ownerBot = bots.find((b) => b.accountIds.includes(acc.id))
                          return (
                            <option key={acc.id} value={acc.id}>
                              替换凭据：{ownerBot?.name || acc.displayName} ({acc.handle || acc.id})
                            </option>
                          )
                        })}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-col gap-2">
                    <textarea
                      ref={dotInputRef}
                      value={dotRawInput}
                      onChange={(e) => setDotRawInput(e.target.value)}
                      placeholder="粘贴单条或多行（每行一个）ChatGPT access_token (eyJ...)、refresh_token (rt_...) 或 JSON (auth.json / JSON 数组)…"
                      rows={3}
                      spellCheck={false}
                      className="block w-full resize-none rounded-xl border border-line bg-canvas p-2.5 font-mono text-[12px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:border-accent-600"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={dotRefreshInput}
                        onChange={(e) => setDotRefreshInput(e.target.value)}
                        placeholder="可选：单账号导入时单独填写 refresh_token (rt_...) 用于自动续期"
                        className="h-8 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 font-mono text-[12px] text-ink outline-none placeholder:text-ink-muted focus:border-accent-600"
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy || (!dotRawInput.trim() && !dotRefreshInput.trim())}
                        onClick={() => void handleImportDotCredentials()}
                      >
                        {busy
                          ? '正在验证…'
                          : dotTargetAccountId === '__new__'
                            ? '导入并创建 Dot Bot'
                            : '更新该 Bot 凭据'}
                      </Button>
                    </div>
                    {dotTargetAccountId !== '__new__' && (
                      <label className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-secondary">
                        <input
                          type="checkbox"
                          checked={dotMigrateMemory}
                          onChange={(e) => setDotMigrateMemory(e.target.checked)}
                          className="rounded border-line"
                        />
                        替换账号时自动将该 Bot 现有的核心目标 (Goal) 与记忆 (Memory) 迁移至新账号
                      </label>
                    )}
                  </div>
                </div>

                {/* Dot Accounts List */}
                {dotAccounts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line py-10 text-center">
                    <p className="text-[14px] font-medium text-ink">暂无 Dot 账号</p>
                    <p className="max-w-md text-[12.5px] text-ink-muted">
                      点击上方「网页登录新增 Dot 账号」或在上方卡片中粘贴 ChatGPT AT / RT 凭据即可创建 Dot Bot。
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
                    <div className="flex items-center justify-between border-b border-line bg-sunken/40 px-4 py-2.5 text-[12px] font-medium text-ink-secondary">
                      <span>Dot 账号与对应 Bot ({dotAccounts.length})</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          for (const acc of dotAccounts) {
                            void connectAccount(acc.id)
                          }
                          void refreshDotStoredMeta()
                        }}
                      >
                        <RefreshCw className="size-3.5" /> 全部重连检验
                      </Button>
                    </div>
                    <ul className="divide-y divide-line">
                      {dotAccounts.map((acc) => {
                        const ownerBot = bots.find((b) => b.accountIds.includes(acc.id))
                        const meta = dotMetaMap[acc.id]
                        return (
                          <li key={acc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-hover/30">
                            <div className="flex min-w-0 items-center gap-3">
                              <BotAvatar
                                seed={ownerBot?.id ?? acc.id}
                                avatar={ownerBot?.avatar}
                                avatarShape={ownerBot?.avatarShape}
                                avatarColor={ownerBot?.avatarColor}
                                emoji={ownerBot?.emoji ?? '🪐'}
                                platformId="dot"
                                status={acc.status}
                                size="md"
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-[14px] font-medium text-ink">
                                    {ownerBot?.name || acc.displayName}
                                  </span>
                                  <StatusBadge status={acc.status} />
                                  {meta?.planType && (
                                    <span className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[10.5px] uppercase text-ink-secondary">
                                      {meta.planType}
                                    </span>
                                  )}
                                  {meta?.hasRefreshToken ? (
                                    <span className="rounded bg-status-online/10 px-1.5 py-0.5 text-[10.5px] font-medium text-status-online-ink">
                                      RT 自动续期已开启
                                    </span>
                                  ) : (
                                    <span className="rounded bg-sunken px-1.5 py-0.5 text-[10.5px] text-ink-muted">
                                      仅 AT 会话
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                                  <span className="font-mono text-[11px]">{acc.handle || meta?.handle || acc.id}</span>
                                  {meta?.mode && (
                                    <>
                                      <span>·</span>
                                      <span>{meta.mode === 'native' ? `Native (${meta.model || 'gpt-6-astra'})` : 'Calpico Room'}</span>
                                    </>
                                  )}
                                  {acc.statusDetail && (
                                    <>
                                      <span>·</span>
                                      <span className="rounded-md bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-secondary">
                                        {acc.statusDetail}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {ownerBot && (
                                <Button size="sm" variant="secondary" onClick={() => selectBot(ownerBot.id)}>
                                  进入对话
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={acc.pending}
                                onClick={() => void openDotLogin(acc.id)}
                              >
                                网页登录
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setDotTargetAccountId(acc.id)
                                  dotInputRef.current?.focus()
                                }}
                              >
                                替换 AT/RT
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={acc.pending}
                                onClick={() => void connectAccount(acc.id)}
                              >
                                重连
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={acc.pending}
                                onClick={() => void signOutAccount(acc.id)}
                                title="退出登录"
                              >
                                <LogOut className="size-3.5" />
                              </Button>
                              {ownerBot && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void removeBot(ownerBot.id)}
                                  title="删除该账号与 Bot"
                                >
                                  <Trash2 className="size-3.5 text-status-error" />
                                </Button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {settingsTab === 'grok-accounts' && (
              <div className="flex flex-col gap-5 animate-veil-in">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-semibold tracking-tight text-ink">Grok Bot (Sand) 账号管理</h2>
                    <p className="mt-1 text-[13px] text-ink-secondary">
                      通过官方 PKCE 深链（`cursor.com/loginDeepControl?redirectTarget=sand` + `/auth/poll`）登录并获取具备完整读写权限的 Sand OAuth Token，自动刷新续期并使用 `safeStorage` 加密保存在本机安全存储中。
                    </p>
                  </div>
                  <Button variant="primary" size="sm" onClick={handleQuickAddGrokAccount}>
                    <Plus className="size-3.5" /> PKCE 登录新增 Grok 账号
                  </Button>
                </div>

                {/* Manual Token Paste Card */}
                <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">导入或替换 Sand OAuth Token (AT / RT)</span>
                    <select
                      value={grokTargetAccountId}
                      onChange={(e) => setGrokTargetAccountId(e.target.value)}
                      className="rounded-lg border border-line bg-canvas px-2 py-1 text-[12px] text-ink"
                    >
                      <option value="__new__">+ 新建 Grok Bot</option>
                      {grokAccounts.map((acc) => {
                        const ownerBot = bots.find((b) => b.accountIds.includes(acc.id))
                        return (
                          <option key={acc.id} value={acc.id}>
                            替换凭据：{ownerBot?.name || acc.displayName} ({acc.id})
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      value={grokTokenInput}
                      onChange={(e) => setGrokTokenInput(e.target.value)}
                      placeholder="粘贴 eyJ... (Sand OAuth Access Token)"
                      className="h-8 w-full rounded-xl border border-line bg-canvas px-3 font-mono text-[12px] text-ink outline-none focus:border-accent-600"
                    />
                    <div className="flex gap-2">
                      <input
                        value={grokRefreshInput}
                        onChange={(e) => setGrokRefreshInput(e.target.value)}
                        placeholder="可选：填写 Refresh Token 用于自动续期"
                        className="h-8 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 font-mono text-[12px] text-ink outline-none focus:border-accent-600"
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy || !grokTokenInput.trim()}
                        onClick={() => void handleImportGrokToken()}
                      >
                        {grokTargetAccountId === '__new__' ? '导入并新建' : '更新 Token'}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Grok Accounts List */}
                {grokAccounts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line py-10 text-center">
                    <p className="text-[14px] font-medium text-ink">暂无 Grok Bot 账号</p>
                    <p className="max-w-md text-[12.5px] text-ink-muted">
                      点击上方「PKCE 登录新增 Grok 账号」在弹窗中确认授权，即可拉取你账号下的全部 Grok Bots 并流式对话。
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
                    <ul className="divide-y divide-line">
                      {grokAccounts.map((acc) => {
                        const ownerBot = bots.find((b) => b.accountIds.includes(acc.id))
                        return (
                          <li key={acc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-hover/30">
                            <div className="flex min-w-0 items-center gap-3">
                              <BotAvatar
                                seed={ownerBot?.id ?? acc.id}
                                avatar={ownerBot?.avatar}
                                avatarShape={ownerBot?.avatarShape}
                                avatarColor={ownerBot?.avatarColor}
                                status={acc.status}
                                size="md"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[14px] font-medium text-ink">
                                    {ownerBot?.name || acc.displayName}
                                  </span>
                                  <StatusBadge status={acc.status} />
                                </div>
                                <p className="mt-0.5 truncate font-mono text-[11px] text-ink-muted">
                                  {acc.statusDetail || acc.handle || acc.id}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {ownerBot && (
                                <Button size="sm" variant="secondary" onClick={() => selectBot(ownerBot.id)}>
                                  进入对话
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={acc.pending}
                                onClick={() => void openGrokLogin(acc.id)}
                              >
                                PKCE 登录
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={acc.pending}
                                onClick={() => void connectAccount(acc.id)}
                              >
                                刷新名单
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={acc.pending}
                                onClick={() => void signOutAccount(acc.id)}
                                title="退出登录"
                              >
                                <LogOut className="size-3.5" />
                              </Button>
                              {ownerBot && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void removeBot(ownerBot.id)}
                                  title="删除"
                                >
                                  <Trash2 className="size-3.5 text-status-error" />
                                </Button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {settingsTab === 'hark-accounts' && (
              <div className="flex flex-col gap-5 animate-veil-in">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-semibold tracking-tight text-ink">Hark Pro (app.hark.com) 账号管理</h2>
                    <p className="mt-1 text-[13px] text-ink-secondary">
                      支持打开独立会话分区完成 Google / Apple / 邮箱登录，或直接粘贴 Hark Session Cookie / Token 接入并同步对话历史。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" onClick={() => void handleQuickAddHarkAccount()}>
                      <Plus className="size-3.5" /> 网页登录新增 Hark 账号
                    </Button>
                  </div>
                </div>

                {/* Hark Cookie / Token Import Card */}
                <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">导入 Hark Session Cookie / Token</span>
                    <select
                      value={harkTargetAccountId}
                      onChange={(e) => setHarkTargetAccountId(e.target.value)}
                      className="rounded-lg border border-line bg-canvas px-2 py-1 text-[12px] text-ink"
                    >
                      <option value="__new__">+ 新建独立 Hark Bot</option>
                      {harkAccounts.map((acc) => {
                        const ownerBot = bots.find((b) => b.accountIds.includes(acc.id))
                        return (
                          <option key={acc.id} value={acc.id}>
                            更新会话：{ownerBot?.name || acc.displayName} ({acc.handle || acc.id})
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={harkRawInput}
                      onChange={(e) => setHarkRawInput(e.target.value)}
                      placeholder="粘贴 Hark Cookie 字符串（如 __Secure-hark.session_token=...）、JSON Cookie 数组或原始 Session Token…"
                      rows={2}
                      spellCheck={false}
                      className="block w-full resize-none rounded-xl border border-line bg-canvas p-2.5 font-mono text-[12px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:border-accent-600"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy || !harkRawInput.trim()}
                        onClick={() => void handleImportHarkCredentials()}
                      >
                        {busy
                          ? '正在验证会话…'
                          : harkTargetAccountId === '__new__'
                            ? '导入并新建 Hark Bot'
                            : '更新该账号会话'}
                      </Button>
                    </div>
                  </div>
                </div>

                {harkAccounts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line py-10 text-center">
                    <p className="text-[14px] font-medium text-ink">暂无 Hark 账号</p>
                    <p className="max-w-md text-[12.5px] text-ink-muted">
                      点击上方「网页登录新增 Hark 账号」或在卡片中粘贴 Cookie / Session Token 即可接入。
                    </p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
                    <ul className="divide-y divide-line">
                      {harkAccounts.map((acc) => {
                        const ownerBot = bots.find((b) => b.accountIds.includes(acc.id))
                        return (
                          <li key={acc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-hover/30">
                            <div className="flex min-w-0 items-center gap-3">
                              <BotAvatar
                                seed={ownerBot?.id ?? acc.id}
                                avatar={ownerBot?.avatar}
                                avatarShape={ownerBot?.avatarShape}
                                avatarColor={ownerBot?.avatarColor}
                                status={acc.status}
                                size="md"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[14px] font-medium text-ink">
                                    {ownerBot?.name || acc.displayName}
                                  </span>
                                  <StatusBadge status={acc.status} />
                                </div>
                                <p className="mt-0.5 truncate font-mono text-[11px] text-ink-muted">
                                  {acc.handle || acc.id}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {ownerBot && (
                                <Button size="sm" variant="secondary" onClick={() => selectBot(ownerBot.id)}>
                                  进入对话
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={acc.pending}
                                onClick={() => void openHarkLogin(acc.id)}
                              >
                                登录窗口
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={acc.pending}
                                onClick={() => void connectAccount(acc.id)}
                              >
                                刷新会话
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={acc.pending}
                                onClick={() => void signOutAccount(acc.id)}
                                title="退出登录"
                              >
                                <LogOut className="size-3.5" />
                              </Button>
                              {ownerBot && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void removeBot(ownerBot.id)}
                                  title="删除"
                                >
                                  <Trash2 className="size-3.5 text-status-error" />
                                </Button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {settingsTab === 'proxy-pool' && (
              <div className="flex flex-col gap-5 animate-veil-in">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-semibold tracking-tight text-ink">代理池与一号一代理自动匹配</h2>
                    <p className="mt-1 text-[13px] text-ink-secondary">
                      批量导入代理列表（使用系统 Keychain `safeStorage` 加密存储）。导入后默认按照「一个账号匹配一个独立代理」自动绑定到会话分区与 WSS 隧道。
                    </p>
                  </div>
                  {pool.length > 0 && museAccounts.length > 0 && (
                    <Button variant="primary" size="sm" disabled={busy} onClick={() => void handleAutoAssignAll()}>
                      <Shuffle className="size-3.5" /> 一键匹配给全部 Muse 账号 ({museAccounts.length})
                    </Button>
                  )}
                </div>

                {/* Proxy Pool Importer Card */}
                <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[13px] font-medium text-ink">批量粘贴或导入代理</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
                        无协议前缀时默认：
                        <select
                          value={defaultMode}
                          onChange={(e) => setDefaultMode(e.target.value as Exclude<MuseProxyMode, 'direct'>)}
                          className="rounded-lg border border-line bg-canvas px-2 py-1 text-[12px] text-ink"
                        >
                          <option value="socks5">SOCKS5</option>
                          <option value="socks5h">SOCKS5H (远程 DNS)</option>
                          <option value="http">HTTP / HTTPS</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-line bg-canvas px-2.5 text-[12px] text-ink-secondary hover:bg-hover hover:text-ink"
                      >
                        <FileUp className="size-3.5" /> 从 .txt 导入
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".txt,text/plain"
                        hidden
                        onChange={(ev) => {
                          const file = ev.target.files?.[0]
                          ev.target.value = ''
                          if (file) {
                            void file.text().then((txt) =>
                              setRawProxyText((prev) => (prev.trim() ? `${prev.trimEnd()}\n${txt}` : txt))
                            )
                          }
                        }}
                      />
                    </div>
                  </div>
                  <textarea
                    value={rawProxyText}
                    onChange={(e) => setRawProxyText(e.target.value)}
                    placeholder={PROXY_PLACEHOLDER}
                    rows={5}
                    spellCheck={false}
                    className="block w-full resize-none rounded-xl border border-line bg-canvas p-3 font-mono text-[12px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:border-accent-600"
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[12px] text-ink-muted">
                      导入后会自动为尚未绑定代理的账号一对一分配
                    </span>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy || !rawProxyText.trim()}
                      onClick={() => void handleImportPool()}
                    >
                      导入代理池并自动匹配
                    </Button>
                  </div>
                </div>

                {/* Current Pool List */}
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
                  <div className="flex items-center justify-between border-b border-line bg-sunken/40 px-4 py-2.5 text-[12px] font-medium text-ink-secondary">
                    <span>代理池列表 ({pool.length})</span>
                    {pool.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => void handleClearPool()}>
                        清空代理池
                      </Button>
                    )}
                  </div>
                  {pool.length === 0 ? (
                    <p className="py-8 text-center text-[13px] text-ink-muted">代理池为空，请在上方粘贴导入代理</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {pool.map((item, idx) => {
                        const assignedAcc = item.assignedAccountId ? accounts[item.assignedAccountId] : undefined
                        const ownerBot = item.assignedAccountId
                          ? bots.find((b) => b.accountIds.includes(item.assignedAccountId!))
                          : undefined
                        return (
                          <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className="w-6 font-mono text-[11px] text-ink-muted">#{idx + 1}</span>
                              <span className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] uppercase text-ink-secondary">
                                {item.mode}
                              </span>
                              <span className="truncate font-mono text-[13px] text-ink">
                                {item.username ? `${item.username}${item.hasPassword ? ':***' : ''}@` : ''}
                                {item.host}:{item.port}
                              </span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {assignedAcc || ownerBot ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-status-online/10 px-2.5 py-0.5 text-[11.5px] font-medium text-status-online-ink">
                                  已绑定 → {ownerBot?.name || assignedAcc?.displayName || item.assignedAccountId}
                                </span>
                              ) : (
                                <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[11.5px] text-ink-muted">
                                  空闲待分配
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleRemovePoolItem(item.id)}
                                className="rounded p-1 text-ink-muted hover:bg-hover hover:text-status-error"
                                title="移除代理"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {settingsTab === 'general' && (
              <div className="flex flex-col gap-5 animate-veil-in">
                <div>
                  <h2 className="text-[17px] font-semibold tracking-tight text-ink">常规、侧栏分组与凭据安全</h2>
                  <p className="mt-1 text-[13px] text-ink-secondary">
                    调整界面外观、管理侧边栏分组，以及在发布/交付前一键脱敏或清除所有本机敏感凭据。
                  </p>
                </div>

                {/* Appearance & Version */}
                <div className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-soft">
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div>
                      <p className="text-[14px] font-medium text-ink">{tr('Appearance')}</p>
                      <p className="text-[12px] text-ink-muted">Grok Bot Sand Light / Sand Dark 配色系统</p>
                    </div>
                    <div className="flex rounded-xl bg-hover p-0.5 text-[12px]">
                      {(['system', 'light', 'dark'] as ThemePref[]).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setTheme(id)}
                          className={cn(
                            'rounded-lg px-3 py-1 font-medium transition-colors',
                            theme === id ? 'bg-surface text-ink shadow-soft' : 'text-ink-secondary hover:text-ink'
                          )}
                        >
                          {id === 'system' ? tr('Match system') : id === 'light' ? tr('Light') : tr('Dark')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div>
                      <p className="text-[14px] font-medium text-ink">{tr('Language')}</p>
                      <p className="text-[12px] text-ink-muted">切换界面显示语言</p>
                    </div>
                    <div className="flex rounded-xl bg-hover p-0.5 text-[12px]">
                      {([
                        ['zh', '简体中文'],
                        ['en', 'English']
                      ] as Array<[Locale, string]>).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            if (id === locale) return
                            setLocale(id)
                            window.location.reload()
                          }}
                          className={cn(
                            'rounded-lg px-3 py-1 font-medium transition-colors',
                            locale === id ? 'bg-surface text-ink shadow-soft' : 'text-ink-secondary hover:text-ink'
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-4 py-3.5">
                    <div>
                      <p className="text-[14px] font-medium text-ink">当前版本</p>
                      <p className="font-mono text-[12px] text-ink-muted">BotHub {version || '0.2.8'}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={checkingUpdate}
                      onClick={() => {
                        setCheckingUpdate(true)
                        void getBridge()?.updates?.check()
                      }}
                    >
                      <RefreshCw className={cn('size-3.5', checkingUpdate && 'animate-spin')} />
                      {tr('Check for updates')}
                    </Button>
                  </div>
                </div>

                {/* Sidebar Section / Group Management */}
                <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
                  <div className="flex items-center justify-between border-b border-line bg-sunken/40 px-4 py-2.5">
                    <span className="text-[13px] font-medium text-ink">侧边栏分组管理 ({groups.length})</span>
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (!newGroupName.trim()) return
                        addGroup(newGroupName.trim())
                        setNewGroupName('')
                      }}
                    >
                      <input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="新建分组名称…"
                        className="h-7 rounded-lg border border-line bg-canvas px-2.5 text-[12px] text-ink outline-none focus:border-accent-600"
                      />
                      <Button size="sm" variant="secondary" type="submit" disabled={!newGroupName.trim()}>
                        <FolderPlus className="size-3.5" /> 新建分组
                      </Button>
                    </form>
                  </div>
                  <ul className="divide-y divide-line">
                    {groups.map((g) => {
                      const count = bots.filter((b) => b.groupId === g.id).length
                      const isEditing = editingGroupId === g.id
                      return (
                        <li key={g.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                          <div className="flex items-center gap-2">
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editingGroupName}
                                onChange={(e) => setEditingGroupName(e.target.value)}
                                onBlur={() => {
                                  if (editingGroupName.trim()) renameGroup(g.id, editingGroupName.trim())
                                  setEditingGroupId(null)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (editingGroupName.trim()) renameGroup(g.id, editingGroupName.trim())
                                    setEditingGroupId(null)
                                  }
                                }}
                                className="h-7 rounded border border-accent-600 bg-canvas px-2 text-[13px] text-ink outline-none"
                              />
                            ) : (
                              <span className="font-medium text-ink">{g.name}</span>
                            )}
                            <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-muted">
                              {count} 个 Bot
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingGroupId(g.id)
                                setEditingGroupName(g.name)
                              }}
                            >
                              重命名
                            </Button>
                            {groups.length > 1 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeGroup(g.id)}
                                title="删除分组（组内 Bot 自动移至默认分组）"
                              >
                                <Trash2 className="size-3.5 text-status-error" />
                              </Button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                {/* Security & Sanitization Center */}
                <div className="overflow-hidden rounded-2xl border border-status-error/25 bg-surface shadow-soft">
                  <div className="border-b border-line bg-status-error/5 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="size-4 text-status-error" />
                      <h3 className="text-[14px] font-semibold text-ink">凭据安全与上线前一键脱敏</h3>
                    </div>
                    <p className="mt-1 text-[12px] text-ink-secondary">
                      所有 OAuth Token、Refresh Token 与代理密码均通过系统 Keychain (`safeStorage` + `0600` 权限) 加密保存。在打包分发或推送上线前，可在此一键抹除所有本机测试凭据。
                    </p>
                  </div>
                  <div className="divide-y divide-line">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                      <div>
                        <p className="text-[13.5px] font-medium text-ink">导出脱敏工作区结构</p>
                        <p className="text-[12px] text-ink-muted">
                          仅导出分组与 Bot 列表元数据（自动剥离所有 Token、Cookie、聊天隐私与代理密码）
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={handleExportSanitizedConfig}>
                        <Download className="size-3.5" /> 导出脱敏 JSON
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                      <div>
                        <p className="text-[13.5px] font-medium text-ink">移除所有敏感凭据（保留 Bot 列表）</p>
                        <p className="text-[12px] text-ink-muted">
                          一键退出全部平台账号并清空本机 `dot-accounts.json`、`grok-sand-tokens.json`、浏览器分区 Cookie 与代理池
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={confirmWipeCreds ? 'primary' : 'secondary'}
                        disabled={busy}
                        onClick={() => void handleWipeAllCredentials()}
                        className={cn(confirmWipeCreds && 'bg-status-error text-white hover:bg-status-error/90')}
                      >
                        <Trash2 className="size-3.5" />
                        {confirmWipeCreds ? '确认清除所有凭据' : '清除全部敏感凭据'}
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                      <div>
                        <p className="text-[13.5px] font-medium text-ink">恢复出厂纯净状态（清空工作区 + 全部凭据）</p>
                        <p className="text-[12px] text-ink-muted">
                          彻底删除本机所有测试 Bot、账号、聊天记录与加密凭据，恢复至首次安装时的空白工作区
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={confirmResetAll ? 'primary' : 'secondary'}
                        disabled={busy}
                        onClick={() => void handleFactoryReset()}
                        className={cn(confirmResetAll && 'bg-status-error text-white hover:bg-status-error/90')}
                      >
                        <Trash2 className="size-3.5" />
                        {confirmResetAll ? '再次点击确认恢复出厂' : '恢复出厂设置'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Batch Import Dialog */}
      <Dialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        title={t('Batch import Muse accounts')}
      >
        <MuseBatchImport
          onDone={() => {
            setBatchOpen(false)
            void refreshProxiesAndPool()
          }}
        />
      </Dialog>
    </div>
  )
}
