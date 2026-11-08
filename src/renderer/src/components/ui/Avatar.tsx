import type { ConnectionStatus, PlatformId } from '@adapters/types'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'
import { GrokBotMark } from './GrokBotMark'
import { StatusDot } from './Status'

const BOT_SIZES = {
  xs: 'size-6 rounded-full text-xs',
  sm: 'size-7 rounded-full text-sm',
  md: 'size-9 rounded-full text-lg',
  lg: 'size-16 rounded-full text-[30px]',
  xl: 'size-[60px] rounded-full text-[30px]'
} as const

const BOT_PX: Record<keyof typeof BOT_SIZES, number> = {
  xs: 24,
  sm: 28,
  md: 36,
  lg: 64,
  xl: 60
}

const DOT_SIZES = {
  xs: 'size-2 ring-[1.5px]',
  sm: 'size-2 ring-[1.5px]',
  md: 'size-2.5 ring-[2px]',
  lg: 'size-3.5 ring-[2.5px]',
  xl: 'size-3.5 ring-[2.5px]'
} as const

interface BotAvatarProps {
  emoji?: string
  seed: string
  /** User photo; wins over the animated GrokBotMark character. */
  avatar?: string
  avatarShape?: string
  avatarColor?: string
  platformId?: PlatformId
  size?: keyof typeof BOT_SIZES
  status?: ConnectionStatus
  isWorking?: boolean
  gaze?: [number, number] | null
  followPointer?: boolean
  pokeSignal?: number
  /** Ring color around the status dot; should match the background behind it. */
  ringClassName?: string
  className?: string
}

export function BotAvatar({
  seed,
  avatar,
  avatarShape,
  avatarColor,
  size = 'md',
  status,
  isWorking,
  gaze,
  followPointer,
  pokeSignal,
  ringClassName = 'ring-surface',
  className
}: BotAvatarProps) {
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)}>
      {avatar ? (
        <img
          src={avatar}
          alt=""
          aria-hidden
          draggable={false}
          className={cn('object-cover ring-1 ring-line select-none', BOT_SIZES[size])}
        />
      ) : (
        <GrokBotMark
          seed={seed}
          shape={avatarShape}
          color={avatarColor}
          status={status}
          isWorking={isWorking}
          gaze={gaze}
          followPointer={followPointer}
          pokeSignal={pokeSignal}
          sizePx={BOT_PX[size]}
        />
      )}
      {status && status !== 'online' && (
        <StatusDot
          status={status}
          className={cn(
            'absolute -right-0.5 -bottom-0.5',
            DOT_SIZES[size],
            ringClassName,
            (status === 'busy' || isWorking) && 'animate-pulse'
          )}
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
