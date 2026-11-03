import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/cn'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label; also used as the native tooltip. */
  label: string
  /** Optional shortcut appended to the tooltip, e.g. "⌘K". */
  shortcut?: string
  active?: boolean
  size?: 'sm' | 'md'
  /** 36px circle with a hairline border (sidebar header actions). */
  round?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  label,
  shortcut,
  active = false,
  size = 'md',
  round = false,
  className,
  children,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active || undefined}
      className={cn(
        'no-drag press-icon inline-flex shrink-0 items-center justify-center rounded-full text-ink-secondary',
        'hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35',
        round
          ? 'size-9 border border-line bg-main text-ink [&_svg]:size-[18px]'
          : size === 'sm'
            ? 'size-7 [&_svg]:size-4'
            : 'size-8 [&_svg]:size-[18px]',
        active && 'bg-active text-ink hover:bg-active',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
