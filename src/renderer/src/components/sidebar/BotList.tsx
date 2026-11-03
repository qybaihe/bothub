import { useMemo } from 'react'
import { SearchX } from 'lucide-react'
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
        .filter((section) => !searching || section.bots.length > 0),
    [groups, bots, accounts, search, searching]
  )

  if (searching && sections.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 pt-10 text-center text-ink-muted">
        <SearchX className="size-5" aria-hidden />
        <p className="text-ui">No matches</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {sections.map(({ group, bots: groupBots }) => {
        const isCollapsed = !searching && collapsed[group.id] === true
        const listId = `group-${group.id}`
        const hideHeader = groups.length === 1 && !searching
        return (
          <section key={group.id} aria-labelledby={hideHeader ? undefined : `${listId}-label`}>
            {!hideHeader && (
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!isCollapsed}
                aria-controls={listId}
                disabled={searching}
                className="flex h-7 w-full items-center rounded-md px-2 text-[12px] font-medium text-ink-muted hover:text-ink-secondary"
              >
                <span id={`${listId}-label`} className="truncate">
                  {group.name}
                </span>
              </button>
            )}
            {!isCollapsed && (
              <ul id={listId} className="flex flex-col gap-0.5">
                {groupBots.length === 0 ? (
                  <li className="px-3 py-2 text-[13px] text-ink-faint">No bots yet</li>
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
