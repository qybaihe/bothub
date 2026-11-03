import type { ConnectionStatus } from '@adapters/types'
import type { PlatformId } from '@adapters/types'
import { cn } from '@/lib/cn'
import { platformIcon } from '@/lib/platformIcons'
import { initials } from '@/lib/format'
import { StatusDot } from './Status'

/** Soft tints for bot tiles; content colors, not brand colors. */
const TINTS = ['#f0efff', '#eaf5ef', '#fdf2e4', '#ebf2fb', '#fbedf1', '#f1f1f4', '#eef6f6']

function tintFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 33 + seed.charCodeAt(i)) >>> 0
  return TINTS[hash % TINTS.length]!
}

const BOT_SIZES = {
  sm: 'size-7 rounded-full text-sm',
  md: 'size-9 rounded-full text-lg',
  lg: 'size-16 rounded-full text-[30px]',
  xl: 'size-12 rounded-[14px] text-[22px]'
} as const

const DOT_SIZES = {
  sm: 'size-2 ring-[1.5px]',
  md: 'size-2.5 ring-2',
  lg: 'size-3.5 ring-[3px]',
  xl: 'size-3 ring-[2.5px]'
} as const

interface BotAvatarProps {
  emoji: string
  seed: string
  /** When the platform has an official mark, it replaces the emoji tile. */
  platformId?: PlatformId
  size?: keyof typeof BOT_SIZES
  status?: ConnectionStatus
  /** Ring color around the status dot; should match the background behind it. */
  ringClassName?: string
  className?: string
}

export function BotAvatar({
  emoji,
  seed,
  platformId,
  size = 'md',
  status,
  ringClassName = 'ring-surface',
  className
}: BotAvatarProps) {
  const icon = platformIcon(platformId)
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {icon ? (
        <img
          src={icon}
          alt=""
          aria-hidden
          draggable={false}
          className={cn('object-cover ring-1 ring-line select-none', BOT_SIZES[size])}
        />
      ) : (
        <span
          aria-hidden
          className={cn('grid place-items-center leading-none shadow-hairline select-none', BOT_SIZES[size])}
          style={{ backgroundColor: tintFor(seed) }}
        >
          {emoji}
        </span>
      )}
      {status && (
        <StatusDot
          status={status}
          className={cn('absolute -right-0.5 -bottom-0.5', DOT_SIZES[size], ringClassName)}
        />
      )}
    </span>
  )
}

const ACCOUNT_SIZES = {
  xs: 'size-5 text-[9px]',
  sm: 'size-7 text-[10px]',
  md: 'size-8 text-[11px]'
} as const

interface AccountAvatarProps {
  name: string
  size?: keyof typeof ACCOUNT_SIZES
  status?: ConnectionStatus
  ringClassName?: string
  className?: string
}

export function AccountAvatar({
  name,
  size = 'sm',
  status,
  ringClassName = 'ring-surface',
  className
}: AccountAvatarProps) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        aria-hidden
        className={cn(
          'grid place-items-center rounded-full bg-sunken font-semibold tracking-wide text-ink-secondary ring-1 ring-line select-none',
          ACCOUNT_SIZES[size]
        )}
      >
        {initials(name)}
      </span>
      {status && (
        <StatusDot
          status={status}
          className={cn('absolute -right-px -bottom-px size-2 ring-2', ringClassName)}
        />
      )}
    </span>
  )
}
