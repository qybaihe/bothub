import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/cn'

const VARIANTS = {
  /** One per surface: send, create, save. */
  primary: 'bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-35',
  /** Soft pill on the hover tint — every other action. */
  secondary: 'bg-hover text-ink hover:bg-active disabled:opacity-35',
  ghost: 'text-ink-secondary hover:bg-hover hover:text-ink disabled:opacity-35',
  danger: 'text-status-error hover:bg-status-error/10 disabled:opacity-35',
  /** Destructive action waiting for a second click. */
  'danger-confirm': 'bg-status-error/10 text-status-error hover:bg-status-error/15'
} as const

const SIZES = {
  sm: 'h-7 gap-1.5 px-3 text-[12px] [&_svg]:size-3.5',
  md: 'h-9 gap-2 px-4 text-[14px] [&_svg]:size-4',
  lg: 'h-10 gap-2 px-5 text-[14px] [&_svg]:size-4'
} as const

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
  ref?: Ref<HTMLButtonElement>
}

/** Pill-shaped button; presses on the tap spring. */
export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'no-drag press inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  )
}
