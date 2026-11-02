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
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/** Centered modal on a light, blurred scrim. Focus trap and Esc come from Radix. */
export function Dialog({ open, onOpenChange, title, description, children, footer, className }: DialogProps) {
  useOverlayLock(open)
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-ink/15 backdrop-blur-[2px]" />
        <RadixDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[min(88vh,760px)] w-[min(92vw,580px)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'animate-pop-in rounded-2xl border border-line bg-surface shadow-pop outline-none',
            className
          )}
        >
          <header className="flex items-start gap-3 px-6 pt-5 pb-4">
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="text-base font-semibold tracking-tight">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-0.5 text-ui text-ink-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <IconButton label="Close" size="sm" className="-mr-2">
                <X />
              </IconButton>
            </RadixDialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">{children}</div>
          {footer && (
            <footer className="flex items-center gap-2 rounded-b-2xl border-t border-line bg-canvas/60 px-6 py-3.5">
              {footer}
            </footer>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
