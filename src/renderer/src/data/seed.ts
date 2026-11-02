import { META_MUSE_MOCK_ACCOUNTS } from '@adapters/meta-muse/mock'
import type { Bot, BotAccount, BotGroup, ChatMessage } from '@/types'

/**
 * Mock workspace used until real persistence exists. Accounts come from the
 * Meta Muse mock adapter so statuses shown in the UI match what the adapter
 * reports.
 */
export interface SeedData {
  groups: BotGroup[]
  bots: Bot[]
  accounts: Record<string, BotAccount>
  messages: Record<string, ChatMessage[]>
}

const MIN = 60 * 1000
const HOUR = 60 * MIN

type SeedMessage = [role: ChatMessage['role'], minutesAgo: number, text: string, accountId?: string]

export function createSeed(now = Date.now()): SeedData {
  const accounts: Record<string, BotAccount> = {}
  for (const { initialStatus, ...account } of META_MUSE_MOCK_ACCOUNTS) {
    accounts[account.id] = {
      ...account,
      status: initialStatus,
      statusDetail: initialStatus === 'error' ? 'Session expired. Sign in again to resume.' : undefined
    }
  }

  const groups: BotGroup[] = [
    { id: 'g-work', name: 'Workspace' },
    { id: 'g-research', name: 'Research' },
    { id: 'g-personal', name: 'Personal' }
  ]

  const bot = (b: Omit<Bot, 'platformId' | 'memory' | 'notes' | 'unread'> & Partial<Bot>): Bot => ({
    platformId: 'meta-muse',
    memory: [],
    notes: '',
    unread: 0,
    ...b
  })

  const bots: Bot[] = [
    bot({
      id: 'b-writer',
      name: 'Muse Writer',
      emoji: '✍️',
      description: 'Long-form drafts, edits, and tone polishing for the studio blog.',
      groupId: 'g-work',
      accountIds: ['mm-alex', 'mm-studio'],
      activeAccountId: 'mm-alex',
      createdAt: now - 41 * 24 * HOUR,
      notes: 'House style: short paragraphs, active voice, no exclamation marks.',
      memory: [
        { id: 'm1', text: 'Audience: indie product teams', createdAt: now - 20 * 24 * HOUR },
        { id: 'm2', text: 'Prefers British spelling', createdAt: now - 12 * 24 * HOUR },
        { id: 'm3', text: 'Launch date: Nov 14', createdAt: now - 2 * 24 * HOUR }
      ]
    }),
    bot({
      id: 'b-campaign',
      name: 'Campaign Planner',
      emoji: '📣',
      description: 'Plans multi-channel launch campaigns and content calendars.',
      groupId: 'g-work',
      accountIds: ['mm-growth'],
      activeAccountId: 'mm-growth',
      createdAt: now - 18 * 24 * HOUR,
      unread: 2,
      memory: [{ id: 'm4', text: 'Budget cap: $12k / quarter', createdAt: now - 5 * 24 * HOUR }]
    }),
    bot({
      id: 'b-support',
      name: 'Support Drafts',
      emoji: '💬',
      description: 'Drafts friendly, accurate replies to customer tickets.',
      groupId: 'g-work',
      accountIds: ['mm-sam', 'mm-alex'],
      activeAccountId: 'mm-sam',
      createdAt: now - 9 * 24 * HOUR
    }),
    bot({
      id: 'b-scout',
      name: 'Research Scout',
      emoji: '🔭',
      description: 'Finds and compares sources on emerging tools and markets.',
      groupId: 'g-research',
      accountIds: ['mm-lab', 'mm-sam'],
      activeAccountId: 'mm-lab',
      createdAt: now - 30 * 24 * HOUR,
      unread: 1,
      notes: 'Always cite at least two independent sources.'
    }),
    bot({
      id: 'b-digest',
      name: 'Paper Digest',
      emoji: '📚',
      description: 'Weekly digest of papers saved to the reading list.',
      groupId: 'g-research',
      accountIds: ['mm-archive'],
      activeAccountId: 'mm-archive',
      createdAt: now - 64 * 24 * HOUR
    }),
    bot({
      id: 'b-travel',
      name: 'Travel Buddy',
      emoji: '🧭',
      description: 'Trip ideas, itineraries, and packing lists.',
      groupId: 'g-personal',
      accountIds: ['mm-personal'],
      activeAccountId: 'mm-personal',
      createdAt: now - 3 * 24 * HOUR,
      memory: [{ id: 'm5', text: 'Vegetarian, prefers trains over flights', createdAt: now - 3 * 24 * HOUR }]
    }),
    bot({
      id: 'b-recipes',
      name: 'Recipe Muse',
      emoji: '🍋',
      description: 'Weeknight recipes from whatever is in the fridge.',
      groupId: 'g-personal',
      accountIds: ['mm-personal', 'mm-alex'],
      activeAccountId: 'mm-alex',
      createdAt: now - 6 * 24 * HOUR
    })
  ]

  const threads: Record<string, SeedMessage[]> = {
    'b-writer': [
      ['user', 26 * HOUR / MIN, 'Can you outline a launch post for the new collaboration features?'],
      ['bot', 26 * HOUR / MIN - 1, 'Sure. Proposed outline:\n\n1. The problem: feedback scattered across tools\n2. What’s new: shared canvases, inline comments, presence\n3. A short customer story\n4. How to try it today'],
      ['user', 42, 'Love it. Tighten the intro — two sentences max.', 'mm-studio'],
      ['bot', 41, 'Teams lose hours chasing feedback across five different tools. Today, every comment, cursor, and decision lives on one shared canvas.', 'mm-studio'],
      ['user', 6, 'Great. Now a subject line for the newsletter?'],
      ['bot', 5, 'A few options:\n\n• One canvas. Every comment.\n• Feedback, finally in one place\n• Meet your team’s new shared canvas']
    ],
    'b-campaign': [
      ['user', 3 * HOUR / MIN, 'Draft a two-week calendar for the November launch.'],
      ['bot', 3 * HOUR / MIN - 2, 'Week 1 focuses on teasers (Mon/Wed/Fri social, Thu newsletter). Week 2 is launch: blog + email on Tuesday, webinar Thursday, recap Friday.'],
      ['bot', 18, 'I also drafted copy for the Tuesday email. Want to review it here or in the doc?'],
      ['bot', 17, 'Heads up: the webinar slot overlaps with a holiday in two of your target regions.']
    ],
    'b-support': [
      ['user', 2 * 24 * HOUR / MIN, 'Customer says exports time out on large boards. Draft a reply.'],
      ['bot', 2 * 24 * HOUR / MIN - 1, 'Hi Jordan — thanks for flagging this. Large boards can hit our export limit; splitting the board or exporting by section works today, and we’re shipping a fix next week. I’ll follow up as soon as it’s live.']
    ],
    'b-scout': [
      ['user', 5 * HOUR / MIN, 'Compare the top three whiteboard tools for enterprise SSO.'],
      ['bot', 5 * HOUR / MIN - 3, 'All three support SAML SSO. Differences are in SCIM provisioning (two of three), audit logs (one includes them on the base plan), and data residency (only one offers EU hosting).'],
      ['bot', 34, 'Found a newer pricing page for the third vendor — SCIM is now included. Updated comparison ready.', 'mm-sam']
    ],
    'b-digest': [
      ['bot', 4 * 24 * HOUR / MIN, 'This week: 6 new papers. Highlights — efficient long-context attention, a benchmark for tool-using agents, and a survey on retrieval evaluation.']
    ],
    'b-travel': [
      ['user', 3 * 24 * HOUR / MIN, 'Three-day Lisbon itinerary, mostly on foot?'],
      ['bot', 3 * 24 * HOUR / MIN - 1, 'Day 1: Alfama and the castle. Day 2: Belém by tram, back via LX Factory. Day 3: Chiado, Bairro Alto, and sunset at Miradouro de Santa Catarina.']
    ],
    'b-recipes': []
  }

  const messages: Record<string, ChatMessage[]> = {}
  for (const b of bots) {
    messages[b.id] = (threads[b.id] ?? []).map(([role, minutesAgo, text, accountId], index) => ({
      id: `seed-${b.id}-${index}`,
      botId: b.id,
      accountId: accountId ?? b.activeAccountId,
      role,
      text,
      createdAt: now - minutesAgo * MIN,
      delivery: role === 'user' ? 'sent' : undefined
    }))
  }

  return { groups, bots, accounts, messages }
}
