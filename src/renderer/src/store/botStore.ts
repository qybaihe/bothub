import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { getPlatform } from '@adapters/platforms'
import { adapterRegistry } from '@adapters/registry'
import { AdapterError, type AttachmentMeta, type ConnectionStatus, type IncomingMessage, type PlatformId } from '@adapters/types'
import { createId } from '@shared/id'
import { createSeed } from '@/data/seed'
import type { AccountDraft, Bot, BotAccount, BotGroup, ChatMessage, NewBotInput } from '@/types'
import {
  clearNoReplyFlag,
  createSafeStorage,
  sanitizePersisted,
  SEND_HARD_TIMEOUT_MS,
  SendTimeoutError,
  toPersistedMessages,
  withTimeout
} from './delivery'

let warnedStorage = false
const workspaceStorage = createJSONStorage(() =>
  createSafeStorage(
    () => (typeof localStorage === 'undefined' ? undefined : localStorage),
    (error) => {
      if (warnedStorage) return
      warnedStorage = true
      console.warn('[bothub] could not save workspace:', error instanceof Error ? error.name : 'error')
    }
  )
)

const NO_REPLY_TEXT = '已送达，但没有收到回复'

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
  /** Per-account Muse agent.status phrase. */
  activity: Record<string, import('@/types').BotActivity>
  selectedBotId: string | null
  collapsedGroups: Record<string, boolean>
  infoPanelOpen: boolean
  /** Sidebar collapsed into compact icon rail (Grok Bot style). */
  sidebarCollapsed: boolean
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
  /** Open the dedicated Grok Bot-style Settings view in the main pane. */
  settingsOpen: boolean
  settingsTab: 'overview' | 'general' | 'muse-accounts' | 'dot-accounts' | 'grok-accounts' | 'hark-accounts' | 'proxy-pool'
  /** Active document/article opened in the right-side Split-Pane Document Canvas. */
  activeDocument: import('@/components/chat/NativeDocumentDialog').NativeDocumentTarget | null

  // Navigation & layout
  selectBot: (botId: string) => void
  setActiveDocument: (doc: import('@/components/chat/NativeDocumentDialog').NativeDocumentTarget | null) => void
  toggleGroup: (groupId: string) => void
  /** Create a local sidebar section (Grok-like; not a host API). */
  addGroup: (name?: string) => string
  renameGroup: (groupId: string, name: string) => void
  /** Drop a section; its bots move to another section. Keeps at least one. */
  removeGroup: (groupId: string) => void
  moveBotToGroup: (botId: string, groupId: string) => void
  togglePinBot: (botId: string) => void
  /** Local drag-reorder: place `botId` before `beforeId` (or at end) inside `groupId`. */
  reorderBot: (botId: string, groupId: string, beforeId: string | null) => void
  toggleInfoPanel: () => void
  toggleSidebarCollapsed: () => void
  setSidebarWidth: (width: number) => void
  setAddBotOpen: (open: boolean) => void
  toggleWebSession: () => void
  setSettingsOpen: (
    open: boolean,
    tab?: 'overview' | 'general' | 'muse-accounts' | 'dot-accounts' | 'grok-accounts' | 'hark-accounts' | 'proxy-pool'
  ) => void
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
  setBotCharacter: (botId: string, character: { shape?: string; color?: string }) => void
  /** Delete a bot; accounts no other bot uses are signed out and dropped. */
  removeBot: (botId: string) => Promise<void>

  // Conversation
  sendMessage: (botId: string, text: string, attachments?: AttachmentMeta[]) => Promise<void>
  retryMessage: (botId: string, messageId: string) => Promise<void>
  receiveMessage: (message: IncomingMessage) => void
  /** Upsert a streaming assistant bubble (same id updated as deltas arrive). */
  applyMessageDelta: (messageId: string, conversationId: string, accountId: string, text: string, widgets?: import('@/types').ChatOptionWidget[], tools?: import('@/types').ChatToolCall[], media?: import('@/types').ChatMediaPart[], richWidgets?: import('@/types').ChatRichWidget[]) => void
  setTyping: (botId: string, isTyping: boolean) => void
  setActivity: (accountId: string, activity: import('@/types').BotActivity | null) => void
  setMessageWidgets: (botId: string, messageId: string, widgets: import('@/types').ChatOptionWidget[]) => void
  selectChatOption: (botId: string, messageId: string, widgetId: string, selectedText: string, optionIndex: number) => Promise<void>
  cancelGeneration: (botId: string) => Promise<void>
  switchMuseSession: (botId: string, sessionId: string) => Promise<void>
  startNewMuseSession: (botId: string) => Promise<void>

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
  /** Hark: open Hark login window (Google / Apple / Email OTP). */
  openHarkLogin: (accountId: string) => Promise<void>
  /** Dot: open ChatGPT Dot login window (chatgpt.com/dots). */
  openDotLogin: (accountId: string) => Promise<void>
  /** Inject Grok accessToken into adapter after login (encrypted via safeStorage). */
  setGrokAccessToken: (
    accountId: string,
    accessToken: string,
    accountSlot?: string,
    machineId?: string,
    refreshToken?: string
  ) => Promise<void>
  disconnectAccount: (accountId: string) => Promise<void>
  /** Wipe all stored credentials, tokens, cookies, and proxy pool across all platforms. */
  clearAllCredentials: () => Promise<void>
  /** Wipe all credentials and reset workspace (bots, accounts, messages, groups) to factory defaults. */
  resetWorkspace: () => Promise<void>
}


