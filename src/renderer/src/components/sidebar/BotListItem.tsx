import { memo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ConnectionStatus } from '@adapters/types'
import { FolderInput, Pin, PinOff, Palette, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { BotAvatar } from '@/components/ui/Avatar'
import { BotAvatarEditorDialog } from '@/components/ui/BotAvatarEditorDialog'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { cn } from '@/lib/cn'
import { useBotStore } from '@/store/botStore'
import type { Bot, BotActivity, ChatMessage } from '@/types'
import { t } from '@/lib/i18n'

export type BotRowLayout = 'expanded' | 'pinned' | 'collapsed'

interface BotListItemProps {
  bot: Bot
  status: ConnectionStatus
  last: ChatMessage | undefined
  typing: boolean
  activity?: BotActivity
  selected: boolean
  layout?: BotRowLayout
  onSelect: (botId: string) => void
}

function activityPhrase(activity: BotActivity | undefined): string {
  if (!activity) return ''
  const emoji = activity.emoji ? `${activity.emoji} ` : ''
  if (activity.text) return `${emoji}${activity.text}`
  if (activity.busy) return `${emoji}${t('Working…')}`
  return ''
}

function formatShortTime(ts?: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('now')
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** One line under the name: live activity, else latest message. */
function previewText(
  last: ChatMessage | undefined,
  typing: boolean,
  activity: BotActivity | undefined
): string {
  const live = activityPhrase(activity)
  if (live) return live
  if (typing) return t('Typing…')
  if (!last) return ''
  const text = last.text.replace(/\s+/g, ' ').trim()
  const body =
    text ||
    (last.attachments?.length ? `📎 ${last.attachments[0]!.name}` : '') ||
    (last.media?.length ? `📎 ${last.media[0]!.name || last.media[0]!.path || 'Attachment'}` : '') ||
    (last.tools?.length ? `🔧 ${last.tools[0]!.name}` : '')
  return last.role === 'user' ? t('You: {text}', { text: body }) : body
}

export const BotListItem = memo(function BotListItem({
  bot,
  status,
  last,
  typing,
  activity,
  selected,
  layout = 'expanded',
  onSelect
}: BotListItemProps) {
  const renameBot = useBotStore((s) => s.renameBot)
  const removeBot = useBotStore((s) => s.removeBot)
  const groups = useBotStore((s) => s.groups)
  const moveBotToGroup = useBotStore((s) => s.moveBotToGroup)
  const togglePinBot = useBotStore((s) => s.togglePinBot)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false)
  const [gaze, setGaze] = useState<[number, number] | null>(null)
  const [pokeSignal, setPokeSignal] = useState(0)
  const rowRef = useRef<HTMLButtonElement>(null)

  const preview = previewText(last, typing, activity)
  const live = Boolean(activityPhrase(activity))
  const isWorking = typing || live
  const timeLabel = !isWorking && last?.createdAt ? formatShortTime(last.createdAt) : ''
  // Only a bot created a moment ago rises into the list; startup stays still.
  const [fresh] = useState(() => Date.now() - bot.createdAt < 3000)

  // Grok Bot `attachMarkHoverGaze`: calculate pointer vector relative to the mark on row hover
  // Note: Grok Bot's `fa(rect, point, 0.5)` uses `-y` (up is +1, down is -1)!
  const handlePointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const mark = e.currentTarget.querySelector('.sand-grok-bot-mark')
    const rect = (mark ?? e.currentTarget).getBoundingClientRect()
    const span = Math.max(rect.width, 1) * 0.5
    const gx = Math.max(-1, Math.min(1, (e.clientX - (rect.left + rect.width / 2)) / span))
    const gy = Math.max(-1, Math.min(1, -(e.clientY - (rect.top + rect.height / 2)) / span))
    setGaze([gx, gy])
  }

  const handlePointerLeave = () => {
    setGaze(null)
  }

  const handleSelect = () => {
    setPokeSignal((n) => n + 1)
    onSelect(bot.id)
  }

  const isPinnedTile = layout === 'pinned'
  const isCollapsedRail = layout === 'collapsed'

  const body = isPinnedTile ? (
    <>
      <div className="relative flex items-center justify-center pt-1">
        <BotAvatar
          emoji={bot.emoji}
          seed={bot.id}
          avatar={bot.avatar}
          avatarShape={bot.avatarShape}
          avatarColor={bot.avatarColor}
          platformId={bot.platformId}
          status={status}
          isWorking={isWorking}
          gaze={gaze}
          pokeSignal={pokeSignal}
          size="xl"
          ringClassName="ring-canvas"
        />
        {bot.unread > 0 && (
          <span className="absolute -top-0.5 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white tabular-nums shadow-soft">
            {bot.unread > 99 ? '99+' : bot.unread}
          </span>
        )}
      </div>
      <span className="mt-1.5 block w-full truncate text-center text-[12px] leading-4 font-medium text-ink">
        {bot.name}
      </span>
    </>
  ) : isCollapsedRail ? (
    <div className="relative flex items-center justify-center">
      <BotAvatar
        emoji={bot.emoji}
        seed={bot.id}
        avatar={bot.avatar}
        avatarShape={bot.avatarShape}
        avatarColor={bot.avatarColor}
        platformId={bot.platformId}
        status={status}
        isWorking={isWorking}
        gaze={gaze}
        pokeSignal={pokeSignal}
        size="md"
        ringClassName="ring-canvas"
      />
      {bot.unread > 0 && (
        <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white tabular-nums">
          {bot.unread > 9 ? '9+' : bot.unread}
        </span>
      )}
    </div>
  ) : (
    <>
      <BotAvatar
        emoji={bot.emoji}
        seed={bot.id}
        avatar={bot.avatar}
        avatarShape={bot.avatarShape}
        avatarColor={bot.avatarColor}
        platformId={bot.platformId}
        status={status}
        isWorking={isWorking}
        gaze={gaze}
        pokeSignal={pokeSignal}
        size="md"
        ringClassName="ring-canvas"
      />
      <span className="min-w-0 flex-1">
        {renaming ? (
          <InlineEdit
            value={bot.name}
            label={t('Bot name')}
            className="-ml-1.5 text-[14px]"
            onCommit={(name) => renameBot(bot.id, name)}
            onDone={() => {
              setRenaming(false)
              requestAnimationFrame(() => rowRef.current?.focus())
            }}
          />
        ) : (
          <span className="flex items-baseline justify-between gap-1.5">
            <span className="truncate text-[14px] leading-5 font-medium text-ink">{bot.name}</span>
            {timeLabel && (
              <span className="shrink-0 text-[11px] leading-4 text-ink-faint tabular-nums group-hover:opacity-0">
                {timeLabel}
              </span>
            )}
          </span>
        )}
        {preview ? (
          <span
            className={cn(
              'block truncate text-[12.5px] leading-[17px]',
              isWorking ? 'shimmer-text font-medium' : 'text-ink-secondary'
            )}
          >
            {preview}
          </span>
        ) : (
          <span className="block truncate text-[12px] leading-[17px] text-ink-faint">
            {status === 'offline' ? t('Offline') : t('Idle')}
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

  const rowClass = isPinnedTile
    ? cn(
        'press flex w-full flex-col items-center justify-center rounded-2xl px-2 py-2.5 transition-colors duration-[120ms]',
        selected ? 'bg-active shadow-hairline' : 'bg-ink/[0.035] hover:bg-hover',
        menuOpen && !selected && 'bg-hover'
      )
    : isCollapsedRail
      ? cn(
          'press flex size-11 items-center justify-center rounded-xl transition-colors duration-[120ms]',
          selected ? 'bg-active' : 'hover:bg-hover'
        )
      : cn(
          'flex min-h-[54px] w-full items-center gap-2.5 rounded-[11px] p-2 pr-3 text-left transition-colors duration-[120ms]',
          selected ? 'bg-active' : 'hover:bg-hover',
          menuOpen && !selected && 'bg-hover'
        )

  return (
    <div
      className={cn('group relative', fresh && 'animate-step-in')}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onContextMenu={(event) => {
        event.preventDefault()
        setMenuOpen(true)
      }}
    >
      {renaming && !isPinnedTile && !isCollapsedRail ? (
        <div className={rowClass}>{body}</div>
      ) : (
        <button
          ref={rowRef}
          type="button"
          data-bot-row
          title={isCollapsedRail ? bot.name : undefined}
          onClick={handleSelect}
          aria-current={selected ? 'page' : undefined}
          className={cn(rowClass, 'focus-visible:outline-offset-[-2px]')}
        >
          {body}
        </button>
      )}

      {!renaming && !isCollapsedRail && (
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
              'press-icon absolute grid size-6 place-items-center rounded-full text-ink-secondary',
              isPinnedTile ? 'top-1.5 right-1.5' : 'top-1/2 right-2 size-7 -translate-y-1/2',
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
              'hover:bg-active hover:text-ink data-[state=open]:bg-active'
            )}
          >
            <MoreHorizontal className="size-3.5" />
          </MenuTrigger>
          <MenuContent align="start" side="bottom" className="min-w-48">
            <MenuItem onSelect={() => togglePinBot(bot.id)}>
              {bot.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />} {bot.pinned ? t('Unpin') : t('Pin')}
            </MenuItem>
            <MenuItem onSelect={() => setRenaming(true)}>
              <Pencil aria-hidden /> {t('Rename')}
            </MenuItem>
            <MenuItem onSelect={() => setAvatarEditorOpen(true)}>
              <Palette aria-hidden /> {t('Bot appearance')}
            </MenuItem>
            {groups.length > 1 && (
              <>
                <MenuSeparator />
                <MenuLabel>{t('Move to section')}</MenuLabel>
                {groups
                  .filter((g) => g.id !== bot.groupId)
                  .map((g) => (
                    <MenuItem key={g.id} onSelect={() => moveBotToGroup(bot.id, g.id)}>
                      <FolderInput aria-hidden /> {g.name || t('Unallocated')}
                    </MenuItem>
                  ))}
              </>
            )}
            <MenuSeparator />
            <MenuItem
              danger
              className={cn(confirmDelete && 'bg-status-error/10 data-[highlighted]:bg-status-error/15')}
              onSelect={(event) => {
                if (!confirmDelete) {
                  event.preventDefault()
                  setConfirmDelete(true)
                  return
                }
                void removeBot(bot.id)
              }}
            >
              <Trash2 aria-hidden /> {confirmDelete ? t('Click again to delete') : t('Delete bot')}
            </MenuItem>
          </MenuContent>
        </Menu>
      )}

      <BotAvatarEditorDialog bot={bot} open={avatarEditorOpen} onOpenChange={setAvatarEditorOpen} />
    </div>
  )
})
