import { useMemo } from 'react'
import { ChevronRight, SearchX } from 'lucide-react'
import { cn } from '@/lib/cn'
import { botMatches, getBotStatus, lastMessage } from '@/lib/selectors'
import { useBotStore } from '@/store/botStore'
import { BotListItem } from './BotListItem'

export function BotList() {
  const groups = useBotStore((s) => s.groups)
  const bots = useBotStore((s) => s.bots)
  const accounts = useBotStore((s) => s.accounts)
  const messages = useBotStore((s) => s.messages)
  const typing = useBotStore((s) => s.typing)
  const search = useBotStore((s) => s.search)
  const collapsed = useBotStore((s) => s.collapsedGroups)
  const selectedBotId = useBotStore((s) => s.selectedBotId)
  const selectBot = useBotStore((s) => s.selectBot)
  const toggleGroup = useBotStore((s) => s.toggleGroup)

  const searching = search.trim().length > 0

  const sections = useMemo(
    () =>
      groups
        .map((group) => ({
          group,
          bots: bots.filter((b) => b.groupId === group.id && botMatches(b, search, accounts, group))
        }))
        // Hide empty groups only while searching, so new groups stay visible.
        .filter((section) => !searching || section.bots.length > 0),
    [groups, bots, accounts, search, searching]
  )

  if (searching && sections.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 pt-10 text-center text-ink-muted">
        <SearchX className="size-5" aria-hidden />
        <p className="text-ui">
          No bots match <span className="font-medium text-ink-secondary">“{search.trim()}”</span>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map(({ group, bots: groupBots }) => {
        const isCollapsed = !searching && collapsed[group.id] === true
        const listId = `group-${group.id}`
        return (
          <section key={group.id} aria-labelledby={`${listId}-label`}>
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={!isCollapsed}
              aria-controls={listId}
              disabled={searching}
              className="group flex h-6 w-full items-center gap-1 rounded-md px-1.5 text-caption font-semibold tracking-wide text-ink-muted uppercase hover:text-ink-secondary"
            >
              <ChevronRight
                aria-hidden
                className={cn('size-3.5 transition-transform duration-150', !isCollapsed && 'rotate-90')}
              />
              <span id={`${listId}-label`} className="truncate">
                {group.name}
              </span>
              <span className="ml-auto font-medium text-ink-faint tabular-nums">{groupBots.length}</span>
            </button>
            {!isCollapsed && (
              <ul id={listId} className="mt-0.5 flex flex-col gap-0.5">
                {groupBots.length === 0 ? (
                  <li className="px-3 py-1.5 text-caption text-ink-faint">No bots yet</li>
                ) : (
                  groupBots.map((bot) => (
                    <li key={bot.id}>
                      <BotListItem
                        bot={bot}
                        status={getBotStatus(bot, accounts)}
                        last={lastMessage(messages[bot.id])}
                        typing={typing[bot.id] === true}
                        selected={bot.id === selectedBotId}
                        onSelect={selectBot}
                      />
                    </li>
                  ))
                )}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
