import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useBotStore } from '@/store/botStore'
import type { Bot } from '@/types'

/** Short facts the bot should remember. */
export function MemoryEditor({ bot, compact = false }: { bot: Bot; compact?: boolean }) {
  const addMemory = useBotStore((s) => s.addMemory)
  const removeMemory = useBotStore((s) => s.removeMemory)
  const [draft, setDraft] = useState('')

  const submit = () => {
    if (!draft.trim()) return
    addMemory(bot.id, draft)
    setDraft('')
  }

  return (
    <div className={cn('flex flex-col', compact ? 'gap-1.5' : 'gap-2')}>
      {bot.memory.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {bot.memory.map((item) => (
            <li
              key={item.id}
              className="group inline-flex max-w-full items-center gap-1 rounded-lg bg-hover py-1 pr-1 pl-2 text-[12px] text-ink-secondary"
            >
              <span className="truncate">{item.text}</span>
              <button
                type="button"
                aria-label={`Forget “${item.text}”`}
                onClick={() => removeMemory(bot.id, item.id)}
                className="grid size-4 shrink-0 place-items-center rounded text-ink-faint hover:bg-sunken hover:text-ink"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-ink-muted">No entries yet</p>
      )}
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add memory"
          aria-label="Add memory"
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-main px-2 text-[12px] text-ink outline-none placeholder:text-ink-muted focus:border-accent-300"
        />
        <button
          type="submit"
          aria-label="Add memory"
          disabled={!draft.trim()}
          className="grid size-7 place-items-center rounded-md text-ink-muted hover:bg-hover hover:text-ink disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
      </form>
    </div>
  )
}
