/**
 * Local starter templates for new bots (Grok Bot "Bot templates"-style gallery).
 * Written for BotHub — not copied from Grok Bot. Muse has no persona/instructions
 * write RPC, so `starter` is stored in the bot's local Notes and shown as a
 * suggested first message; nothing is pushed to the Muse agent automatically.
 */
export interface BotTemplate {
  id: string
  name: string
  emoji: string
  description: string
  /** Suggested first message / working brief. Empty for Blank. */
  starter: string
}

export const BLANK_TEMPLATE: BotTemplate = {
  id: 'blank',
  name: '',
  emoji: '🤖',
  description: 'Start from scratch',
  starter: ''
}

export const BOT_TEMPLATES: readonly BotTemplate[] = [
  BLANK_TEMPLATE,
  {
    id: 'daily-brief',
    name: 'Daily Brief',
    emoji: '☀️',
    description: 'Morning summary of what matters today',
    starter: 'Each morning, give me a short brief: my schedule, anything urgent, and three priorities for the day.'
  },
  {
    id: 'research',
    name: 'Researcher',
    emoji: '🔎',
    description: 'Digs into a topic and cites sources',
    starter: 'When I give you a topic, research it, compare a few sources, and give me a concise summary with links.'
  },
  {
    id: 'writer',
    name: 'Writing Partner',
    emoji: '✍️',
    description: 'Drafts and polishes posts, emails, notes',
    starter: 'Help me draft and tighten writing. Keep my voice, suggest a clearer structure, and offer one shorter version.'
  },
  {
    id: 'planner',
    name: 'Trip Planner',
    emoji: '🧳',
    description: 'Itineraries, bookings checklist, packing',
    starter: 'Help me plan trips: build a day-by-day itinerary, a booking checklist, and a packing list.'
  },
  {
    id: 'inbox',
    name: 'Inbox Helper',
    emoji: '📬',
    description: 'Triage messages and draft replies',
    starter: 'Help me triage messages: sort by urgency, summarize threads, and draft replies for me to review before sending.'
  },
  {
    id: 'coach',
    name: 'Habit Coach',
    emoji: '🌱',
    description: 'Check-ins and gentle accountability',
    starter: 'Be my habit coach: check in on my goals, keep it encouraging, and suggest one small next step.'
  }
]
