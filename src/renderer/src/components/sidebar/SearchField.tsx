import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
  onEscape?: () => void
}

export function SearchField({ value, onChange, autoFocus, onEscape }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [autoFocus])

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
    <label className="group relative flex h-9 items-center rounded-full border border-line bg-surface px-1 shadow-soft transition-colors focus-within:border-accent-300 focus-within:ring-3 focus-within:ring-accent-100">
      <Search aria-hidden className="pointer-events-none absolute left-3 size-3.5 text-ink-muted" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            onChange('')
            onEscape?.()
            event.currentTarget.blur()
          }
        }}
        placeholder="Search"
        aria-label="Search bots or accounts"
        className="h-full w-full bg-transparent pr-9 pl-9 text-ui text-ink outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('')
            inputRef.current?.focus()
          }}
          className="absolute right-1.5 grid size-6 place-items-center rounded-full text-ink-muted hover:bg-hover hover:text-ink"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </label>
  )
}
