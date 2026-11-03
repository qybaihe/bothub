import { useCallback, useMemo } from 'react'
import type { AttachmentMeta } from '@adapters/types'
import { MessagesSquare, Sparkles } from 'lucide-react'
import { BotAvatar } from '@/components/ui/Avatar'
import { getBotAccounts } from '@/lib/selectors'
import { useBotStore } from '@/store/botStore'
import type { Bot, ChatMessage } from '@/types'
import { ChatHeader } from './ChatHeader'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { WebSessionPane } from './WebSessionPane'

const NO_MESSAGES: ChatMessage[] = []

const STARTERS = [
  'What can you help me with?',
  'Draft a short status update for the team',
  'Brainstorm five names for a side project'
]

function ConversationIntro({
  bot,
  canSend,
  needsMuseLogin,
  onPick,
  onMuseLogin
}: {
  bot: Bot
  canSend: boolean
  needsMuseLogin: boolean
  onPick: (text: string) => void
  onMuseLogin?: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <BotAvatar emoji={bot.emoji} seed={bot.id} platformId={bot.platformId} size="lg" />
      <div>
        <h2 className="text-base font-semibold tracking-tight">{bot.name}</h2>
        {bot.description ? (
          <p className="mt-1 max-w-sm text-[13px] text-ink-muted">{bot.description}</p>
        ) : null}
      </div>
      {needsMuseLogin && onMuseLogin ? (
        <button
          type="button"
          onClick={onMuseLogin}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-accent-600 px-5 text-[13px] font-semibold text-white shadow-soft transition-transform hover:bg-accent-700 active:scale-[0.98]"
        >
          使用 Muse 登录
        </button>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={!canSend}
              onClick={() => onPick(starter)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-secondary shadow-soft transition-colors hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 disabled:opacity-50"
            >
              <Sparkles className="size-3.5 text-accent-500" aria-hidden />
              {starter}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChatArea() {
  const bot = useBotStore((s) => s.bots.find((b) => b.id === s.selectedBotId))
  const accountMap = useBotStore((s) => s.accounts)
  const messages = useBotStore((s) => (s.selectedBotId ? s.messages[s.selectedBotId] : undefined) ?? NO_MESSAGES)
  const typing = useBotStore((s) => (s.selectedBotId ? s.typing[s.selectedBotId] === true : false))
  const sendMessage = useBotStore((s) => s.sendMessage)
  const retryMessage = useBotStore((s) => s.retryMessage)
  const connectAccount = useBotStore((s) => s.connectAccount)
  const openMuseLogin = useBotStore((s) => s.openMuseLogin)
  const webSessionOpen = useBotStore((s) => s.webSessionOpen)

  const accounts = useMemo(() => (bot ? getBotAccounts(bot, accountMap) : []), [bot, accountMap])
  const activeAccount = bot ? accountMap[bot.activeAccountId] : undefined
  const botId = bot?.id

  const onSend = useCallback(
    (text: string, attachments: AttachmentMeta[] = []) => {
      if (botId) void sendMessage(botId, text, attachments)
    },
    [botId, sendMessage]
  )
  const onRetry = useCallback(
    (messageId: string) => {
      if (botId) void retryMessage(botId, messageId)
    },
    [botId, retryMessage]
  )
  const onConnect = useCallback((accountId: string) => void connectAccount(accountId), [connectAccount])
  const onMuseLogin = useCallback((accountId: string) => void openMuseLogin(accountId), [openMuseLogin])

  if (!bot) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="drag-region h-[52px] shrink-0" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-muted">
          <MessagesSquare className="size-6" aria-hidden />
          <p className="text-ui">Select a bot to start a conversation</p>
        </div>
      </div>
    )
  }

  const canSend =
    activeAccount?.status === 'online' ||
    activeAccount?.status === 'busy' ||
    activeAccount?.status === 'attention'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatHeader bot={bot} accounts={accounts} />
      {webSessionOpen && activeAccount ? (
        <WebSessionPane key={`${bot.id}:${activeAccount.id}`} bot={bot} account={activeAccount} />
      ) : (
        <>
          {messages.length === 0 && !typing ? (
            <ConversationIntro
              bot={bot}
              canSend={canSend}
              needsMuseLogin={
                bot.platformId === 'meta-muse' &&
                !!activeAccount &&
                activeAccount.status !== 'online' &&
                activeAccount.status !== 'busy' &&
                activeAccount.status !== 'attention'
              }
              onPick={(text) => onSend(text)}
              onMuseLogin={activeAccount ? () => onMuseLogin(activeAccount.id) : undefined}
            />
          ) : (
            <MessageList bot={bot} messages={messages} accounts={accounts} typing={typing} onRetry={onRetry} />
          )}
          <Composer key={bot.id} bot={bot} account={activeAccount} onSend={onSend} onConnect={onConnect} onMuseLogin={onMuseLogin} />
        </>
      )}
    </div>
  )
}
