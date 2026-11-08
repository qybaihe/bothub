import { ChevronRight, Globe, MessageSquarePlus, PanelRight, Pin, PinOff, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PaneHeader } from '@/components/layout/PaneHeader'
import { BotAvatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import { STATUS_LABEL } from '@/components/ui/Status'
import { cn } from '@/lib/cn'
import { getBotStatus } from '@/lib/selectors'
import { shortcutLabel } from '@/lib/shortcuts'
import { useBotStore } from '@/store/botStore'
import { adapterRegistry } from '@adapters/registry'
import type { Bot, BotAccount } from '@/types'
import { t } from '@/lib/i18n'

interface ChatHeaderProps {
  bot: Bot
  accounts: BotAccount[]
}

interface AgentOption {
  id: string
  name: string
}

function AgentPicker({ bot }: { bot: Bot }) {
  const setSelectedAgent = useBotStore((s) => s.setSelectedAgent)
  const account = useBotStore((s) => s.accounts[bot.activeAccountId])
  const [agents, setAgents] = useState<AgentOption[]>([])

  useEffect(() => {
    if (bot.platformId !== 'grok' || !account) {
      setAgents([])
      return
    }
    const adapter = adapterRegistry.get('grok') as {
      listCachedAgents?: (id: string) => AgentOption[]
      refreshAgents?: (id: string) => Promise<AgentOption[]>
      bindConversationAgent?: (c: string, a: string) => void
    }
    const apply = (list: AgentOption[]) => {
      setAgents(list)
      const pick =
        bot.selectedAgentId && list.some((a) => a.id === bot.selectedAgentId)
          ? bot.selectedAgentId
          : list[0]?.id
      if (!pick) return
      adapter?.bindConversationAgent?.(bot.id, pick)
      if (pick !== bot.selectedAgentId) setSelectedAgent(bot.id, pick)
    }
    const cached = adapter?.listCachedAgents?.(account.id) ?? []
    if (cached.length) {
      apply(cached.map((a) => ({ id: a.id, name: a.name })))
      return
    }
    void adapter
      ?.refreshAgents?.(account.id)
      .then((list) => apply((list ?? []).map((a) => ({ id: a.id, name: a.name }))))
      .catch(() => setAgents([]))
  }, [bot.id, bot.platformId, bot.selectedAgentId, account?.id, account?.status, setSelectedAgent])

  if (bot.platformId !== 'grok' || agents.length === 0) return null
  return (
    <label className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-muted">
      <span className="shrink-0">{t('Agent')}</span>
      <select
        className="max-w-[140px] truncate rounded-full border border-line bg-surface px-2 py-0.5 text-[12px] text-ink outline-none focus:border-accent"
        value={bot.selectedAgentId ?? agents[0]?.id ?? ''}
        onChange={(e) => setSelectedAgent(bot.id, e.target.value)}
        aria-label={t('Select Grok Bot agent')}
      >
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  )
}

export function ChatHeader({ bot, accounts: _accounts }: ChatHeaderProps) {
  const allAccounts = useBotStore((s) => s.accounts)
  const infoOpen = useBotStore((s) => s.infoPanelOpen)
  const toggleInfoPanel = useBotStore((s) => s.toggleInfoPanel)
  const webSessionOpen = useBotStore((s) => s.webSessionOpen)
  const toggleWebSession = useBotStore((s) => s.toggleWebSession)
  const togglePinBot = useBotStore((s) => s.togglePinBot)
  const startNewMuseSession = useBotStore((s) => s.startNewMuseSession)
  const connectAccount = useBotStore((s) => s.connectAccount)
  const typing = useBotStore((s) => s.typing[bot.id] === true)
  const activeAccount = allAccounts[bot.activeAccountId]

  const status = getBotStatus(bot, allAccounts)
  const activity = useBotStore((s) => s.activity[bot.activeAccountId])
  const activityLine = activity
    ? `${activity.emoji ? activity.emoji + ' ' : ''}${activity.text || (activity.busy ? t('Working…') : '')}${
        activity.subagents && activity.subagents > 0 ? ` · ${activity.subagents} subagents` : ''
      }`.trim()
    : ''

  return (
    <PaneHeader className="gap-3 pr-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <AgentPicker bot={bot} />
        {activityLine ? (
          <span
            className="hidden min-w-0 truncate text-[12px] text-ink-muted shimmer-text sm:inline"
            title={activityLine}
            data-muse-activity
          >
            {activityLine}
          </span>
        ) : null}
      </div>

      {/* The capsule: avatar + name; hovering reveals the way into details. */}
      <button
        type="button"
        data-capsule
        onClick={toggleInfoPanel}
        aria-expanded={infoOpen}
        title={`${bot.name} · ${STATUS_LABEL[status]}`}
        className={cn(
          'no-drag group press flex h-10 max-w-[min(420px,50%)] min-w-0 items-center gap-2 rounded-full pr-3.5 pl-2',
          'border-[0.5px] border-line-strong bg-main shadow-float hover:bg-surface'
        )}
      >
        <BotAvatar
          emoji={bot.emoji}
          seed={bot.id}
          avatar={bot.avatar}
          avatarShape={bot.avatarShape}
          avatarColor={bot.avatarColor}
          platformId={bot.platformId}
          status={status}
          isWorking={typing || Boolean(activity?.busy)}
          followPointer
          size="xs"
          ringClassName="ring-main"
        />
        <span className="flex min-w-0 flex-col items-start">
          <h1 className="max-w-full min-w-0 truncate text-[14px] leading-[18px] font-medium text-ink">{bot.name}</h1>
          {status !== 'online' && (
            <span className="-mt-0.5 max-w-full truncate text-[10.5px] leading-[13px] text-ink-muted" data-capsule-status>
              {STATUS_LABEL[status]}
            </span>
          )}
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            '-ml-2 size-4 w-0 shrink-0 -translate-x-1.5 text-ink-muted opacity-0 blur-[3px]',
            'transition-[width,margin,opacity,filter,translate] duration-[290ms] ease-spring-tap',
            'group-hover:ml-0 group-hover:w-4 group-hover:translate-x-0 group-hover:opacity-100 group-hover:blur-none',
            'group-focus-visible:ml-0 group-focus-visible:w-4 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:blur-none'
          )}
        />
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        {bot.platformId === 'meta-muse' && (
          <IconButton
            label="开启新对话"
            onClick={() => void startNewMuseSession(bot.id)}
          >
            <MessageSquarePlus />
          </IconButton>
        )}
        {bot.activeAccountId && (
          <IconButton
            label="同步最新对话与连接状态"
            disabled={activeAccount?.pending}
            onClick={() => void connectAccount(bot.activeAccountId)}
          >
            <RefreshCw className={cn(activeAccount?.pending && 'animate-spin')} />
          </IconButton>
        )}
        <IconButton label={bot.pinned ? t('Unpin from sidebar') : t('Pin to sidebar')} active={bot.pinned === true} onClick={() => togglePinBot(bot.id)}>
          {bot.pinned ? <PinOff /> : <Pin />}
        </IconButton>
        <IconButton
          label={webSessionOpen ? t('Back to conversation') : t('Show web session')}
          active={webSessionOpen}
          onClick={toggleWebSession}
        >
          <Globe />
        </IconButton>
        <IconButton
          label={infoOpen ? t('Hide details') : t('Show details')}
          shortcut={shortcutLabel('I')}
          active={infoOpen}
          onClick={toggleInfoPanel}
        >
          <PanelRight />
        </IconButton>
      </div>
    </PaneHeader>
  )
}
