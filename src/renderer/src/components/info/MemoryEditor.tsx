import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useBotStore } from '@/store/botStore'
import type { Bot } from '@/types'
import { t } from '@/lib/i18n'

/** Short facts the bot should remember. */
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
      {bot.memory.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 pt-0.5">
          {bot.memory.map((item) => (
            <li
              key={item.id}
              className="group inline-flex max-w-full animate-step-in items-center gap-0.5 rounded-md bg-hover py-0.5 pr-0.5 pl-2 text-[12px] leading-5 text-ink-secondary"
            >
              <span className="truncate">{item.text}</span>
              <button
                type="button"
                aria-label={`Forget “${item.text}”`}
                onClick={() => removeMemory(bot.id, item.id)}
                className="press-icon grid size-5 shrink-0 place-items-center rounded text-ink-muted hover:bg-active hover:text-ink"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('Add memory')}
          aria-label={t('Add memory')}
          className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted"
        />
        {draft.trim() && (
          <button
            type="submit"
            aria-label={t('Save memory')}
            className="press-icon grid size-6 animate-mark-pop place-items-center rounded-full bg-accent-600 text-white"
          >
            <Plus className="size-3.5" />
          </button>
        )}
      </form>
    </div>
  )
}
