import type { ReactNode } from 'react'
import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useOverlayLock } from '@/lib/overlay'
import { IconButton } from './IconButton'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Screen-reader description; shown only when `showDescription` is set. */
  description?: string
  showDescription?: boolean
  /** Rendered left of the title, e.g. a back button. */
  headerStart?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** Keep focus where it is when the dialog opens (the body focuses its own field). */
  onOpenAutoFocus?: (event: Event) => void
  /** Prevent the default to send focus somewhere other than the trigger. */
  onCloseAutoFocus?: (event: Event) => void
}

/**
 * Centered modal. Rises on the shape spring and sinks out in .16s; Radix keeps
 * it mounted until the exit animation ends. Esc, the scrim and the close
 * button all dismiss it.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  showDescription = false,
  headerStart,
  children,
  footer,
  className,
  onOpenAutoFocus,
  onCloseAutoFocus
}: DialogProps) {
  useOverlayLock(open)
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="no-drag fixed inset-0 z-40 bg-black/25 data-[state=closed]:animate-scrim-out data-[state=open]:animate-scrim-in" />
        <RadixDialog.Content
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            'no-drag fixed top-1/2 left-1/2 z-50 flex max-h-[min(88vh,760px)] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-2xl border-[0.5px] border-line-strong bg-main shadow-dialog outline-none',
            'data-[state=closed]:animate-dialog-sink data-[state=open]:animate-dialog-rise',
            className
          )}
        >
          <header className="flex h-14 shrink-0 items-center gap-1 px-4">
            {headerStart}
            <RadixDialog.Title className="min-w-0 flex-1 truncate px-1 text-[15px] leading-5 font-semibold tracking-tight">
              {title}
            </RadixDialog.Title>
            <RadixDialog.Close asChild>
              <IconButton label="Close" size="sm" className="-mr-1">
                <X />
              </IconButton>
            </RadixDialog.Close>
          </header>
          <RadixDialog.Description className={showDescription ? 'px-5 pb-3 text-[13px] text-ink-secondary' : 'sr-only'}>
            {description ?? title}
          </RadixDialog.Description>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {footer && <footer className="flex shrink-0 items-center justify-end gap-2 px-5 pb-5">{footer}</footer>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
