import { useState, type KeyboardEvent } from 'react'
import { ChevronRight, FolderPlus, MoreHorizontal, Pencil, Settings2, Trash2 } from 'lucide-react'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { cn } from '@/lib/cn'
import { getBotStatus, lastMessage } from '@/lib/selectors'
import { useBotStore } from '@/store/botStore'
import type { BotGroup } from '@/types'
import { BotListItem } from './BotListItem'
import { ConfigureSectionsDialog } from './ConfigureSectionsDialog'

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

function SectionHeader({
  group,
  botCount,
  collapsed,
  onToggle
}: {
  group: BotGroup
  botCount: number
  collapsed: boolean
  onToggle: () => void
}) {
  const renameGroup = useBotStore((s) => s.renameGroup)
  const removeGroup = useBotStore((s) => s.removeGroup)
  const groups = useBotStore((s) => s.groups)
  const [renaming, setRenaming] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const only = groups.length <= 1
  const listId = `group-${group.id}`

  return (
    <div className="group/section relative flex h-7 items-center gap-0.5">
      {renaming ? (
        <div className="flex min-w-0 flex-1 items-center px-1.5">
          <InlineEdit
            value={group.name}
            label="Section name"
            maxLength={40}
            className="h-7 w-full text-[12px] font-medium"
            onCommit={(name) => renameGroup(group.id, name)}
            onDone={() => setRenaming(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={listId}
          className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md px-1.5 text-left text-ink-muted transition-colors hover:bg-hover hover:text-ink-secondary"
        >
          <ChevronRight
            aria-hidden
            className={cn('size-3.5 shrink-0 transition-transform duration-150', !collapsed && 'rotate-90')}
          />
          <span id={`${listId}-label`} className="truncate text-[12px] font-medium tracking-tight">
            {group.name || 'Unallocated'}
          </span>
          {botCount > 0 && (
            <span className="ml-auto shrink-0 pr-1 text-[11px] tabular-nums opacity-70">{botCount}</span>
          )}
        </button>
      )}

      {!renaming && (
        <Menu open={menuOpen} onOpenChange={setMenuOpen}>
          <MenuTrigger
            aria-label={`Section actions for ${group.name}`}
            className={cn(
              'press-icon grid size-7 shrink-0 place-items-center rounded-full text-ink-muted',
              'opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
              'hover:bg-hover hover:text-ink data-[state=open]:bg-hover'
            )}
          >
            <MoreHorizontal className="size-3.5" />
          </MenuTrigger>
          <MenuContent align="start" side="bottom" className="min-w-44">
            <MenuItem onSelect={() => setRenaming(true)}>
              <Pencil aria-hidden /> Rename
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              danger
              disabled={only}
              onSelect={() => {
                if (!only) removeGroup(group.id)
              }}
            >
              <Trash2 aria-hidden /> {only ? 'Keep one section' : 'Delete section'}
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
    </div>
  )
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
  const addGroup = useBotStore((s) => s.addGroup)
  const [configureOpen, setConfigureOpen] = useState(false)

  // Always-on Grok-like section chrome — include empty sections so New section is visible.
  const sections = groups.map((group) => ({
    group,
    bots: bots.filter((b) => b.groupId === group.id)
  }))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto" onKeyDown={moveBetweenRows}>
        <div className="flex flex-col gap-2 px-0 pt-0.5">
          {sections.map(({ group, bots: groupBots }) => {
            const isCollapsed = collapsed[group.id] === true
            const listId = `group-${group.id}`
            return (
              <section key={group.id} aria-labelledby={`${listId}-label`}>
                <SectionHeader
                  group={group}
                  botCount={groupBots.length}
                  collapsed={isCollapsed}
                  onToggle={() => toggleGroup(group.id)}
                />
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
      </div>

      <div className="mt-auto flex shrink-0 flex-col gap-0.5 border-t border-ink/[0.08] px-1 pt-2 pb-1">
        <button
          type="button"
          onClick={() => addGroup()}
          className="press flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12px] font-medium text-ink-muted transition-colors hover:bg-hover hover:text-ink-secondary"
        >
          <FolderPlus className="size-3.5" aria-hidden />
          New section
        </button>
        <button
          type="button"
          onClick={() => setConfigureOpen(true)}
          className="press flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[12px] font-medium text-ink-muted transition-colors hover:bg-hover hover:text-ink-secondary"
        >
          <Settings2 className="size-3.5" aria-hidden />
          Configure sections
        </button>
      </div>

      <ConfigureSectionsDialog open={configureOpen} onOpenChange={setConfigureOpen} />
    </div>
  )
}
