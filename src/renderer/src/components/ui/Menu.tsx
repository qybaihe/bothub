import { useState, type ComponentProps, type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/cn'
import { useOverlayLock } from '@/lib/overlay'

/**
 * Thin styling layer over Radix DropdownMenu: arrow keys, typeahead and Esc
 * come from Radix; menus pop in on the tap spring and fade out in .12s.
 */
export function Menu({ onOpenChange, open: openProp, ...props }: ComponentProps<typeof DropdownMenu.Root>) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  useOverlayLock(open)
  return (
    <DropdownMenu.Root
      {...props}
      open={open}
      onOpenChange={(next) => {
        setOpenState(next)
        onOpenChange?.(next)
      }}
    />
  )
}
export const MenuTrigger = DropdownMenu.Trigger

export const MENU_SURFACE =
  'rounded-xl border-[0.5px] border-line-strong bg-main p-1.5 shadow-pop outline-none'

export function MenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={sideOffset}
        className={cn(
          'no-drag z-50 flex min-w-52 flex-col gap-0.5 origin-(--radix-dropdown-menu-content-transform-origin)',
          MENU_SURFACE,
          'data-[side=bottom]:animate-pop-drop data-[side=top]:animate-pop-lift data-[state=closed]:animate-pop-out',
          className
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  )
}

export function MenuItem({
  className,
  danger,
  hint,
  children,
  ...props
}: ComponentProps<typeof DropdownMenu.Item> & { danger?: boolean; hint?: ReactNode }) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex min-h-[30px] cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] leading-[18px] text-ink outline-none select-none',
        'transition-colors duration-100 data-[disabled]:opacity-35 data-[highlighted]:bg-hover',
        '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-secondary',
        danger && 'text-status-error [&_svg]:text-status-error',
        className
      )}
      {...props}
    >
      {children}
      {hint ? <span className="ml-auto pl-4 text-[12px] text-ink-muted tabular-nums">{hint}</span> : null}
    </DropdownMenu.Item>
  )
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      className={cn('px-2 pt-1 pb-1 text-[12px] text-ink-muted', className)}
      {...props}
    />
  )
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn('mx-2 my-1 h-[0.5px] shrink-0 bg-line-strong', className)} {...props} />
}
