import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

interface InlineEditProps {
  value: string
  onCommit: (value: string) => void
  /** Called after saving or cancelling. */
  onDone: () => void
  label: string
  maxLength?: number
  className?: string
}

/** Text field that replaces a label in place: Enter or blur saves, Esc cancels. */
export function InlineEdit({ value, onCommit, onDone, label, maxLength = 40, className }: InlineEditProps) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  const settled = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const finish = (save: boolean) => {
    if (settled.current) return
    settled.current = true
    if (save && draft.trim() && draft.trim() !== value) onCommit(draft)
    onDone()
  }

  return (
    <input
      ref={ref}
      value={draft}
      maxLength={maxLength}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === 'Enter') finish(true)
        else if (event.key === 'Escape') {
          event.stopPropagation()
          finish(false)
        }
      }}
      className={cn(
        'h-7 w-full min-w-0 rounded-md border border-accent-600 bg-surface px-1.5 text-ink ring-3 ring-accent-100 outline-none',
        className
      )}
    />
  )
}
