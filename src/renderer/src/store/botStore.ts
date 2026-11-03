import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getPlatform } from '@adapters/platforms'
import { adapterRegistry } from '@adapters/registry'
import type { AttachmentMeta, ConnectionStatus, IncomingMessage, PlatformId } from '@adapters/types'
import { createId } from '@shared/id'
import { createSeed } from '@/data/seed'
import type { AccountDraft, Bot, BotAccount, BotGroup, ChatMessage, NewBotInput } from '@/types'

function electronBridge() {
  if (typeof window === 'undefined') return undefined
  return window.electron
}

export interface BotHubState {
  groups: BotGroup[]
  bots: Bot[]
  accounts: Record<string, BotAccount>
  /** Conversation per bot, keyed by bot id. */
  messages: Record<string, ChatMessage[]>
  /** Bot ids whose reply is currently being generated. */
  typing: Record<string, boolean>
  selectedBotId: string | null
  collapsedGroups: Record<string, boolean>
  infoPanelOpen: boolean
  /** Sidebar width in px (dragged by its right edge). */
  sidebarWidth: number
  addBotOpen: boolean
  /** Bumped on every open so each add-bot flow starts fresh. */
  addBotKey: number
  /** Command palette (⌘K); `paletteQuery` seeds it when typing opens it. */
  paletteOpen: boolean
  paletteQuery: string
  paletteKey: number
  /** Show the embedded platform web session instead of the chat (Electron only). */
  webSessionOpen: boolean

  // Navigation & layout
  selectBot: (botId: string) => void
  toggleGroup: (groupId: string) => void
  toggleInfoPanel: () => void
  setSidebarWidth: (width: number) => void
  setAddBotOpen: (open: boolean) => void
  toggleWebSession: () => void
  openPalette: (query?: string) => void
  closePalette: () => void
  /** Select the bot `offset` rows away in sidebar order (wraps). */
  selectAdjacentBot: (offset: number) => void

  // Creation
  /** Create a bot (and any new accounts/group), select it, and connect its accounts. */
  addBot: (input: NewBotInput) => string
  addAccountsToBot: (botId: string, drafts: AccountDraft[]) => void
  renameBot: (botId: string, name: string) => void
  setBotAvatar: (botId: string, avatar: string | undefined) => void
  /** Delete a bot; accounts no other bot uses are signed out and dropped. */
  removeBot: (botId: string) => Promise<void>

  // Conversation
  sendMessage: (botId: string, text: string, attachments?: AttachmentMeta[]) => Promise<void>
  retryMessage: (botId: string, messageId: string) => Promise<void>
  receiveMessage: (message: IncomingMessage) => void
  /** Upsert a streaming assistant bubble (same id updated as deltas arrive). */
  applyMessageDelta: (messageId: string, conversationId: string, accountId: string, text: string) => void
  setTyping: (botId: string, isTyping: boolean) => void

  // Bot details
  updateNotes: (botId: string, notes: string) => void
  addMemory: (botId: string, text: string) => void
  removeMemory: (botId: string, memoryId: string) => void

  // Accounts
  removeAccountFromBot: (botId: string, accountId: string) => void
  setActiveAccount: (botId: string, accountId: string) => void
  setSelectedAgent: (botId: string, agentId: string) => void
  renameAccount: (accountId: string, displayName: string) => void
  /** Sign out: clear persist partition + mark offline. */
  signOutAccount: (accountId: string) => Promise<void>
  /** Remove from bot and wipe the partition (full delete). */
  removeAndClearAccount: (botId: string, accountId: string) => Promise<void>
  setAccountStatus: (accountId: string, status: ConnectionStatus, detail?: string) => void
  connectAccount: (accountId: string) => Promise<void>
  /** Muse: open same-partition login BrowserWindow. */
  openMuseLogin: (accountId: string) => Promise<void>
  /** Grok: open Cursor authenticator window; token auto-captured when possible. */
  openGrokLogin: (accountId: string) => Promise<void>
  /** Inject Grok accessToken into adapter after login (not persisted). */
  setGrokAccessToken: (accountId: string, accessToken: string, accountSlot?: string, machineId?: string) => Promise<void>
  disconnectAccount: (accountId: string) => Promise<void>
}

