import type { PlatformDescriptor } from '@adapters/types'
import { cn } from '@/lib/cn'
import { platformIcon } from '@/lib/platformIcons'

interface PlatformGlyphProps {
  platform: PlatformDescriptor
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZES = {
  sm: 'size-5 rounded-md text-[10px]',
  md: 'size-9 rounded-[10px] text-sm',
  lg: 'size-14 rounded-2xl text-lg'
} as const

/** Monogram tile for a platform; accent-tinted when the platform is usable. */
export function PlatformGlyph({ platform, size = 'sm', className }: PlatformGlyphProps) {
  const available = platform.availability === 'available'
  const icon = platformIcon(platform.id)
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        aria-hidden
        draggable={false}
        className={cn(
          'shrink-0 object-cover ring-1 ring-line',
          SIZES[size],
          !available && 'opacity-70',
          className
        )}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center font-semibold tracking-tight',
        SIZES[size],
        available ? 'bg-accent-50 text-accent-700 ring-1 ring-accent-100' : 'bg-sunken text-ink-muted ring-1 ring-line',
        className
      )}
    >
      {platform.monogram}
    </span>
  )
}
