import { useCallback, useMemo } from 'react'
import type { AttachmentMeta } from '@adapters/types'
import { Plus } from 'lucide-react'
import { BotAvatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { getBotAccounts } from '@/lib/selectors'
import { shortcutLabel } from '@/lib/shortcuts'
import { useBotStore } from '@/store/botStore'
import type { Bot, ChatMessage } from '@/types'
import { ChatHeader } from './ChatHeader'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { WebSessionPane } from './WebSessionPane'
import { t } from '@/lib/i18n'

const NO_MESSAGES: ChatMessage[] = []

const STARTERS = [
  t('What can you help me with?'),
  t('Draft a short status update for the team'),
  t('Brainstorm five names for a side project')
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
    <div className="flex min-h-0 flex-1 animate-veil-in flex-col items-center justify-center gap-5 px-8 pb-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <BotAvatar emoji={bot.emoji} seed={bot.id} avatar={bot.avatar} platformId={bot.platformId} size="lg" />
        <h2 className="text-[17px] leading-6 font-medium tracking-tight text-ink">{bot.name}</h2>
      </div>
      {needsMuseLogin && onMuseLogin ? (
        <Button variant="primary" size="lg" onClick={onMuseLogin}>
          使用 Muse 登录
        </Button>
      ) : (
        <div className="flex max-w-xl flex-wrap justify-center gap-2">
          {STARTERS.map((starter) => (
            <Button key={starter} size="sm" disabled={!canSend} onClick={() => onPick(starter)} className="h-8 text-[13px] font-normal">
              {starter}
            </Button>
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
  const openGrokLogin = useBotStore((s) => s.openGrokLogin)
  const webSessionOpen = useBotStore((s) => s.webSessionOpen)
  const hasBots = useBotStore((s) => s.bots.length > 0)
  const setAddBotOpen = useBotStore((s) => s.setAddBotOpen)

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
  const onGrokLogin = useCallback((accountId: string) => void openGrokLogin(accountId), [openGrokLogin])

  if (!bot) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="drag-region h-[52px] shrink-0" />
        <div className="flex flex-1 animate-veil-in flex-col items-center justify-center gap-4 pb-[52px]">
          {hasBots ? (
            <p className="text-[13px] text-ink-muted">{t('Select a bot')}</p>
          ) : (
            <>
              <p className="text-[15px] font-semibold tracking-tight text-ink">{t('Add your first bot')}</p>
              <Button variant="primary" size="lg" onClick={() => setAddBotOpen(true)} title={`New bot (${shortcutLabel('N')})`}>
                <Plus aria-hidden /> {t('New bot')}
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  const needsMuseLogin =
    bot.platformId === 'meta-muse' &&
    !!activeAccount &&
    activeAccount.status !== 'online' &&
    activeAccount.status !== 'busy' &&
    activeAccount.status !== 'attention'

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
              needsMuseLogin={needsMuseLogin}
              onPick={(text) => onSend(text)}
              onMuseLogin={activeAccount ? () => onMuseLogin(activeAccount.id) : undefined}
            />
          ) : (
            <MessageList bot={bot} messages={messages} accounts={accounts} typing={typing} onRetry={onRetry} />
          )}
          <Composer
            key={bot.id}
            bot={bot}
            account={activeAccount}
            onSend={onSend}
            onConnect={onConnect}
            onMuseLogin={onMuseLogin}
            onGrokLogin={onGrokLogin}
            hideNotice={needsMuseLogin && messages.length === 0 && !typing}
          />
        </>
      )}
    </div>
  )
}