function uniqueGroupName(groups: BotGroup[], base = 'New section'): string {
  const taken = new Set(groups.map((g) => g.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
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
    // Keep drafts that already have a partition account id even if the name is empty.
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

function prevMediaMerge(
  prev: import('@/types').ChatMediaPart[] | undefined,
  incoming: import('@/types').ChatMediaPart[] | undefined
): import('@/types').ChatMediaPart[] | undefined {
  if (incoming?.length) return incoming
  return prev
}

function normalizeDotMsgId(rawId: string, role: 'user' | 'bot'): string {
  const clean = rawId.replace(/^(dot_u_|dot_)+/, '')
  return role === 'user' ? `dot_u_${clean}` : `dot_${clean}`
}

function mergeHydratedMessages(existing: ChatMessage[], hydrated: ChatMessage[]): ChatMessage[] {
  if (hydrated.length === 0) return existing
  const normalizedExisting = existing.map((m) =>
    m.id.startsWith('dot_dot_') ? { ...m, id: m.id.replace(/^dot_dot_/, 'dot_') } : m
  )
  const hydratedById = new Map(hydrated.map((m) => [m.id, m]))
  const keptLocal: ChatMessage[] = []
  const earliestHydratedTs = hydrated[0]?.createdAt ?? 0

  for (const localMsg of normalizedExisting) {
    if (hydratedById.has(localMsg.id)) continue
    // If this was a local user message (`msg_...`) that now exists in `hydrated` from the server, skip the duplicate
    if (
      localMsg.role === 'user' &&
      localMsg.id.startsWith('msg_') &&
      (localMsg.delivery === 'sent' || localMsg.delivery === 'no-reply') &&
      hydrated.some(
        (h) =>
          h.role === 'user' &&
          h.text.trim() === localMsg.text.trim() &&
          Math.abs(h.createdAt - localMsg.createdAt) < 120_000
      )
    ) {
      continue
    }
    // Keep older history before the hydrated window, or in-flight/failed local messages, or newer real-time messages
    if (
      localMsg.delivery === 'sending' ||
      localMsg.delivery === 'failed' ||
      localMsg.createdAt < earliestHydratedTs - 1000 ||
      localMsg.createdAt > (hydrated[hydrated.length - 1]?.createdAt ?? 0) + 1000
    ) {
      keptLocal.push(localMsg)
    }
  }

  const combined = [...keptLocal, ...hydrated]
  combined.sort((a, b) => a.createdAt - b.createdAt)
  const seen = new Set<string>()
  return combined.filter((m) => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })
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

    const applyReceipt = (receipt: import('@adapters/types').SendReceipt) => {
      if (receipt.sessionId && receipt.sessionId !== bot.activeSessionId) {
        patchBot(botId, () => ({ activeSessionId: receipt.sessionId }))
      }
      updateMessage(
        botId,
        messageId,
        receipt.noReply ? { delivery: 'no-reply', error: NO_REPLY_TEXT } : { delivery: 'sent', error: undefined }
      )
    }

    try {
      const receipt = await withTimeout(
        adapter.sendMessage({
          conversationId: botId,
          accountId: message.accountId,
          sessionId: bot.activeSessionId,
          text: message.text,
          attachments: message.attachments
        }),
        SEND_HARD_TIMEOUT_MS,
        // The adapter answered after we gave up: show what really happened.
        (late) => {
          if (late.ok) applyReceipt(late.value)
        }
      )
      applyReceipt(receipt)
    } catch (error) {
      if (error instanceof AdapterError && error.code === 'no-reply') {
        updateMessage(botId, messageId, { delivery: 'no-reply', error: error.message || NO_REPLY_TEXT })
      } else if (error instanceof SendTimeoutError) {
        updateMessage(botId, messageId, { delivery: 'failed', error: error.message })
        get().setTyping(botId, false)
      } else {
        updateMessage(botId, messageId, { delivery: 'failed', error: errorMessage(error) })
      }
    }
  }

  return {
    ...seed,
    typing: {},
    activity: {},
    selectedBotId: seed.bots[0]?.id ?? null,
    collapsedGroups: {},
    infoPanelOpen: true,
    sidebarCollapsed: false,
    sidebarWidth: SIDEBAR_DEFAULT,
    addBotOpen: false,
    addBotKey: 0,
    paletteOpen: false,
    paletteQuery: '',
    paletteKey: 0,
    webSessionOpen: false,
    settingsOpen: false,
    settingsTab: 'overview',
    activeDocument: null,

    setActiveDocument: (doc) => set({ activeDocument: doc }),

    selectBot: (botId) =>
      set((state) => {
        const targetBot = state.bots.find((b) => b.id === botId)
        let nextAccounts = state.accounts
        if (targetBot) {
          for (const accId of targetBot.accountIds) {
            const acc = nextAccounts[accId]
            if (acc && (acc.unread ?? 0) > 0) {
              nextAccounts = {
                ...nextAccounts,
                [accId]: { ...acc, unread: 0 }
              }
            }
          }
        }
        return {
          selectedBotId: botId,
          settingsOpen: false,
          activeDocument:
            state.activeDocument && targetBot?.accountIds.includes(state.activeDocument.accountId)
              ? state.activeDocument
              : null,
          accounts: nextAccounts,
          bots: state.bots.map((b) => (b.id === botId && b.unread > 0 ? { ...b, unread: 0 } : b))
        }
      }),

    toggleGroup: (groupId) =>
      set((state) => ({
        collapsedGroups: { ...state.collapsedGroups, [groupId]: !state.collapsedGroups[groupId] }
      })),

    addGroup: (name) => {
      const id = createId('grp')
      set((state) => {
        const requested = name?.trim()
        const finalName = requested
          ? (
              state.groups.some((g) => g.name.toLowerCase() === requested.toLowerCase())
                ? uniqueGroupName(state.groups, requested)
                : requested
            )
          : uniqueGroupName(state.groups)
        return {
          groups: [...state.groups, { id, name: finalName }],
          collapsedGroups: { ...state.collapsedGroups, [id]: false }
        }
      })
      return id
    },

    renameGroup: (groupId, name) => {
      const next = name.trim()
      if (!next) return
      set((state) => ({
        groups: state.groups.map((g) => (g.id === groupId ? { ...g, name: next } : g))
      }))
    },

    removeGroup: (groupId) =>
      set((state) => {
        if (state.groups.length <= 1) return state
        if (!state.groups.some((g) => g.id === groupId)) return state
        const fallback = state.groups.find((g) => g.id !== groupId)
        if (!fallback) return state
        const { [groupId]: _collapsed, ...collapsedGroups } = state.collapsedGroups
        return {
          groups: state.groups.filter((g) => g.id !== groupId),
          bots: state.bots.map((b) => (b.groupId === groupId ? { ...b, groupId: fallback.id } : b)),
          collapsedGroups
        }
      }),

    moveBotToGroup: (botId, groupId) =>
      set((state) => {
        if (!state.groups.some((g) => g.id === groupId)) return state
        return {
          bots: state.bots.map((b) => (b.id === botId ? { ...b, groupId } : b)),
          collapsedGroups: { ...state.collapsedGroups, [groupId]: false }
        }
      }),

    togglePinBot: (botId) =>
      set((state) => ({ bots: state.bots.map((b) => (b.id === botId ? { ...b, pinned: !b.pinned } : b)) })),

    reorderBot: (botId, groupId, beforeId) =>
      set((state) => {
        if (botId === beforeId) return state
        const bot = state.bots.find((b) => b.id === botId)
        if (!bot || !state.groups.some((g) => g.id === groupId)) return state
        const rest = state.bots.filter((b) => b.id !== botId)
        const moved = { ...bot, groupId }
        let at = beforeId ? rest.findIndex((b) => b.id === beforeId) : -1
        if (at < 0) {
          const lastInGroup = rest.map((b) => b.groupId).lastIndexOf(groupId)
          at = lastInGroup < 0 ? rest.length : lastInGroup + 1
        }
        rest.splice(at, 0, moved)
        return { bots: rest }
      }),

    toggleInfoPanel: () => set((state) => ({ infoPanelOpen: !state.infoPanelOpen })),

    toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

    setSidebarWidth: (width) =>
      set({ sidebarWidth: Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width))) }),

    setAddBotOpen: (open) =>
      set((state) => (open ? { addBotOpen: true, addBotKey: state.addBotKey + 1 } : { addBotOpen: false })),

    toggleWebSession: () => set((state) => ({ webSessionOpen: !state.webSessionOpen })),

    setSettingsOpen: (open, tab) =>
      set((state) => ({
        settingsOpen: open,
        settingsTab: tab ?? state.settingsTab
      })),

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
        notes: input.notes?.trim() ?? '',
        createdAt: Date.now(),
        unread: 0
      }

      set((s) => ({
        groups,
        bots: [...s.bots, bot],
        accounts: { ...s.accounts, ...created },
        messages: { ...s.messages, [bot.id]: [] },
        selectedBotId: input.background ? s.selectedBotId ?? bot.id : bot.id,
        collapsedGroups: { ...s.collapsedGroups, [groupId]: false },
        addBotOpen: input.background ? s.addBotOpen : false
      }))

      const accounts = get().accounts
      const bridge = electronBridge()
      if (input.platformId === 'meta-muse' && bridge?.muse?.assignProxyPool) {
        // Hark accounts share the pool; leaving them out freed their proxies.
        const allMuseIds = Object.values(accounts)
          .filter((a) => a.platformId === 'meta-muse' || a.platformId === 'hark')
          .map((a) => a.id)
        void bridge.muse.assignProxyPool(allMuseIds).catch(() => undefined)
      }
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
      const bridge = electronBridge()
      if (bot.platformId === 'meta-muse' && bridge?.muse?.assignProxyPool) {
        const allMuseIds = Object.values(accounts)
          .filter((a) => a.platformId === 'meta-muse' || a.platformId === 'hark')
          .map((a) => a.id)
        void bridge.muse.assignProxyPool(allMuseIds).catch(() => undefined)
      }
      for (const id of newIds) if (accounts[id]?.status === 'offline') void get().connectAccount(id)
    },

    renameBot: (botId, name) => {
      const trimmed = name.trim()
      if (trimmed) patchBot(botId, () => ({ name: trimmed }))
    },

    setBotAvatar: (botId, avatar) => patchBot(botId, () => ({ avatar })),

    setBotCharacter: (botId, character) =>
      patchBot(botId, (b) => ({
        avatarShape: character.shape ?? b.avatarShape,
        avatarColor: character.color ?? b.avatarColor
      })),

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
        const botId = state.bots.some((b) => b.id === incoming.conversationId)
          ? incoming.conversationId
          : state.bots.find((b) => b.accountIds.includes(incoming.accountId))?.id
        if (!botId) return state
        const list = state.messages[botId] ?? []
        const existingIdx = list.findIndex((m) => m.id === incoming.id)
        const prevText = existingIdx >= 0 ? list[existingIdx]!.text : ''
        const incomingText = incoming.text
        const mergedText =
          existingIdx < 0
            ? incomingText
            : !incomingText
              ? prevText
              : incomingText.length < prevText.length
                ? prevText
                : incomingText.startsWith(prevText) || prevText.length === 0
                  ? incomingText
                  : incomingText.length > prevText.length
                    ? incomingText
                    : prevText
        const prevWidgets = existingIdx >= 0 ? list[existingIdx]!.widgets : undefined
        const incomingWidgets = (incoming as { widgets?: ChatMessage['widgets'] }).widgets
        const prevTools = existingIdx >= 0 ? list[existingIdx]!.tools : undefined
        const incomingTools = (incoming as { tools?: ChatMessage['tools'] }).tools
        const prevMedia = existingIdx >= 0 ? list[existingIdx]!.media : undefined
        const incomingMedia = (incoming as { media?: ChatMessage['media'] }).media
        const prevRich = existingIdx >= 0 ? list[existingIdx]!.richWidgets : undefined
        const incomingRich = (incoming as { richWidgets?: ChatMessage['richWidgets'] }).richWidgets
        const message: ChatMessage = {
          id: incoming.id,
          botId,
          accountId: incoming.accountId,
          role: 'bot',
          text: mergedText,
          createdAt: existingIdx >= 0 ? list[existingIdx]!.createdAt : incoming.createdAt,
          widgets: incomingWidgets?.length ? incomingWidgets : prevWidgets,
          tools: incomingTools?.length ? incomingTools : prevTools,
          media: incomingMedia?.length ? incomingMedia : prevMedia,
          richWidgets: incomingRich?.length ? incomingRich : prevRich
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
            : clearNoReplyFlag([...list, message])
        return {
          messages: { ...state.messages, [botId]: nextList },
          accounts,
          bots:
            selected || !isNew
              ? state.bots
              : state.bots.map((b) => (b.id === botId ? { ...b, unread: b.unread + 1 } : b))
        }
      }),

    applyMessageDelta: (messageId, conversationId, accountId, text, widgets, tools, media, richWidgets) =>
      set((state) => {
        const botId = state.bots.some((b) => b.id === conversationId)
          ? conversationId
          : state.bots.find((b) => b.accountIds.includes(accountId))?.id
        if (!botId) return state
        const list = state.messages[botId] ?? []
        const existingIdx = list.findIndex((m) => m.id === messageId)
        if (existingIdx >= 0) {
          const prev = list[existingIdx]!.text
          // Reconnect/backfill can briefly send a shorter snapshot — never shrink.
          const next =
            !text
              ? prev
              : text.length < prev.length
                ? prev
                : text.startsWith(prev) || prev.length === 0
                  ? text
                  : text.length > prev.length
                    ? text
                    : prev
          const prevMsg = list[existingIdx]!
          const nextWidgets = widgets?.length ? widgets : prevMsg.widgets
          const nextTools = tools?.length ? tools : prevMsg.tools
          const nextMedia = media?.length ? media : prevMediaMerge(prevMsg.media, media)
          const nextRich = richWidgets?.length ? richWidgets : prevMsg.richWidgets
          if (
            next === prev &&
            nextWidgets === prevMsg.widgets &&
            nextTools === prevMsg.tools &&
            nextMedia === prevMsg.media &&
            nextRich === prevMsg.richWidgets
          )
            return state
          return {
            messages: {
              ...state.messages,
              [botId]: list.map((m, i) =>
                i === existingIdx
                  ? {
                      ...m,
                      text: next,
                      widgets: nextWidgets,
                      tools: nextTools,
                      media: nextMedia,
                      richWidgets: nextRich
                    }
                  : m
              )
            }
          }
        }
        const message: ChatMessage = {
          id: messageId,
          botId,
          accountId,
          role: 'bot',
          text,
          createdAt: Date.now(),
          widgets: widgets?.length ? widgets : undefined,
          tools: tools?.length ? tools : undefined,
          media: media?.length ? media : undefined,
          richWidgets: richWidgets?.length ? richWidgets : undefined
        }
        return { messages: { ...state.messages, [botId]: clearNoReplyFlag([...list, message]) } }
      }),

    setTyping: (botIdOrAccountId, isTyping) =>
      set((state) => {
        const botId = state.bots.some((b) => b.id === botIdOrAccountId)
          ? botIdOrAccountId
          : state.bots.find((b) => b.accountIds.includes(botIdOrAccountId))?.id ?? botIdOrAccountId
        if ((state.typing[botId] === true) === isTyping) return state
        const typing = { ...state.typing }
        if (isTyping) typing[botId] = true
        else delete typing[botId]
        return { typing }
      }),

    setActivity: (accountId, activity) =>
      set((state) => {
        if (!activity || !activity.busy || activity.code === 'idle') {
          if (!(accountId in state.activity)) return state
          const { [accountId]: _removed, ...rest } = state.activity
          return { activity: rest }
        }
        const prev = state.activity[accountId]
        if (
          prev &&
          prev.code === activity.code &&
          prev.text === activity.text &&
          prev.emoji === activity.emoji &&
          prev.busy === activity.busy &&
          prev.subagents === activity.subagents
        ) {
          return state
        }
        return { activity: { ...state.activity, [accountId]: activity } }
      }),

    setMessageWidgets: (botId, messageId, widgets) =>
      set((state) => {
        const list = state.messages[botId] ?? []
        const idx = list.findIndex((m) => m.id === messageId)
        if (idx < 0) return state
        return {
          messages: {
            ...state.messages,
            [botId]: list.map((m, i) => (i === idx ? { ...m, widgets } : m))
          }
        }
      }),

    selectChatOption: async (botId, messageId, widgetId, selectedText, optionIndex) => {
      const state = get()
      const bot = state.bots.find((b) => b.id === botId)
      if (!bot) return
      const list = state.messages[botId] ?? []
      const host = list.find((m) => m.id === messageId)
      const widget = host?.widgets?.find((w) => w.widgetId === widgetId)
      if (!host || !widget) return
      const adapter = adapterRegistry.get(bot.platformId) as {
        selectOptionWidget?: (a: {
          accountId: string
          conversationId: string
          hostMessageId: string
          widget: NonNullable<ChatMessage['widgets']>[number]
          selectedText: string
          optionIndex: number
        }) => Promise<void>
      }
      const markChosen = (selected: string | undefined) =>
        set((s) => ({
          messages: {
            ...s.messages,
            [botId]: (s.messages[botId] ?? []).map((m) =>
              m.id !== messageId || !m.widgets
                ? m
                : { ...m, widgets: m.widgets.map((w) => (w.widgetId === widgetId ? { ...w, selectedText: selected } : w)) }
            )
          }
        }))
      if (!adapter?.selectOptionWidget) {
        // Platforms without a native option call (Grok, Hark, Dot): the chip
        // is just a reply, so send it as a normal message. Before, the chip
        // showed a "sent" bubble while nothing was sent at all.
        markChosen(selectedText)
        await get().sendMessage(botId, selectedText)
        return
      }
      const optId = createId('opt')
      set((s) => {
        const msgs = s.messages[botId] ?? []
        const nextMsgs = msgs.map((m) => {
          if (m.id !== messageId || !m.widgets) return m
          return {
            ...m,
            widgets: m.widgets.map((w) =>
              w.widgetId === widgetId ? { ...w, selectedText } : w
            )
          }
        })
        const userMsg: ChatMessage = {
          id: optId,
          botId,
          accountId: bot.activeAccountId,
          role: 'user',
          text: selectedText,
          createdAt: Date.now(),
          delivery: 'sending'
        }
        return { messages: { ...s.messages, [botId]: [...nextMsgs, userMsg] } }
      })
      try {
        await adapter.selectOptionWidget({
          accountId: bot.activeAccountId,
          conversationId: botId,
          hostMessageId: messageId,
          widget,
          selectedText,
          optionIndex
        })
        updateMessage(botId, optId, { delivery: 'sent', error: undefined })
      } catch (error) {
        // Unlock the chips so the user can pick again; keep the reason visible.
        markChosen(undefined)
        updateMessage(botId, optId, { delivery: 'failed', error: errorMessage(error) })
      }
    },

    cancelGeneration: async (botId) => {
      const bot = get().bots.find((b) => b.id === botId)
      if (!bot) return
      get().setTyping(botId, false)
      get().setActivity(bot.activeAccountId, null)
      get().setAccountStatus(bot.activeAccountId, 'online')
      const bridge = electronBridge()
      if (bot.platformId === 'meta-muse' && bridge?.muse?.cancelChat) {
        await bridge.muse.cancelChat(bot.activeAccountId, bot.activeSessionId)
      } else if (bot.platformId === 'grok' && bot.selectedAgentId && bridge?.grok?.rpc) {
        await bridge.grok
          .rpc({
            accountId: bot.activeAccountId,
            op: 'call',
            method: 'InterruptGrokBotAgentRun',
            params: {
              agent_id: bot.selectedAgentId,
              reason: 'user_interrupt',
              ...(bot.activeSessionId ? { session_id: bot.activeSessionId } : {})
            }
          })
          .catch(() => undefined)
      } else if (bot.platformId === 'hark' && bridge?.hark?.rpc) {
        await Promise.all([
          bridge.hark
            .rpc({
              accountId: bot.activeAccountId,
              op: 'call',
              method: 'POST',
              path: '/messages/pause-agent',
              body: bot.activeSessionId ? { conversationId: bot.activeSessionId } : {}
            })
            .catch(() => undefined),
          bridge.hark
            .rpc({
              accountId: bot.activeAccountId,
              op: 'call',
              method: 'POST',
              path: '/messages/stop-tool',
              body: bot.activeSessionId ? { conversationId: bot.activeSessionId } : {}
            })
            .catch(() => undefined)
        ])
      } else if (bot.platformId === 'dot' && bridge?.dot?.rpc) {
        await bridge.dot
          .rpc({
            accountId: bot.activeAccountId,
            op: 'cancelTurn'
          })
          .catch(() => undefined)
      }
    },

    switchMuseSession: async (botId, sessionId) => {
      const bot = get().bots.find((b) => b.id === botId)
      if (!bot || bot.platformId !== 'meta-muse') return
      patchBot(botId, () => ({ activeSessionId: sessionId }))
      const bridge = electronBridge()
      if (!bridge?.muse?.loadSessionHistory) return
      const rows = await bridge.muse.loadSessionHistory(bot.activeAccountId, sessionId)
      const hydrated: ChatMessage[] = rows.map((r) => ({
        id: r.id,
        botId,
        accountId: bot.activeAccountId,
        role: r.role,
        text: r.text,
        createdAt: r.createdAt,
        delivery: r.role === 'user' ? 'sent' : undefined,
        widgets: r.widgets,
        richWidgets: r.richWidgets,
        tools: r.tools,
        media: r.media
      }))
      set((s) => ({
        messages: { ...s.messages, [botId]: hydrated }
      }))
    },

    startNewMuseSession: async (botId) => {
      const bot = get().bots.find((b) => b.id === botId)
      if (!bot || bot.platformId !== 'meta-muse') return
      const bridge = electronBridge()
      let newSessionId: string | undefined
      if (bridge?.muse?.startSession) {
        try {
          const res = await bridge.muse.startSession(bot.activeAccountId)
          if (res.sessionId) newSessionId = res.sessionId
        } catch {
          /* ignore */
        }
      }
      patchBot(botId, () => ({ activeSessionId: newSessionId }))
      set((s) => ({
        messages: { ...s.messages, [botId]: [] }
      }))
    },

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

    setActiveAccount: (botId, accountId) => {
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
      })
      const acc = get().accounts[accountId]
      if (acc && acc.status === 'offline') {
        void get().connectAccount(accountId)
      }
    },

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
        const bridge = electronBridge()
        if (bot?.platformId === 'grok' && bridge?.grok?.rpc) {
          void bridge.grok
            .rpc({
              accountId: bot.activeAccountId,
              op: 'listTranscriptEntries',
              agentId: trimmed,
              sessionId: bot.activeSessionId ?? '',
              limit: 60
            })
            .then((res) => {
              if (!res.ok || !res.data || typeof res.data !== 'object') return
              const root = res.data as Record<string, unknown>
              const entries = (Array.isArray(root['entries']) ? root['entries'] : []) as Record<string, unknown>[]
              const hydrated: ChatMessage[] = []
              for (const raw of entries) {
                let e = raw
                if (typeof raw['body'] === 'string' && raw['body']) {
                  try {
                    e = { ...raw, ...(JSON.parse(atob(raw['body'] as string)) as Record<string, unknown>) }
                  } catch {
                    /* ignore */
                  }
                }
                const msgObj = e['message'] as Record<string, unknown> | undefined
                const roleRaw = String(e['role'] ?? '')
                const kindRaw = String(e['kind'] ?? e['entryKind'] ?? '')
                if (/^event$/i.test(kindRaw)) continue
                const isUser = /^user$/i.test(roleRaw) || /^user-attachment$/i.test(kindRaw)
                const widgetObj = msgObj?.['widget'] as Record<string, unknown> | undefined
                const text = String(
                  e['text'] ??
                    e['content'] ??
                    msgObj?.['text'] ??
                    msgObj?.['content'] ??
                    widgetObj?.['prompt'] ??
                    widgetObj?.['title'] ??
                    ''
                ).trim()

                let widgets: ChatMessage['widgets']
                if (widgetObj && Array.isArray(widgetObj['options'])) {
                  const opts = (widgetObj['options'] as Array<Record<string, unknown>>)
                    .map((o) => String(o['label'] ?? o['text'] ?? o['id'] ?? '').trim())
                    .filter(Boolean)
                  if (opts.length > 0) {
                    const resp = widgetObj['response'] as Record<string, unknown> | undefined
                    widgets = [
                      {
                        kind: 'option',
                        widgetId: String(widgetObj['id'] ?? e['id'] ?? 'grok_w'),
                        options: opts,
                        buttonStyle: 'center_aligned_filled',
                        baseVersion: 1,
                        selectedText: resp?.['optionId'] ? String(resp['optionId']) : undefined
                      }
                    ]
                  }
                }

                let media: ChatMessage['media']
                const attObj = (msgObj?.['attachment'] ?? e['attachment']) as Record<string, unknown> | undefined
                if (attObj && typeof attObj === 'object') {
                  const attPath = String(attObj['path'] ?? attObj['url'] ?? '').trim()
                  if (attPath) {
                    media = [
                      {
                        kind: String(attObj['mimeType'] ?? '').startsWith('image/') ? 'image' : 'file',
                        path: attPath,
                        name: String(attObj['name'] ?? attPath.split('/').pop() ?? 'attachment'),
                        mimeType: typeof attObj['mimeType'] === 'string' ? attObj['mimeType'] : undefined
                      }
                    ]
                  }
                }

                if (!text && !widgets?.length && !media?.length) continue
                const rawId = String(e['id'] ?? e['message_id'] ?? hydrated.length)
                hydrated.push({
                  id: isUser ? `grok_u_${rawId}` : `grok_${rawId}`,
                  botId,
                  accountId: bot.activeAccountId,
                  role: isUser ? 'user' : 'bot',
                  text,
                  createdAt: Number(e['timestampMs'] ?? e['created_at_ms'] ?? Date.now()) || Date.now(),
                  delivery: isUser ? 'sent' : undefined,
                  ...(widgets ? { widgets } : {}),
                  ...(media ? { media } : {})
                })
              }
              if (hydrated.length > 0) {
                set((s) => ({ messages: { ...s.messages, [botId]: hydrated } }))
              }
            })
            .catch(() => undefined)
        }
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
        } else if (account.platformId === 'dot' && bridge?.dot?.clearAuth) {
          await bridge.dot.clearAuth(accountId)
          await bridge.webViews?.clearPartition?.(accountId)
        } else if (account.platformId === 'hark' && bridge?.hark?.clearAuth) {
          await bridge.hark.clearAuth(accountId)
          await bridge.webViews?.clearPartition?.(accountId)
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
        if (account.platformId === 'hark' && status === 'online') {
          const bridge = electronBridge()
          const ownerBot = get().bots.find((b) => b.accountIds.includes(accountId))
          if (ownerBot && bridge?.hark?.rpc) {
            void bridge.hark
              .rpc({ accountId, op: 'mainConversation' })
              .then((res) => {
                if (!res.ok || !res.data || typeof res.data !== 'object') return
                const d = res.data as {
                  conversationId?: string
                  messages?: Array<{
                    id: string
                    role: string
                    content: string
                    thought?: string | null
                    narration?: string | null
                    createdAt?: string | number | null
                    toolCalls?: Array<{ dispatchId: string; name: string; status: string; url?: string }>
                    actions?: Array<{ kind: string; connector?: string; label: string }>
                    media?: ChatMessage['media']
                    richWidgets?: ChatMessage['richWidgets']
                  }>
                }
                if (d.conversationId) {
                  patchBot(ownerBot.id, () => ({ activeSessionId: d.conversationId }))
                }
                if (Array.isArray(d.messages) && d.messages.length > 0) {
                  const hydrated: ChatMessage[] = d.messages
                    .filter(
                      (m) =>
                        (m.content && m.content.trim()) ||
                        (m.actions && m.actions.length > 0) ||
                        (m.media && m.media.length > 0) ||
                        (m.richWidgets && m.richWidgets.length > 0)
                    )
                    .map((m) => {
                      const isUser = /^user$/i.test(m.role)
                      const ts =
                        typeof m.createdAt === 'number'
                          ? m.createdAt
                          : typeof m.createdAt === 'string'
                            ? Date.parse(m.createdAt) || Date.now()
                            : Date.now()
                      const combinedRich: NonNullable<ChatMessage['richWidgets']> = [
                        ...(m.richWidgets ?? [])
                      ]
                      if (m.actions && m.actions.length > 0) {
                        combinedRich.push({
                          kind: 'text_with_button',
                          widgetId: `hark_act_${m.id}`,
                          text: '',
                          buttons: m.actions.map((a) => ({
                            label: a.label || `Connect ${a.connector ?? ''}`,
                            actionText: a.connector ? `Connect ${a.connector}` : a.label
                          }))
                        })
                      }
                      const richWidgets = combinedRich.length > 0 ? combinedRich : undefined
                      const tools: ChatMessage['tools'] =
                        m.toolCalls && m.toolCalls.length > 0
                          ? m.toolCalls.map((tc) => ({
                              id: tc.dispatchId,
                              name: tc.name,
                              status:
                                tc.status === 'running'
                                  ? 'running'
                                  : tc.status === 'failed'
                                    ? 'errored'
                                    : 'completed',
                              summary: tc.url || m.narration || undefined
                            }))
                          : m.narration || m.thought
                            ? [
                                {
                                  id: `hark_thought_${m.id}`,
                                  name: m.narration ? 'Agent Activity' : 'Thinking',
                                  status: 'completed',
                                  summary: (m.narration || m.thought || '').slice(0, 140)
                                }
                              ]
                            : undefined
                      return {
                        id: isUser ? `hark_u_${m.id}` : `hark_${m.id}`,
                        botId: ownerBot.id,
                        accountId,
                        role: isUser ? 'user' : 'bot',
                        text: m.content?.trim() || '',
                        createdAt: ts,
                        delivery: isUser ? 'sent' : undefined,
                        richWidgets,
                        tools,
                        ...(m.media && m.media.length > 0 ? { media: m.media } : {})
                      }
                    })
                  if (hydrated.length > 0) {
                    set((s) => ({
                      messages: {
                        ...s.messages,
                        [ownerBot.id]: mergeHydratedMessages(s.messages[ownerBot.id] ?? [], hydrated)
                      }
                    }))
                  }
                }
              })
              .catch(() => undefined)
          }
        } else if (account.platformId === 'dot' && status === 'online') {
          const bridge = electronBridge()
          const ownerBot =
            get().bots.find((b) => b.activeAccountId === accountId) ??
            get().bots.find((b) => b.accountIds.includes(accountId))
          if (ownerBot && bridge?.dot?.rpc) {
            void bridge.dot
              .authStatus(accountId)
              .then((st) => {
                if (st.handle || st.displayName) {
                  patchAccount(accountId, {
                    handle: st.handle || account.handle,
                    displayName: st.displayName || account.displayName
                  })
                }
              })
              .catch(() => undefined)
            void bridge.dot
              .rpc({ accountId, op: 'listRoomMessages', limit: 32 })
              .then((res) => {
                if (!res.ok || !res.data || typeof res.data !== 'object') return
                const d = res.data as {
                  roomId?: string
                  dotId?: string
                  messages?: Array<{
                    id: string
                    role: 'user' | 'bot'
                    text: string
                    createdAtMs: number
                    media?: ChatMessage['media']
                  }>
                }
                if (d.roomId) {
                  patchBot(ownerBot.id, () => ({ activeSessionId: d.roomId }))
                }
                if (Array.isArray(d.messages) && d.messages.length > 0) {
                  const hydrated: ChatMessage[] = d.messages
                    .filter((m) => (m.text && m.text.trim()) || (m.media && m.media.length > 0))
                    .map((m) => ({
                      id: normalizeDotMsgId(m.id, m.role),
                      botId: ownerBot.id,
                      accountId,
                      role: m.role,
                      text: (m.text || '').trim(),
                      createdAt: m.createdAtMs || Date.now(),
                      delivery: m.role === 'user' ? 'sent' : undefined,
                      ...(m.media && m.media.length > 0 ? { media: m.media } : {})
                    }))
                  if (hydrated.length > 0) {
                    set((s) => ({
                      messages: {
                        ...s.messages,
                        [ownerBot.id]: mergeHydratedMessages(s.messages[ownerBot.id] ?? [], hydrated)
                      }
                    }))
                  }
                }
              })
              .catch(() => undefined)
          }
        }
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

    openHarkLogin: async (accountId) => {
      const account = get().accounts[accountId]
      const adapter = account && adapterRegistry.get(account.platformId)
      if (!account || !adapter || account.pending) return
      if (account.platformId !== 'hark' || !adapter.openLogin) {
        await get().connectAccount(accountId)
        return
      }
      const bot = get().bots.find((b) => b.accountIds.includes(accountId))
      patchAccount(accountId, { pending: true, statusDetail: '在弹出的窗口完成 Hark 登录…' })
      try {
        const status = await adapter.openLogin(accountId, bot?.id)
        patchAccount(accountId, {
          status,
          statusDetail: status === 'offline' ? '在弹出的窗口完成 Hark 登录' : undefined
        })
      } catch (error) {
        patchAccount(accountId, { status: 'error', statusDetail: errorMessage(error) })
      } finally {
        patchAccount(accountId, { pending: false })
      }
    },

    openDotLogin: async (accountId) => {
      const account = get().accounts[accountId]
      const adapter = account && adapterRegistry.get(account.platformId)
      if (!account || !adapter || account.pending) return
      if (account.platformId !== 'dot' || !adapter.openLogin) {
        await get().connectAccount(accountId)
        return
      }
      const bot = get().bots.find((b) => b.accountIds.includes(accountId))
      patchAccount(accountId, { pending: true, statusDetail: '在弹出的窗口完成 ChatGPT Dot 登录…' })
      try {
        const status = await adapter.openLogin(accountId, bot?.id)
        patchAccount(accountId, {
          status,
          statusDetail: status === 'offline' ? '在弹出的窗口完成 ChatGPT 登录或导入凭据' : undefined
        })
      } catch (error) {
        patchAccount(accountId, { status: 'error', statusDetail: errorMessage(error) })
      } finally {
        patchAccount(accountId, { pending: false })
      }
    },

    setGrokAccessToken: async (accountId, accessToken, accountSlot, machineId, refreshToken) => {
      const account = get().accounts[accountId]
      const adapter = account && adapterRegistry.get(account.platformId)
      if (!account || account.platformId !== 'grok') return
      patchAccount(accountId, { pending: true })
      try {
        const bridge = electronBridge()
        if (bridge?.grok?.setAccessToken) {
          await bridge.grok.setAccessToken({ accountId, accessToken, refreshToken, accountSlot, machineId })
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
    },

    clearAllCredentials: async () => {
      const bridge = electronBridge()
      const allAccounts = Object.values(get().accounts)
      for (const acc of allAccounts) {
        await get().signOutAccount(acc.id).catch(() => undefined)
      }
      await bridge?.dot?.clearAuth?.('*').catch(() => undefined)
      await bridge?.grok?.clearAuth?.('*').catch(() => undefined)
      await bridge?.muse?.clearProxyPool?.().catch(() => undefined)
    },

    resetWorkspace: async () => {
      await get().clearAllCredentials()
      const fresh = createSeed()
      set({
        groups: fresh.groups,
        bots: fresh.bots,
        accounts: fresh.accounts,
        messages: fresh.messages,
        typing: {},
        activity: {},
        selectedBotId: null,
        collapsedGroups: {}
      })
    }
  }
  },
  {
    name: 'bothub-workspace-v1',
    storage: workspaceStorage,
    // Nothing is in flight after a restart; drop stale `sending`/`pending`.
    merge: (persisted, current) => ({
      ...current,
      ...sanitizePersisted((persisted ?? {}) as Partial<BotHubState>)
    }),
    partialize: (state) => ({
      groups: state.groups,
      bots: state.bots,
      accounts: state.accounts,
      messages: toPersistedMessages(state.messages),
      selectedBotId: state.selectedBotId,
      collapsedGroups: state.collapsedGroups,
      infoPanelOpen: state.infoPanelOpen,
      sidebarCollapsed: state.sidebarCollapsed,
      sidebarWidth: state.sidebarWidth
    })
  }
)
)
