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
  /** Simplified-Chinese copy (our own wording). */
  zh?: { name: string; description: string; starter: string }
}

export const BLANK_TEMPLATE: BotTemplate = {
  id: 'blank',
  name: '',
  emoji: '🤖',
  description: 'Start from scratch',
  starter: '',
  zh: { name: '', description: '从零开始', starter: '' }
}

export const BOT_TEMPLATES: readonly BotTemplate[] = [
  BLANK_TEMPLATE,
  {
    id: 'daily-brief',
    name: 'Daily Brief',
    emoji: '☀️',
    description: 'Morning summary of what matters today',
    starter: 'Each morning, give me a short brief: my schedule, anything urgent, and three priorities for the day.',
    zh: { name: '每日简报', description: '每天早上汇总今天的要事', starter: '每天早上给我一份简短简报：今天的日程、紧急事项，以及当天最重要的三件事。' }
  },
  {
    id: 'research',
    name: 'Researcher',
    emoji: '🔎',
    description: 'Digs into a topic and cites sources',
    starter: 'When I give you a topic, research it, compare a few sources, and give me a concise summary with links.',
    zh: { name: '研究助手', description: '深入调研一个主题并注明来源', starter: '我给你一个主题时，请调研、对比几个来源，并给我一份带链接的简明总结。' }
  },
  {
    id: 'writer',
    name: 'Writing Partner',
    emoji: '✍️',
    description: 'Drafts and polishes posts, emails, notes',
    starter: 'Help me draft and tighten writing. Keep my voice, suggest a clearer structure, and offer one shorter version.',
    zh: { name: '写作搭档', description: '起草和润色帖子、邮件、笔记', starter: '帮我起草和精简文字：保留我的语气，建议更清晰的结构，并给出一个更短的版本。' }
  },
  {
    id: 'planner',
    name: 'Trip Planner',
    emoji: '🧳',
    description: 'Itineraries, bookings checklist, packing',
    starter: 'Help me plan trips: build a day-by-day itinerary, a booking checklist, and a packing list.',
    zh: { name: '旅行规划', description: '行程、预订清单与打包清单', starter: '帮我规划旅行：按天安排行程，列出预订清单和打包清单。' }
  },
  {
    id: 'inbox',
    name: 'Inbox Helper',
    emoji: '📬',
    description: 'Triage messages and draft replies',
    starter: 'Help me triage messages: sort by urgency, summarize threads, and draft replies for me to review before sending.',
    zh: { name: '收件箱助手', description: '分拣消息并起草回复', starter: '帮我分拣消息：按紧急程度排序、总结对话，并起草回复，发送前由我确认。' }
  },
  {
    id: 'coach',
    name: 'Habit Coach',
    emoji: '🌱',
    description: 'Check-ins and gentle accountability',
    starter: 'Be my habit coach: check in on my goals, keep it encouraging, and suggest one small next step.',
    zh: { name: '习惯教练', description: '定期打卡，温和督促', starter: '做我的习惯教练：关注我的目标进展，语气鼓励，并建议一个小的下一步。' }
  }
]

/** Template copy in the current UI language. */
export function localizeTemplate(t: BotTemplate, locale: 'zh' | 'en'): BotTemplate {
  return locale === 'zh' && t.zh ? { ...t, ...t.zh } : t
}
