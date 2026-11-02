import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { runtimePlatform } from '@/lib/bridge'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
}

const isMacLike = runtimePlatform === 'darwin' || /Mac/i.test(navigator.platform)

export function SearchField({ value, onChange }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K focuses the search field from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <label className="group relative flex h-8 items-center rounded-lg border border-line bg-surface shadow-soft transition-colors focus-within:border-accent-300 focus-within:ring-3 focus-within:ring-accent-100">
      <Search aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-ink-muted" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onChange('')
            event.currentTarget.blur()
          }
        }}
        placeholder="Search bots or accounts"
        aria-label="Search bots or accounts"
        className="h-full w-full bg-transparent pr-12 pl-8 text-ui text-ink outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('')
            inputRef.current?.focus()
          }}
          className="absolute right-1.5 grid size-5 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2 rounded border border-line bg-canvas px-1 font-sans text-[10px] leading-4 font-medium text-ink-muted">
          {isMacLike ? '⌘K' : 'Ctrl K'}
        </kbd>
      )}
    </label>
  )
}
