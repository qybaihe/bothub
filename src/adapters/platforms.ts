import type { PlatformDescriptor, PlatformId } from './types'

/**
 * Catalog of platforms shown in the UI. Only "available" platforms with a
 * registered adapter can be used to create bots; the rest render as
 * "coming soon".
 */
export const PLATFORMS: readonly PlatformDescriptor[] = [
  {
    id: 'meta-muse',
    name: 'Meta Muse',
    description: 'Personal agent on muse.ai — chat, connectors, and Sentinel approvals.',
    availability: 'available',
    monogram: 'M',
    homeUrl: 'https://muse.ai'
  },
  {
    id: 'grok',
    name: 'Grok',
    description: 'xAI assistant with real-time knowledge.',
    availability: 'coming-soon',
    monogram: 'G'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'Reasoning-focused chat models.',
    availability: 'coming-soon',
    monogram: 'D'
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    description: 'OpenAI conversational assistant.',
    availability: 'coming-soon',
    monogram: 'C'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Google multimodal assistant.',
    availability: 'coming-soon',
    monogram: 'Ge'
  }
]

export function getPlatform(id: PlatformId): PlatformDescriptor {
  const platform = PLATFORMS.find((p) => p.id === id)
  if (!platform) throw new Error(`Unknown platform: ${id}`)
  return platform
}
