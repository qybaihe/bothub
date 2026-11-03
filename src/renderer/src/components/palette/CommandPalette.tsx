import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as RadixDialog from '@radix-ui/react-dialog'
import { Globe, PanelRight, Plus, RefreshCw, Search, X } from 'lucide-react'
import { BotAvatar } from '@/components/ui/Avatar'
import { useGlide } from '@/hooks/useGlide'
import { getBridge } from '@/lib/bridge'
import { cn } from '@/lib/cn'
import { useOverlayLock } from '@/lib/overlay'
import { botMatches } from '@/lib/selectors'
import { shortcutLabel } from '@/lib/shortcuts'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

interface Row {
  key: string
  title: string
  subtitle?: string
  lead: ReactNode
  hint?: string
  run: () => void
}

const MAX_MESSAGE_HITS = 20

function snippet(text: string, query: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const at = flat.toLowerCase().indexOf(query)
  if (at < 0) return flat.slice(0, 80)
  const from = Math.max(0, at - 24)
  return (from > 0 ? '…' : '') + flat.slice(from, at + query.length + 60)
}

function CommandIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-6 place-items-center rounded-full bg-hover text-ink-secondary [&_svg]:size-3.5">
      {children}
    </span>
  )
}

/** ⌘K: jump to a bot, find a message, or run a command. */
export function CommandPalette() {
  const open = useBotStore((s) => s.paletteOpen)
  const key = useBotStore((s) => s.paletteKey)
  const close = useBotStore((s) => s.closePalette)
  useOverlayLock(open)
  if (key === 0) return null
  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="no-drag fixed inset-0 z-40 bg-black/30 data-[state=closed]:animate-scrim-out data-[state=open]:animate-scrim-in" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={cn(
            'no-drag fixed top-[14vh] left-1/2 z-50 flex w-[min(560px,92vw)] -translate-x-1/2 flex-col overflow-hidden',
            'rounded-xl border border-line-strong bg-main shadow-dialog outline-none',
            'data-[state=closed]:animate-dialog-sink data-[state=open]:animate-palette-in'
          )}
        >
          <RadixDialog.Title className="sr-only">{t('Search')}</RadixDialog.Title>
          <PaletteBody key={key} onClose={close} />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const seed = useBotStore((s) => s.paletteQuery)
  const bots = useBotStore((s) => s.bots)
  const groups = useBotStore((s) => s.groups)
  const accounts = useBotStore((s) => s.accounts)
  const messages = useBotStore((s) => s.messages)
  const infoOpen = useBotStore((s) => s.infoPanelOpen)
  const webOpen = useBotStore((s) => s.webSessionOpen)
  const selectBot = useBotStore((s) => s.selectBot)
  const setAddBotOpen = useBotStore((s) => s.setAddBotOpen)
  const toggleInfoPanel = useBotStore((s) => s.toggleInfoPanel)
  const toggleWebSession = useBotStore((s) => s.toggleWebSession)
  const [query, setQuery] = useState(seed)
  const [cursor, setCursor] = useState(0)
  const wanted = query.trim().toLowerCase()

  const sections = useMemo(() => {
    const out: Array<[string, Row[]]> = []
    const openBot = (id: string) => () => {
      selectBot(id)
      window.dispatchEvent(new Event('bothub:focus-composer'))
    }
    const botRows: Row[] = bots
      .filter((bot) => botMatches(bot, wanted, accounts, groups.find((g) => g.id === bot.groupId)))
      .map((bot) => ({
        key: `bot:${bot.id}`,
        title: bot.name,
        lead: <BotAvatar emoji={bot.emoji} seed={bot.id} avatar={bot.avatar} platformId={bot.platformId} size="xs" />,
        run: openBot(bot.id)
      }))
    if (botRows.length) out.push([t('Bots'), botRows])

    if (wanted.length >= 2) {
      const hits: Row[] = []
      for (const bot of bots) {
        for (const message of [...(messages[bot.id] ?? [])].reverse()) {
          if (hits.length >= MAX_MESSAGE_HITS) break
          if (!message.text.toLowerCase().includes(wanted)) continue
          hits.push({
            key: `msg:${message.id}`,
            title: bot.name,
            subtitle: snippet(message.text, wanted),
            lead: <BotAvatar emoji={bot.emoji} seed={bot.id} avatar={bot.avatar} platformId={bot.platformId} size="xs" />,
            run: openBot(bot.id)
          })
        }
      }
      if (hits.length) out.push([t('Messages'), hits])
    }

    const commands: Row[] = [
      {
        key: 'cmd:new',
        title: t('New bot'),
        hint: shortcutLabel('N'),
        lead: (
          <CommandIcon>
            <Plus />
          </CommandIcon>
        ),
        run: () => setAddBotOpen(true)
      },
      {
        key: 'cmd:details',
        title: infoOpen ? t('Hide details') : t('Show details'),
        hint: shortcutLabel('I'),
        lead: (
          <CommandIcon>
            <PanelRight />
          </CommandIcon>
        ),
        run: toggleInfoPanel
      },
      {
        key: 'cmd:web',
        title: webOpen ? t('Back to conversation') : t('Show web session'),
        lead: (
          <CommandIcon>
            <Globe />
          </CommandIcon>
        ),
        run: toggleWebSession
      },
      ...(getBridge()?.updates
        ? [
            {
              key: 'cmd:update',
              title: t('Check for updates'),
              lead: (
                <CommandIcon>
                  <RefreshCw />
                </CommandIcon>
              ),
              run: () => void getBridge()?.updates.check()
            }
          ]
        : [])
    ].filter((row) => !wanted || row.title.toLowerCase().includes(wanted))
    if (commands.length) out.push([t('Commands'), commands])
    return out
  }, [bots, groups, accounts, messages, wanted, infoOpen, webOpen, selectBot, setAddBotOpen, toggleInfoPanel, toggleWebSession])

  const rows = sections.flatMap(([, items]) => items)
  const active = Math.min(cursor, Math.max(rows.length - 1, 0))
  const activeKey = rows[active]?.key
  const glide = useGlide<HTMLDivElement>(`${activeKey}|${rows.length}`)

  useEffect(() => {
    glide.ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeKey])

  const choose = (row: Row | undefined) => {
    if (!row) return
    onClose()
    // Let the palette hand focus back before the command moves it.
    requestAnimationFrame(row.run)
  }

  let index = -1
  return (
    <>
      <div className="flex h-[52px] items-center gap-2 border-b-[0.5px] border-line-strong pr-3 pl-4">
        <Search className="size-[18px] shrink-0 text-ink-muted" aria-hidden />
        <input
          autoFocus
          value={query}
          role="combobox"
          aria-expanded
          aria-controls="palette-results"
          aria-activedescendant={activeKey ? `palette-${activeKey}` : undefined}
          aria-label={t('Search')}
          placeholder={t('Search bots, messages and commands')}
          onChange={(event) => {
            setQuery(event.target.value)
            setCursor(0)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setCursor(Math.min(active + 1, rows.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setCursor(Math.max(active - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              choose(rows[active])
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted"
        />
        {query && (
          <button
            type="button"
            aria-label={t('Clear search')}
            onClick={() => {
              setQuery('')
              setCursor(0)
            }}
            className="press-icon grid size-6 place-items-center rounded-full text-ink-muted hover:bg-hover hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div
        ref={glide.ref}
        id="palette-results"
        role="listbox"
        aria-label={t('Results')}
        className="relative flex max-h-[min(402px,54vh)] min-h-[120px] flex-col gap-0.5 overflow-y-auto p-2"
      >
        {glide.thumb && (
          <span aria-hidden className="pointer-events-none absolute right-2 left-2 rounded-lg bg-active" style={glide.thumb} />
        )}
        {rows.length === 0 ? (
          <div className="flex flex-1 animate-veil-in flex-col items-center justify-center gap-2 py-8 text-ink-muted">
            <Search className="size-5 text-ink-faint" aria-hidden />
            <p className="text-[13px]">{t('No results')}</p>
          </div>
        ) : (
          sections.map(([title, items]) => (
            <div key={title} role="presentation" className="flex flex-col gap-0.5">
              <p className="relative px-2 pt-2 pb-1 text-[12px] text-ink-muted first:pt-0">{title}</p>
              {items.map((row) => {
                index += 1
                const at = index
                return (
                  <button
                    key={row.key}
                    id={`palette-${row.key}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={at === active}
                    onMouseMove={() => at !== active && setCursor(at)}
                    onClick={() => choose(row)}
                    className={cn(
                      'relative flex w-full shrink-0 items-center gap-2.5 rounded-lg px-2 text-left',
                      row.subtitle ? 'h-[49px]' : 'h-10'
                    )}
                  >
                    <span className="grid size-6 shrink-0 place-items-center">{row.lead}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] leading-5 text-ink">{row.title}</span>
                      {row.subtitle && <span className="truncate text-[12px] leading-4 text-ink-muted">{row.subtitle}</span>}
                    </span>
                    {row.hint && <span className="shrink-0 text-[12px] text-ink-muted tabular-nums">{row.hint}</span>}
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>
    </>
  )
}
