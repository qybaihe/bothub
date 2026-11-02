import type { ComponentProps } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/cn'

/** Thin styling layer over Radix DropdownMenu. */
export const Menu = DropdownMenu.Root
export const MenuTrigger = DropdownMenu.Trigger

export function MenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-56 animate-pop-in rounded-xl border border-line bg-surface p-1 shadow-pop outline-none',
          className
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  )
}

export function MenuItem({ className, ...props }: ComponentProps<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex cursor-default items-center gap-2.5 rounded-lg px-2 py-1.5 text-ui text-ink outline-none select-none',
        'data-[disabled]:opacity-50 data-[highlighted]:bg-surface-hover',
        className
      )}
      {...props}
    />
  )
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn('px-2 pt-1.5 pb-1 text-caption font-medium text-ink-muted', className)}
      {...props}
    />
  )
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn('my-1 h-px bg-line', className)} {...props} />
}
