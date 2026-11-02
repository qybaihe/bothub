import { create } from 'zustand'
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

  selectBot: (botId: string) => void
  setSearch: (query: string) => void
  toggleGroup: (groupId: string) => void
  toggleInfoPanel: () => void
}

const seed = createSeed()

export const useBotStore = create<BotHubState>()((set) => ({
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

  toggleInfoPanel: () => set((state) => ({ infoPanelOpen: !state.infoPanelOpen }))
}))