const seed = createSeed()

export const SIDEBAR_MIN = 240
export const SIDEBAR_MAX = 400
export const SIDEBAR_DEFAULT = 280

/** Turn form drafts into account ids, creating BotAccounts for new ones. */
function materializeAccounts(
  platformId: PlatformId,
  drafts: AccountDraft[],
  existing: Record<string, BotAccount>
): { ids: string[]; created: Record<string, BotAccount> } {
  const ids: string[] = []
  const created: Record<string, BotAccount> = {}
  for (const draft of drafts) {
    const displayName = draft.displayName.trim() || draft.handle.trim()
    if (!displayName && !draft.accountId) continue
    if (draft.accountId && existing[draft.accountId]) {
      if (!ids.includes(draft.accountId)) ids.push(draft.accountId)
      continue
    }
    const id = draft.accountId ?? createId('acc')
    created[id] = {
      id,
      platformId,
      displayName: displayName || getPlatform(platformId).name,
      handle: draft.handle.trim(),
      status: 'offline'
    }
    ids.push(id)
  }
  return { ids, created }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export const useBotStore = create<BotHubState>()(
  persist((set, get) => {
  const updateMessage = (botId: string, messageId: string, patch: Partial<ChatMessage>) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [botId]: (state.messages[botId] ?? []).map((m) => (m.id === messageId ? { ...m, ...patch } : m))
      }
    }))

  const patchBot = (botId: string, patch: (bot: Bot) => Partial<Bot>) =>
    set((state) => ({ bots: state.bots.map((b) => (b.id === botId ? { ...b, ...patch(b) } : b)) }))

  const patchAccount = (accountId: string, patch: Partial<BotAccount>) =>
    set((state) => {
      const account = state.accounts[accountId]
      if (!account) return state
      return { accounts: { ...state.accounts, [accountId]: { ...account, ...patch } } }
    })

  /** Hand a stored user message to the bot's platform adapter. */
  const deliver = async (botId: string, messageId: string) => {
    const state = get()
    const bot = state.bots.find((b) => b.id === botId)
    const message = state.messages[botId]?.find((m) => m.id === messageId)
    if (!bot || !message) return

    const adapter = adapterRegistry.get(bot.platformId)
    if (!adapter) {
      updateMessage(botId, messageId, { delivery: 'failed', error: 'This platform is not available yet.' })
      return
    }

    try {
      await adapter.sendMessage({
        conversationId: botId,
        accountId: message.accountId,
        text: message.text,
        attachments: message.attachments
      })
      updateMessage(botId, messageId, { delivery: 'sent', error: undefined })
    } catch (error) {
      updateMessage(botId, messageId, { delivery: 'failed', error: errorMessage(error) })
    }
  }

  return {
    ...seed,
    typing: {},
    selectedBotId: seed.bots[0]?.id ?? null,
    collapsedGroups: {},
    infoPanelOpen: true,
    sidebarWidth: SIDEBAR_DEFAULT,
    addBotOpen: false,
    addBotKey: 0,
    paletteOpen: false,
    paletteQuery: '',
    paletteKey: 0,
    webSessionOpen: false,

    selectBot: (botId) =>
      set((state) => ({
        selectedBotId: botId,
        bots: state.bots.map((b) => (b.id === botId && b.unread > 0 ? { ...b, unread: 0 } : b))
      })),

    toggleGroup: (groupId) =>
      set((state) => ({
        collapsedGroups: { ...state.collapsedGroups, [groupId]: !state.collapsedGroups[groupId] }
      })),

    toggleInfoPanel: () => set((state) => ({ infoPanelOpen: !state.infoPanelOpen })),

    setSidebarWidth: (width) =>
      set({ sidebarWidth: Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width))) }),

    setAddBotOpen: (open) =>
      set((state) => (open ? { addBotOpen: true, addBotKey: state.addBotKey + 1 } : { addBotOpen: false })),

    toggleWebSession: () => set((state) => ({ webSessionOpen: !state.webSessionOpen })),

    openPalette: (query = '') =>
      set((state) => ({ paletteOpen: true, paletteQuery: query, paletteKey: state.paletteKey + 1 })),

    closePalette: () => set({ paletteOpen: false }),

    selectAdjacentBot: (offset) => {
      const state = get()
      const ordered = state.groups.flatMap((g) => state.bots.filter((b) => b.groupId === g.id))
      if (ordered.length === 0) return
      const index = ordered.findIndex((b) => b.id === state.selectedBotId)
      const next = ordered[(index + offset + ordered.length) % ordered.length]
      if (next) get().selectBot(next.id)
    },

    addBot: (input) => {
      const state = get()
      const { ids, created } = materializeAccounts(input.platformId, input.accounts, state.accounts)
      if (ids.length === 0) throw new Error('A bot needs at least one account.')

      let groups = state.groups
      let groupId: string
      const choice = input.group
      if (choice?.kind === 'existing' && groups.some((g) => g.id === choice.groupId)) {
        groupId = choice.groupId
      } else if (choice?.kind === 'new' && choice.name.trim()) {
        const name = choice.name.trim()
        const match = groups.find((g) => g.name.toLowerCase() === name.toLowerCase())
        groupId = match?.id ?? createId('grp')
        if (!match) groups = [...groups, { id: groupId, name }]
      } else {
        const selectedGroup = state.bots.find((b) => b.id === state.selectedBotId)?.groupId
        groupId = selectedGroup ?? groups[0]?.id ?? createId('grp')
        if (!groups.some((g) => g.id === groupId)) groups = [...groups, { id: groupId, name: 'Workspace' }]
      }

      const bot: Bot = {
        id: input.id ?? createId('bot'),
        name: input.name.trim() || getPlatform(input.platformId).name,
        emoji: input.emoji ?? '🤖',
        avatar: input.avatar,
        description: input.description?.trim() ?? '',
        platformId: input.platformId,
        groupId,
        accountIds: ids,
        activeAccountId: ids[0]!,
        memory: [],
        notes: '',
        createdAt: Date.now(),
        unread: 0
      }

      set((s) => ({
        groups,
        bots: [...s.bots, bot],
        accounts: { ...s.accounts, ...created },
        messages: { ...s.messages, [bot.id]: [] },
        selectedBotId: bot.id,
        collapsedGroups: { ...s.collapsedGroups, [groupId]: false },
        addBotOpen: false
      }))

      const accounts = get().accounts
      for (const id of ids) if (accounts[id]?.status === 'offline') void get().connectAccount(id)
      return bot.id
    },

    addAccountsToBot: (botId, drafts) => {
      const state = get()
      const bot = state.bots.find((b) => b.id === botId)
      if (!bot) return
      const { ids, created } = materializeAccounts(bot.platformId, drafts, state.accounts)
      const newIds = ids.filter((id) => !bot.accountIds.includes(id))
      if (newIds.length === 0) return

      set((s) => ({
        accounts: { ...s.accounts, ...created },
        bots: s.bots.map((b) => (b.id === botId ? { ...b, accountIds: [...b.accountIds, ...newIds] } : b))
      }))

      const accounts = get().accounts
      for (const id of newIds) if (accounts[id]?.status === 'offline') void get().connectAccount(id)
    },

    renameBot: (botId, name) => {
      const trimmed = name.trim()
      if (trimmed) patchBot(botId, () => ({ name: trimmed }))
    },

    setBotAvatar: (botId, avatar) => patchBot(botId, () => ({ avatar })),

    removeBot: async (botId) => {
      const state = get()
      const bot = state.bots.find((b) => b.id === botId)
      if (!bot) return
      const orphaned = bot.accountIds.filter((id) => !state.bots.some((b) => b.id !== botId && b.accountIds.includes(id)))
      const ordered = state.groups.flatMap((g) => state.bots.filter((b) => b.groupId === g.id))
      const index = ordered.findIndex((b) => b.id === botId)
      const neighbour = ordered[index + 1] ?? ordered[index - 1]
      set((s) => {
        const { [botId]: _messages, ...messages } = s.messages
        const { [botId]: _typing, ...typing } = s.typing
        return {
          bots: s.bots.filter((b) => b.id !== botId),
          messages,
          typing,
          selectedBotId: s.selectedBotId === botId ? (neighbour?.id ?? null) : s.selectedBotId
        }
      })
      for (const accountId of orphaned) {
        await get().signOutAccount(accountId)
        set((s) => {
          const { [accountId]: _removed, ...accounts } = s.accounts
          return { accounts }
        })
      }
    },

    sendMessage: async (botId, text, attachments) => {
      const bot = get().bots.find((b) => b.id === botId)
      const trimmed = text.trim()
      if (!bot || (!trimmed && !attachments?.length)) return

      const message: ChatMessage = {
        id: createId('msg'),
        botId,
        accountId: bot.activeAccountId,
        role: 'user',
        text: trimmed,
        createdAt: Date.now(),
        delivery: 'sending',
        attachments: attachments?.length ? attachments : undefined
      }
      set((state) => ({
        messages: { ...state.messages, [botId]: [...(state.messages[botId] ?? []), message] }
      }))
      await deliver(botId, message.id)
    },

    retryMessage: async (botId, messageId) => {
      updateMessage(botId, messageId, { delivery: 'sending', error: undefined })
      await deliver(botId, messageId)
    },

    receiveMessage: (incoming) =>
      set((state) => {
        const botId = incoming.conversationId
        if (!state.bots.some((b) => b.id === botId)) return state
        const list = state.messages[botId] ?? []
        const existingIdx = list.findIndex((m) => m.id === incoming.id)
        const message: ChatMessage = {
          id: incoming.id,
          botId,
          accountId: incoming.accountId,
          role: 'bot',
          text: incoming.text,
          createdAt: existingIdx >= 0 ? list[existingIdx]!.createdAt : incoming.createdAt
        }
        const selected = state.selectedBotId === botId
        const isNew = existingIdx < 0
        const account = state.accounts[incoming.accountId]
        const accounts =
          account && isNew
            ? {
                ...state.accounts,
                [incoming.accountId]: {
                  ...account,
                  unread: selected ? 0 : (account.unread ?? 0) + 1
                }
              }
            : state.accounts
        const nextList =
          existingIdx >= 0
            ? list.map((m, i) => (i === existingIdx ? message : m))
            : [...list, message]
        return {
          messages: { ...state.messages, [botId]: nextList },
          accounts,
          bots:
            selected || !isNew
              ? state.bots
              : state.bots.map((b) => (b.id === botId ? { ...b, unread: b.unread + 1 } : b))
        }
      }),

    applyMessageDelta: (messageId, conversationId, accountId, text) =>
      set((state) => {
        const botId = conversationId
        if (!state.bots.some((b) => b.id === botId)) return state
        const list = state.messages[botId] ?? []
        const existingIdx = list.findIndex((m) => m.id === messageId)
        if (existingIdx >= 0) {
          if (list[existingIdx]!.text === text) return state
          return {
            messages: {
              ...state.messages,
              [botId]: list.map((m, i) => (i === existingIdx ? { ...m, text } : m))
            }
          }
        }
        const message: ChatMessage = {
          id: messageId,
          botId,
          accountId,
          role: 'bot',
          text,
          createdAt: Date.now()
        }
        return { messages: { ...state.messages, [botId]: [...list, message] } }
      }),

    setTyping: (botId, isTyping) =>
      set((state) => {
        if ((state.typing[botId] === true) === isTyping) return state
        const typing = { ...state.typing }
        if (isTyping) typing[botId] = true
        else delete typing[botId]
        return { typing }
      }),

    updateNotes: (botId, notes) => patchBot(botId, () => ({ notes })),

    addMemory: (botId, text) => {
      const trimmed = text.trim()
      if (!trimmed) return
      patchBot(botId, (bot) => ({
        memory: [...bot.memory, { id: createId('mem'), text: trimmed, createdAt: Date.now() }]
      }))
    },

    removeMemory: (botId, memoryId) =>
      patchBot(botId, (bot) => ({ memory: bot.memory.filter((m) => m.id !== memoryId) })),

    removeAccountFromBot: (botId, accountId) =>
      patchBot(botId, (bot) => {
        // A bot always keeps at least one account.
        if (bot.accountIds.length <= 1 || !bot.accountIds.includes(accountId)) return {}
        const accountIds = bot.accountIds.filter((id) => id !== accountId)
        return {
          accountIds,
          activeAccountId: bot.activeAccountId === accountId ? accountIds[0]! : bot.activeAccountId
        }
      }),

    setActiveAccount: (botId, accountId) =>
      set((state) => {
        if (!state.bots.some((b) => b.id === botId && b.accountIds.includes(accountId))) return state
        const account = state.accounts[accountId]
        return {
          bots: state.bots.map((b) =>
            b.id === botId && b.accountIds.includes(accountId) ? { ...b, activeAccountId: accountId } : b
          ),
          accounts: account
            ? { ...state.accounts, [accountId]: { ...account, unread: 0 } }
            : state.accounts
        }
      }),

    setSelectedAgent: (botId, agentId) => {
      const trimmed = agentId.trim()
      if (!trimmed) return
      patchBot(botId, () => ({ selectedAgentId: trimmed }))
      try {
        const bot = get().bots.find((b) => b.id === botId)
        const account = bot ? get().accounts[bot.activeAccountId] : undefined
        const adapter = account && adapterRegistry.get(account.platformId)
        const grok = adapter as { bindConversationAgent?: (c: string, a: string) => void } | undefined
        grok?.bindConversationAgent?.(botId, trimmed)
      } catch {
        /* ignore */
      }
    },

    renameAccount: (accountId, displayName) => {
      const trimmed = displayName.trim()
      if (!trimmed) return
      patchAccount(accountId, { displayName: trimmed, label: trimmed })
    },

    signOutAccount: async (accountId) => {
      const account = get().accounts[accountId]
      if (!account || account.pending) return
      patchAccount(accountId, { pending: true })
      try {
        const bridge = electronBridge()
        if (account.platformId === 'meta-muse' && bridge?.muse?.signOut) {
          await bridge.muse.signOut(accountId)
        } else if (account.platformId === 'grok' && bridge?.grok?.clearAuth) {
          await bridge.grok.clearAuth(accountId)
          const adapter = adapterRegistry.get('grok') as { clearAuth?: (id: string) => void }
          adapter?.clearAuth?.(accountId)
        } else if (bridge?.webViews?.clearPartition) {
          await bridge.webViews.clearPartition(accountId)
        }
        const adapter = adapterRegistry.get(account.platformId)
        try {
          await adapter?.disconnect(accountId)
        } catch {
          /* ignore */
        }
        patchAccount(accountId, { status: 'offline', statusDetail: 'Signed out', unread: 0 })
      } catch (error) {
        patchAccount(accountId, { statusDetail: errorMessage(error) })
      } finally {
        patchAccount(accountId, { pending: false })
      }
    },

    removeAndClearAccount: async (botId, accountId) => {
      await get().signOutAccount(accountId)
      get().removeAccountFromBot(botId, accountId)
      set((state) => {
        const { [accountId]: _removed, ...rest } = state.accounts
        return { accounts: rest }
      })
    },

    setAccountStatus: (accountId, status, detail) => patchAccount(accountId, { status, statusDetail: detail }),

    connectAccount: async (accountId) => {
      const account = get().accounts[accountId]
      const adapter = account && adapterRegistry.get(account.platformId)
      if (!account || !adapter || account.pending) return
      patchAccount(accountId, { pending: true })
      try {
        const status = await adapter.connect(accountId)
        patchAccount(accountId, { status, statusDetail: undefined })
      } catch (error) {
        patchAccount(accountId, { status: 'error', statusDetail: errorMessage(error) })
      } finally {
        patchAccount(accountId, { pending: false })
      }
    },

    openMuseLogin: async (accountId) => {
      const account = get().accounts[accountId]
      const adapter = account && adapterRegistry.get(account.platformId)
      if (!account || !adapter || account.pending) return
      if (account.platformId !== 'meta-muse' || !adapter.openLogin) {
        await get().connectAccount(accountId)
        return
      }
      const bot = get().bots.find((b) => b.accountIds.includes(accountId))
      patchAccount(accountId, { pending: true, statusDetail: '等待在登录窗口完成…' })
      try {
        const status = await adapter.openLogin(accountId, bot?.id)
        patchAccount(accountId, {
          status,
          statusDetail: status === 'offline' ? '在弹出的窗口里完成 Muse 登录' : undefined
        })
      } catch (error) {
        patchAccount(accountId, { status: 'error', statusDetail: errorMessage(error) })
      } finally {
        patchAccount(accountId, { pending: false })
      }
    },


    openGrokLogin: async (accountId) => {
      const account = get().accounts[accountId]
      const adapter = account && adapterRegistry.get(account.platformId)
      if (!account || !adapter || account.pending) return
      if (account.platformId !== 'grok') {
        await get().connectAccount(accountId)
        return
      }
      const bot = get().bots.find((b) => b.accountIds.includes(accountId))
      patchAccount(accountId, { pending: true, statusDetail: '在登录窗口完成 Cursor / Grok 登录…' })
      try {
        const bridge = electronBridge()
        if (bridge?.grok?.openLogin) await bridge.grok.openLogin({ accountId })
        else if (adapter.openLogin) await adapter.openLogin(accountId, bot?.id)
        patchAccount(accountId, {
          status: 'busy',
          statusDetail: '在弹出的窗口里完成 Cursor / Grok 登录，成功后会自动导入'
        })
      } catch (error) {
        patchAccount(accountId, { status: 'error', statusDetail: errorMessage(error) })
      } finally {
        patchAccount(accountId, { pending: false })
      }
    },

    setGrokAccessToken: async (accountId, accessToken, accountSlot, machineId) => {
      const account = get().accounts[accountId]
      const adapter = account && adapterRegistry.get(account.platformId)
      if (!account || account.platformId !== 'grok') return
      patchAccount(accountId, { pending: true })
      try {
        const bridge = electronBridge()
        if (bridge?.grok?.setAccessToken) {
          await bridge.grok.setAccessToken({ accountId, accessToken, accountSlot, machineId })
        }
        const grok = adapter as {
          setAuth?: (s: {
            accountId: string
            accessToken: string
            accountSlot?: string
            machineId?: string
          }) => void
        }
        grok.setAuth?.({ accountId, accessToken, accountSlot, machineId })
        const status = await adapter?.connect(accountId)
        patchAccount(accountId, { status: status ?? 'online', statusDetail: undefined })
      } catch (error) {
        patchAccount(accountId, { status: 'error', statusDetail: errorMessage(error) })
      } finally {
        patchAccount(accountId, { pending: false })
      }
    },

    disconnectAccount: async (accountId) => {
      const account = get().accounts[accountId]
      const adapter = account && adapterRegistry.get(account.platformId)
      if (!account || !adapter || account.pending) return
      patchAccount(accountId, { pending: true })
      try {
        await adapter.disconnect(accountId)
        patchAccount(accountId, { status: 'offline', statusDetail: undefined })
      } catch (error) {
        patchAccount(accountId, { statusDetail: errorMessage(error) })
      } finally {
        patchAccount(accountId, { pending: false })
      }
    }
  }
  },
  {
    name: 'bothub-workspace-v1',
    partialize: (state) => ({
      groups: state.groups,
      bots: state.bots,
      accounts: state.accounts,
      messages: state.messages,
      selectedBotId: state.selectedBotId,
      collapsedGroups: state.collapsedGroups,
      infoPanelOpen: state.infoPanelOpen,
      sidebarWidth: state.sidebarWidth
    })
  }
)
)
