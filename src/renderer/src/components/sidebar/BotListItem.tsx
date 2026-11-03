import { memo, useRef, useState } from 'react'
import type { ConnectionStatus } from '@adapters/types'
import { FolderInput, ImageMinus, ImagePlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { BotAvatar } from '@/components/ui/Avatar'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { avatarFromFile } from '@/lib/avatarImage'
import { cn } from '@/lib/cn'
import { useBotStore } from '@/store/botStore'
import type { Bot, BotActivity, ChatMessage } from '@/types'

interface BotListItemProps {
  bot: Bot
  status: ConnectionStatus
  last: ChatMessage | undefined
  typing: boolean
  activity?: BotActivity
  selected: boolean
  onSelect: (botId: string) => void
}

function activityPhrase(activity: BotActivity | undefined): string {
  if (!activity) return ''
  const emoji = activity.emoji ? `${activity.emoji} ` : ''
  if (activity.text) return `${emoji}${activity.text}`
  if (activity.busy) return `${emoji}Working…`
  return ''
}

/** One line under the name: live activity, else latest message. */
function previewText(
  last: ChatMessage | undefined,
  typing: boolean,
  activity: BotActivity | undefined
): string {
  const live = activityPhrase(activity)
  if (live) return live
  if (typing) return 'Typing…'
  if (!last) return ''
  const text = last.text.replace(/\s+/g, ' ').trim()
  const body = text || (last.attachments?.length ? last.attachments[0]!.name : '')
  return last.role === 'user' ? `You: ${body}` : body
}

export const BotListItem = memo(function BotListItem({
  bot,
  status,
  last,
  typing,
  activity,
  selected,
  onSelect
}: BotListItemProps) {
  const setBotAvatar = useBotStore((s) => s.setBotAvatar)
  const renameBot = useBotStore((s) => s.renameBot)
  const removeBot = useBotStore((s) => s.removeBot)
  const groups = useBotStore((s) => s.groups)
  const moveBotToGroup = useBotStore((s) => s.moveBotToGroup)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLButtonElement>(null)
  const preview = previewText(last, typing, activity)
  const live = Boolean(activityPhrase(activity))
  // Only a bot created a moment ago rises into the list; startup stays still.
  const [fresh] = useState(() => Date.now() - bot.createdAt < 3000)

  const body = (
    <>
      <BotAvatar
        emoji={bot.emoji}
        seed={bot.id}
        avatar={bot.avatar}
        platformId={bot.platformId}
        status={status}
        ringClassName="ring-canvas"
      />
      <span className="min-w-0 flex-1">
        {renaming ? (
          <InlineEdit
            value={bot.name}
            label="Bot name"
            className="-ml-1.5 text-[14px]"
            onCommit={(name) => renameBot(bot.id, name)}
            onDone={() => {
              setRenaming(false)
              requestAnimationFrame(() => rowRef.current?.focus())
            }}
          />
        ) : (
          <span className="block truncate text-[14px] leading-5 text-ink">{bot.name}</span>
        )}
        {preview && (
          <span
            className={cn(
              'block truncate text-[13px] leading-[18px]',
              typing || live ? 'shimmer-text' : 'text-ink-secondary'
            )}
          >
            {preview}
          </span>
        )}
      </span>
      {bot.unread > 0 && (
        <span
          className={cn(
            'grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-accent-600 px-1.5 text-[11px] font-medium text-white tabular-nums transition-opacity duration-100 group-focus-within:opacity-0 group-hover:opacity-0',
            menuOpen && 'opacity-0'
          )}
        >
          {bot.unread > 99 ? '99+' : bot.unread}
        </span>
      )}
    </>
  )

  const rowClass = cn(
    'flex min-h-[54px] w-full items-center gap-2.5 rounded-[10px] p-2 pr-3 text-left transition-colors duration-[120ms]',
    selected ? 'bg-active' : 'hover:bg-hover',
    menuOpen && !selected && 'bg-hover'
  )

  return (
    <div
      className={cn('group relative', fresh && 'animate-step-in')}
      onContextMenu={(event) => {
        event.preventDefault()
        setMenuOpen(true)
      }}
    >
      {renaming ? (
        <div className={rowClass}>{body}</div>
      ) : (
        <button
          ref={rowRef}
          type="button"
          data-bot-row
          onClick={() => onSelect(bot.id)}
          aria-current={selected ? 'page' : undefined}
          className={cn(rowClass, 'focus-visible:outline-offset-[-2px]')}
        >
          {body}
        </button>
      )}

      {!renaming && (
        <Menu
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open)
            if (!open) setConfirmDelete(false)
          }}
        >
          <MenuTrigger
            aria-label={`Actions for ${bot.name}`}
            className={cn(
              'press-icon absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-secondary',
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
              'hover:bg-active hover:text-ink data-[state=open]:bg-active'
            )}
          >
            <MoreHorizontal className="size-4" />
          </MenuTrigger>
          <MenuContent align="start" side="bottom" className="min-w-48">
            <MenuItem onSelect={() => setRenaming(true)}>
              <Pencil aria-hidden /> Rename
            </MenuItem>
            <MenuItem onSelect={() => fileRef.current?.click()}>
              <ImagePlus aria-hidden /> {bot.avatar ? 'Change photo' : 'Add photo'}
            </MenuItem>
            {bot.avatar && (
              <MenuItem onSelect={() => setBotAvatar(bot.id, undefined)}>
                <ImageMinus aria-hidden /> Remove photo
              </MenuItem>
            )}
            {groups.length > 1 && (
              <>
                <MenuSeparator />
                <MenuLabel>Move to section</MenuLabel>
                {groups
                  .filter((g) => g.id !== bot.groupId)
                  .map((g) => (
                    <MenuItem key={g.id} onSelect={() => moveBotToGroup(bot.id, g.id)}>
                      <FolderInput aria-hidden /> {g.name || 'Unallocated'}
                    </MenuItem>
                  ))}
              </>
            )}
            <MenuSeparator />
            <MenuItem
              danger
              className={cn(confirmDelete && 'bg-status-error/10 data-[highlighted]:bg-status-error/15')}
              onSelect={(event) => {
                // Deleting is final, so it takes a second click.
                if (!confirmDelete) {
                  event.preventDefault()
                  setConfirmDelete(true)
                  return
                }
                void removeBot(bot.id)
              }}
            >
              <Trash2 aria-hidden /> {confirmDelete ? 'Click again to delete' : 'Delete bot'}
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void avatarFromFile(file).then((avatar) => setBotAvatar(bot.id, avatar), () => {})
        }}
      />
    </div>
  )
})
