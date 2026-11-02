import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useBotStore } from '@/store/botStore'
import type { Bot } from '@/types'

/** Short facts the bot should remember, plus free-form notes. */
export function MemoryEditor({ bot }: { bot: Bot }) {
  const addMemory = useBotStore((s) => s.addMemory)
  const removeMemory = useBotStore((s) => s.removeMemory)
  const [draft, setDraft] = useState('')

  const submit = () => {
    if (!draft.trim()) return
    addMemory(bot.id, draft)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2">
      {bot.memory.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {bot.memory.map((item) => (
            <li
              key={item.id}
              className="group inline-flex max-w-full items-center gap-1 rounded-lg border border-line bg-canvas py-1 pr-1 pl-2 text-caption text-ink-secondary"
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
        <p className="text-caption text-ink-muted">Nothing remembered yet.</p>
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
          placeholder="Add something to remember"
          aria-label="Add memory"
          className="h-7 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-caption text-ink outline-none placeholder:text-ink-muted focus:border-accent-300 focus:ring-3 focus:ring-accent-100"
        />
        <button
          type="submit"
          aria-label="Add memory"
          disabled={!draft.trim()}
          className="grid size-7 place-items-center rounded-md border border-line text-ink-muted hover:bg-surface-hover hover:text-ink disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
      </form>
    </div>
  )
}
