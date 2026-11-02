import { create } from 'zustand'
import { adapterRegistry } from '@adapters/registry'
import type { AttachmentMeta, ConnectionStatus, IncomingMessage } from '@adapters/types'
import { createId } from '@shared/id'
import { createSeed } from '@/data/seed'
import type { Bot, BotAccount, BotGroup, ChatMessage } from '@/types'

export interface BotHubState {
  groups: BotGroup[]
  bots: Bot[]
  accounts: Record<string, BotAccount>
  /** Conversation per bot, keyed by bot id. */
  messages: Record<string, ChatMessage[]>
  /** Bot ids whose reply is currently being generated. */
  typing: Record<string, boolean>
  selectedBotId: string | null
  search: string
  collapsedGroups: Record<string, boolean>
  infoPanelOpen: boolean

  // Navigation & layout
  selectBot: (botId: string) => void
  setSearch: (query: string) => void
  toggleGroup: (groupId: string) => void
  toggleInfoPanel: () => void

  // Conversation
  sendMessage: (botId: string, text: string, attachments?: AttachmentMeta[]) => Promise<void>
  retryMessage: (botId: string, messageId: string) => Promise<void>
  receiveMessage: (message: IncomingMessage) => void
  setTyping: (botId: string, isTyping: boolean) => void

  // Bot details
  updateNotes: (botId: string, notes: string) => void
  addMemory: (botId: string, text: string) => void
  removeMemory: (botId: string, memoryId: string) => void

  // Accounts
  removeAccountFromBot: (botId: string, accountId: string) => void
  setActiveAccount: (botId: string, accountId: string) => void
  setAccountStatus: (accountId: string, status: ConnectionStatus, detail?: string) => void
  connectAccount: (accountId: string) => Promise<void>
  disconnectAccount: (accountId: string) => Promise<void>
}

const seed = createSeed()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export const useBotStore = create<BotHubState>()((set, get) => {
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
    search: '',
    collapsedGroups: {},
    infoPanelOpen: true,

    selectBot: (botId) =>
      set((state) => ({
        selectedBotId: botId,
        bots: state.bots.map((b) => (b.id === botId && b.unread > 0 ? { ...b, unread: 0 } : b))
      })),

    setSearch: (query) => set({ search: query }),

    toggleGroup: (groupId) =>
      set((state) => ({
        collapsedGroups: { ...state.collapsedGroups, [groupId]: !state.collapsedGroups[groupId] }
      })),

    toggleInfoPanel: () => set((state) => ({ infoPanelOpen: !state.infoPanelOpen })),

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
        const message: ChatMessage = {
          id: incoming.id,
          botId,
          accountId: incoming.accountId,
          role: 'bot',
          text: incoming.text,
          createdAt: incoming.createdAt
        }
        return {
          messages: { ...state.messages, [botId]: [...(state.messages[botId] ?? []), message] },
          bots:
            state.selectedBotId === botId
              ? state.bots
              : state.bots.map((b) => (b.id === botId ? { ...b, unread: b.unread + 1 } : b))
        }
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
      set((state) => ({
        bots: state.bots.map((b) =>
          b.id === botId && b.accountIds.includes(accountId) ? { ...b, activeAccountId: accountId } : b
        )
      })),

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
})
