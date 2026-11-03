import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/cn'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label; also used as the native tooltip. */
  label: string
  active?: boolean
  size?: 'sm' | 'md'
  /** Circular control like DeepSeek-Bot's .bt-round */
  round?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({
  label,
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
      title={label}
      aria-pressed={active || undefined}
      className={cn(
        'no-drag inline-flex shrink-0 items-center justify-center text-ink-muted transition-[background-color,color,transform] duration-150',
        'hover:bg-hover hover:text-ink active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40',
        round ? 'rounded-full' : 'rounded-lg',
        size === 'sm' ? 'size-7 [&_svg]:size-4' : round ? 'size-9 [&_svg]:size-[18px]' : 'size-8 [&_svg]:size-[18px]',
        active && 'bg-accent-50 text-accent-600 hover:bg-accent-100 hover:text-accent-700',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
