import { Fragment, useLayoutEffect, useRef } from 'react'
import { BotAvatar } from '@/components/ui/Avatar'
import { formatDayLabel, isSameDay } from '@/lib/format'
import type { Bot, BotAccount, ChatMessage } from '@/types'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'

interface MessageListProps {
  bot: Bot
  messages: ChatMessage[]
  accounts: BotAccount[]
  typing: boolean
  onRetry: (messageId: string) => void
}

/** Messages closer than this (same sender & account) render as one run. */
const RUN_GAP_MS = 5 * 60 * 1000
/** Auto-scroll only if the reader is already near the bottom. */
const STICKY_THRESHOLD_PX = 120

function sameRun(a: ChatMessage | undefined, b: ChatMessage | undefined): boolean {
  return (
    !!a &&
    !!b &&
    a.role === b.role &&
    a.accountId === b.accountId &&
    Math.abs(b.createdAt - a.createdAt) < RUN_GAP_MS &&
    isSameDay(a.createdAt, b.createdAt)
  )
}

export function MessageList({ bot, messages, accounts, typing, onRetry }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const lastBotId = useRef<string | null>(null)

  const accountNames = new Map(accounts.map((a) => [a.id, a.displayName]))
  const showAccount = bot.accountIds.length > 1
  const lastMessage = messages[messages.length - 1]

  // Jump to the bottom when switching bots; follow new messages when pinned.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const switched = lastBotId.current !== bot.id
    lastBotId.current = bot.id
    if (switched || stickToBottom.current || lastMessage?.role === 'user') {
      el.scrollTo({ top: el.scrollHeight, behavior: switched ? 'instant' : 'smooth' })
    }
  }, [bot.id, messages.length, lastMessage?.role, typing])

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const el = event.currentTarget
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD_PX
      }}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <ol className="mx-auto flex max-w-[960px] flex-col px-8 py-6" aria-label={`Conversation with ${bot.name}`}>
        {messages.map((message, index) => {
          const prev = messages[index - 1]
          const next = messages[index + 1]
          const newDay = !prev || !isSameDay(prev.createdAt, message.createdAt)
          const isFirstInRun = !sameRun(prev, message)
          const isLastInRun = !sameRun(message, next)
          const isBot = message.role === 'bot'

          return (
            <Fragment key={message.id}>
              {newDay && (
                <li className="my-5 flex items-center justify-center gap-3 text-caption text-ink-muted first:mt-0" role="separator">
                  {formatDayLabel(message.createdAt)}
                </li>
              )}
              <li className={isFirstInRun && !newDay ? 'mt-4' : 'mt-1'}>
                <div className="flex items-start gap-2.5">
                  {isBot && (
                    <span className="w-7 shrink-0">
                      {isFirstInRun && <BotAvatar emoji={bot.emoji} seed={bot.id} platformId={bot.platformId} size="sm" />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <MessageBubble
                      message={message}
                      isFirstInRun={isFirstInRun}
                      isLastInRun={isLastInRun}
                      accountLabel={showAccount ? accountNames.get(message.accountId) : undefined}
                      onRetry={onRetry}
                    />
                  </div>
                </div>
              </li>
            </Fragment>
          )
        })}
        {typing && (
          <li className="mt-4">
            <TypingIndicator bot={bot} />
          </li>
        )}
      </ol>
    </div>
  )
}
