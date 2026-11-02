import type { PlatformDescriptor } from '@adapters/types'
import { cn } from '@/lib/cn'

interface PlatformGlyphProps {
  platform: PlatformDescriptor
  size?: 'sm' | 'md'
  className?: string
}

/** Monogram tile for a platform; accent-tinted when the platform is usable. */
export function PlatformGlyph({ platform, size = 'sm', className }: PlatformGlyphProps) {
  const available = platform.availability === 'available'
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center font-semibold tracking-tight',
        size === 'sm' ? 'size-5 rounded-md text-[10px]' : 'size-9 rounded-[10px] text-sm',
        available ? 'bg-accent-50 text-accent-700 ring-1 ring-accent-100' : 'bg-sunken text-ink-muted ring-1 ring-line',
        className
      )}
    >
      {platform.monogram}
    </span>
  )
}
