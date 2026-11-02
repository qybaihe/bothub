import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/cn'

const VARIANTS = {
  primary:
    'bg-accent-600 text-white shadow-soft hover:bg-accent-700 disabled:bg-accent-300 disabled:shadow-none',
  secondary:
    'border border-line-strong bg-surface text-ink shadow-soft hover:bg-surface-hover disabled:text-ink-faint',
  ghost: 'text-ink-secondary hover:bg-surface-hover hover:text-ink disabled:text-ink-faint',
  danger: 'text-status-error-ink hover:bg-status-error/10'
} as const

const SIZES = {
  sm: 'h-7 gap-1.5 rounded-md px-2.5 text-caption [&_svg]:size-3.5',
  md: 'h-8 gap-2 rounded-lg px-3 text-ui [&_svg]:size-4',
  lg: 'h-9 gap-2 rounded-lg px-3.5 text-ui [&_svg]:size-4'
} as const

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS
  size?: keyof typeof SIZES
  ref?: Ref<HTMLButtonElement>
}

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
        'no-drag inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    />
  )
}
