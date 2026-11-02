import type { Bot, BotAccount, BotGroup, ChatMessage } from '@/types'

/**
 * Initial workspace. Real Muse mode starts empty so accounts come from
 * signing into muse.ai. Mock mode (`BOTHUB_USE_MOCK_MUSE=1`) still uses the
 * fixtures in meta-muse/mock.ts via a separate helper below.
 */
export interface SeedData {
  groups: BotGroup[]
  bots: Bot[]
  accounts: Record<string, BotAccount>
  messages: Record<string, ChatMessage[]>
}

export function createSeed(_now = Date.now()): SeedData {
  return {
    groups: [{ id: 'g-work', name: 'Workspace' }],
    bots: [],
    accounts: {},
    messages: {}
  }
}
