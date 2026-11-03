import type { KeyboardEvent } from 'react'
import { getBotStatus, lastMessage } from '@/lib/selectors'
import { useBotStore } from '@/store/botStore'
import { BotListItem } from './BotListItem'

/** ↑/↓ move between rows; Enter opens the focused one. */
function moveBetweenRows(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  if (event.altKey || event.metaKey || event.ctrlKey) return
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-bot-row]')]
  const index = rows.findIndex((row) => row === document.activeElement)
  if (index < 0) return
  const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)]
  if (next) {
    event.preventDefault()
    next.focus()
  }
}

export function BotList() {
  const groups = useBotStore((s) => s.groups)
  const bots = useBotStore((s) => s.bots)
  const accounts = useBotStore((s) => s.accounts)
  const messages = useBotStore((s) => s.messages)
  const typing = useBotStore((s) => s.typing)
  const activity = useBotStore((s) => s.activity)
  const collapsed = useBotStore((s) => s.collapsedGroups)
  const selectedBotId = useBotStore((s) => s.selectedBotId)
  const selectBot = useBotStore((s) => s.selectBot)
  const toggleGroup = useBotStore((s) => s.toggleGroup)

  const sections = groups
    .map((group) => ({ group, bots: bots.filter((b) => b.groupId === group.id) }))
    .filter((section) => section.bots.length > 0)
  const showHeaders = sections.length > 1

  return (
    <div className="flex flex-col gap-2" onKeyDown={moveBetweenRows}>
      {sections.map(({ group, bots: groupBots }) => {
        const isCollapsed = showHeaders && collapsed[group.id] === true
        const listId = `group-${group.id}`
        return (
          <section key={group.id} aria-labelledby={showHeaders ? `${listId}-label` : undefined}>
            {showHeaders && (
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!isCollapsed}
                aria-controls={listId}
                className="flex h-7 w-full items-center rounded-md px-2 text-[12px] text-ink-muted transition-colors hover:text-ink-secondary"
              >
                <span id={`${listId}-label`} className="truncate">
                  {group.name}
                </span>
              </button>
            )}
            {!isCollapsed && (
              <ul id={listId} className="flex flex-col gap-0.5">
                {groupBots.map((bot) => (
                  <li key={bot.id}>
                    <BotListItem
                      bot={bot}
                      status={getBotStatus(bot, accounts)}
                      last={lastMessage(messages[bot.id])}
                      typing={typing[bot.id] === true}
                      activity={activity[bot.activeAccountId]}
                      selected={bot.id === selectedBotId}
                      onSelect={selectBot}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
