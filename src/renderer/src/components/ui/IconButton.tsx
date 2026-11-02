import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/cn'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label; also used as the native tooltip. */
  label: string
  active?: boolean
  size?: 'sm' | 'md'
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  label,
  active = false,
  size = 'md',
  className,
  children,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={cn(
        'no-drag inline-flex shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors',
        'hover:bg-surface-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'size-7 [&_svg]:size-4' : 'size-8 [&_svg]:size-[18px]',
        active && 'bg-accent-50 text-accent-600 hover:bg-accent-100 hover:text-accent-700',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
