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
    name: 'Grok Bot',
    description: 'xAI / Cursor sand desktop bots via ConnectRPC (api2.cursor.sh).',
    availability: 'available',
    monogram: 'G',
    homeUrl: 'https://x.ai/bot',
    loginUrl: 'https://authenticator.cursor.sh'
  },
  {
    id: 'hark',
    name: 'Hark',
    description: 'Personal agent on hark.com — Google login + REST chat (preview; login flow still maturing).',
    availability: 'available',
    monogram: 'H',
    homeUrl: 'https://app.hark.com',
    loginUrl: 'https://app.hark.com/login'
  },
  {
    id: 'dot',
    name: 'Dot',
    description: 'OpenAI autonomous personal AI (chatgpt.com/dots) — Calpico Room + Celsius WS + gpt-6-astra.',
    availability: 'available',
    monogram: 'Do',
    homeUrl: 'https://chatgpt.com/dots',
    loginUrl: 'https://chatgpt.com/dots'
  }
]

export function getPlatform(id: PlatformId): PlatformDescriptor {
  const platform = PLATFORMS.find((p) => p.id === id)
  if (!platform) throw new Error(`Unknown platform: ${id}`)
  return platform
}
