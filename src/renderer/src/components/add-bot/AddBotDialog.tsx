import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { getPlatform } from '@adapters/platforms'
import { adapterRegistry } from '@adapters/registry'
import type { PlatformId } from '@adapters/types'
import { createId } from '@shared/id'
import { Camera, ChevronLeft, ChevronRight } from 'lucide-react'
import { BotAvatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { PlatformGlyph } from '@/components/ui/PlatformGlyph'
import { useMorphHeight } from '@/hooks/useMorphHeight'
import { usePlatformLogin } from '@/hooks/usePlatformLogin'
import { avatarFromFile } from '@/lib/avatarImage'
import { cn } from '@/lib/cn'
import { useBotStore } from '@/store/botStore'
import { BLANK_TEMPLATE, BOT_TEMPLATES, type BotTemplate } from '@/data/botTemplates'

const NAME_MAX = 40

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/** "Meta Muse", then "Meta Muse 2", … — never clashes with an existing bot. */
function freshName(base: string, taken: readonly string[]): string {
  const lower = new Set(taken.map((name) => name.toLowerCase()))
  if (!lower.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!lower.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

/**
 * Stays mounted so closing plays the exit animation; the store bumps
 * `addBotKey` on every open, which remounts the flow from the first step.
 */
export function AddBotDialog() {
  const open = useBotStore((s) => s.addBotOpen)
  const key = useBotStore((s) => s.addBotKey)
  const setOpen = useBotStore((s) => s.setAddBotOpen)
  if (key === 0) return null
  return <AddBotFlow key={key} open={open} onClose={() => setOpen(false)} />
}

/**
 * Pick a platform → its sign-in window opens on the new account's own
 * partition → once a session appears, name the bot → done. The session is
 * already in the partition, so the new bot connects without another step.
 */
function AddBotFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addBot = useBotStore((s) => s.addBot)
  const bots = useBotStore((s) => s.bots)
  const botId = useRef(createId('bot')).current
  const login = usePlatformLogin(botId)
  const listRef = useRef<HTMLUListElement>(null)
  const morph = useMorphHeight<HTMLDivElement>()
  const created = useRef(false)
  const [template, setTemplate] = useState<BotTemplate | null>(null)
  const { phase } = login

  const close = () => {
    // Leaving before "Done" (Esc, scrim, close button) drops the session.
    login.discard()
    onClose()
  }

  const finish = (platformId: PlatformId, name: string, avatar: string | undefined) => {
    login.keep()
    created.current = true
    const picked = template ?? BLANK_TEMPLATE
    addBot({
      id: botId,
      platformId,
      name,
      avatar,
      emoji: picked.emoji,
      description: picked.id === 'blank' ? undefined : picked.description,
      notes: picked.starter ? `Starter brief (from template "${picked.name}"):\n${picked.starter}` : undefined,
      accounts: [{ key: login.accountId, accountId: login.accountId, displayName: name, handle: '' }]
    })
  }

  const platform = phase.kind === 'idle' ? undefined : getPlatform(phase.platformId)
  const title =
    phase.kind === 'idle'
      ? template
        ? 'Choose a platform'
        : 'New bot'
      : phase.kind === 'waiting'
        ? `Sign in to ${platform!.name}`
        : 'Name your bot'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={title}
      className="w-[min(92vw,420px)]"
      headerStart={
        phase.kind === 'waiting' ? (
          <IconButton label="Back" size="sm" onClick={login.discard} className="-ml-1">
            <ChevronLeft />
          </IconButton>
        ) : phase.kind === 'idle' && template ? (
          <IconButton label="Back to templates" size="sm" onClick={() => setTemplate(null)} className="-ml-1">
            <ChevronLeft />
          </IconButton>
        ) : null
      }
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
      }}
      onCloseAutoFocus={(event) => {
        // A new bot is ready to talk to: land in its composer, not on "+".
        if (!created.current) return
        event.preventDefault()
        window.dispatchEvent(new Event('bothub:focus-composer'))
      }}
    >
      <div
        className="overflow-hidden transition-[height] duration-[420ms] ease-spring-shape motion-reduce:transition-none"
        style={{ height: morph.height }}
      >
        <div ref={morph.ref}>
          {phase.kind === 'idle' && !template && (
            <TemplateStep key="templates" onPick={setTemplate} />
          )}
          {phase.kind === 'idle' && template && (
            <PlatformStep key="platform" listRef={listRef} error={phase.error} onPick={login.start} />
          )}
          {phase.kind === 'waiting' && (
            <LoginWaiting
              key="login"
              platformId={phase.platformId}
              windowClosed={phase.windowClosed}
              onReopen={login.reopen}
            />
          )}
          {phase.kind === 'signed-in' && (
            <NameStep
              key="name"
              platformId={phase.platformId}
              emoji={template?.emoji ?? '🤖'}
              starter={template?.starter ?? ''}
              defaultName={freshName(template?.name || getPlatform(phase.platformId).name, bots.map((b) => b.name))}
              onDone={(name, avatar) => finish(phase.platformId, name, avatar)}
            />
          )}
        </div>
      </div>
    </Dialog>
  )
}

function moveFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]
  if (next) {
    event.preventDefault()
    next.focus()
  }
}

function PlatformStep({
  listRef,
  error,
  onPick
}: {
  listRef: RefObject<HTMLUListElement | null>
  error?: string
  onPick: (platformId: PlatformId) => void
}) {
  const platforms = adapterRegistry.listPlatforms()
  return (
    <div className="animate-veil-in">
      <ul ref={listRef} className="flex flex-col gap-0.5" onKeyDown={moveFocus} aria-label="Platforms">
        {platforms.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={!p.usable}
              onClick={() => onPick(p.id)}
              className={cn(
                'group flex h-12 w-full items-center gap-3 rounded-[10px] px-2 text-left transition-colors duration-100',
                'hover:bg-hover active:bg-active disabled:pointer-events-none'
              )}
            >
              <PlatformGlyph platform={p} size="md" className={cn(!p.usable && 'opacity-50 grayscale')} />
              <span className={cn('min-w-0 flex-1 truncate text-[14px]', p.usable ? 'text-ink' : 'text-ink-muted')}>
                {p.name}
              </span>
              {p.usable ? (
                <ChevronRight
                  className="size-4 text-ink-muted opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                />
              ) : (
                <span className="rounded-[4px] bg-sunken px-1.5 text-[11px] leading-4 text-ink-muted">Soon</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="mt-3 px-2 text-[12px] text-status-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Shared by the add-bot and add-account flows. */
export function LoginWaiting({
  platformId,
  windowClosed,
  onReopen
}: {
  platformId: PlatformId
  windowClosed: boolean
  onReopen: () => void
}) {
  const platform = getPlatform(platformId)
  const actionRef = useRef<HTMLButtonElement>(null)
  useEffect(() => actionRef.current?.focus(), [])
  return (
    <div className="flex animate-step-in flex-col items-center gap-4 pt-4 pb-2 text-center" role="status">
      <PlatformGlyph platform={platform} size="lg" />
      <p
        key={windowClosed ? 'closed' : 'waiting'}
        className={cn('animate-veil-in text-[14px] leading-5', windowClosed ? 'text-ink' : 'shimmer-text')}
      >
        {windowClosed ? 'The sign-in window was closed' : 'Waiting for you to sign in…'}
      </p>
      <Button ref={actionRef} variant={windowClosed ? 'primary' : 'secondary'} onClick={onReopen}>
        {windowClosed ? 'Open again' : 'Show window'}
      </Button>
    </div>
  )
}

function NameStep({
  platformId,
  emoji,
  starter,
  defaultName,
  onDone
}: {
  platformId: PlatformId
  emoji: string
  starter: string
  defaultName: string
  onDone: (name: string, avatar: string | undefined) => void
}) {
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | undefined>()
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const finalName = name.trim() || defaultName

  useEffect(() => inputRef.current?.focus(), [])

  const pickFile = async (file: File | undefined) => {
    if (!file) return
    setError('')
    try {
      setAvatar(await avatarFromFile(file))
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }

  return (
    <form
      className="flex animate-step-in flex-col items-center gap-5 pt-2"
      onSubmit={(event) => {
        event.preventDefault()
        onDone(finalName, avatar)
      }}
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={avatar ? 'Change photo' : 'Add a photo'}
          title={avatar ? 'Change photo' : 'Add a photo'}
          className="group press-icon relative block rounded-full"
        >
          <span key={avatar ?? 'mark'} className="inline-flex animate-mark-pop">
            <BotAvatar emoji={emoji} seed={platformId} avatar={avatar} platformId={platformId} size="xl" />
          </span>
          <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full border-[0.5px] border-line-strong bg-main text-ink-secondary shadow-float transition-colors group-hover:text-ink">
            <Camera className="size-3.5" aria-hidden />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            void pickFile(file)
          }}
        />
      </div>

      <div className="flex w-full flex-col gap-1.5">
        <input
          ref={inputRef}
          value={name}
          maxLength={NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          placeholder={defaultName}
          aria-label="Bot name"
          className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-center text-[14px] text-ink outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-ink-muted focus:border-accent-600 focus:ring-3 focus:ring-accent-100"
        />
        {starter && (
          <p className="rounded-lg bg-hover px-3 py-2 text-left text-[12px] leading-[17px] text-ink-secondary">
            <span className="font-medium text-ink">Starter brief</span> — saved to Notes. Send it as your first message
            to set the bot up; Muse has no separate persona setting.
          </p>
        )}
        {error && (
          <p className="text-center text-[12px] text-status-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex w-full items-center justify-end gap-2">
        {avatar && (
          <Button variant="ghost" className="mr-auto -ml-2" onClick={() => setAvatar(undefined)}>
            Remove photo
          </Button>
        )}
        <Button variant="primary" type="submit">
          Done
        </Button>
      </div>
    </form>
  )
}


/** Grok-style template gallery: local starter presets plus Blank. */
function TemplateStep({ onPick }: { onPick: (template: BotTemplate) => void }) {
  const firstRef = useRef<HTMLButtonElement>(null)
  useEffect(() => firstRef.current?.focus(), [])
  return (
    <div className="flex animate-step-in flex-col gap-2 pb-1">
      <p className="px-0.5 text-[12px] font-medium text-ink-muted">Bot templates</p>
      <ul className="grid grid-cols-2 gap-2">
        {BOT_TEMPLATES.map((t, i) => (
          <li key={t.id}>
            <button
              ref={i === 0 ? firstRef : undefined}
              type="button"
              onClick={() => onPick(t)}
              className={cn(
                'press flex h-full w-full flex-col items-start gap-1.5 rounded-xl border border-line bg-surface p-3 text-left',
                'transition-colors hover:border-line-strong hover:bg-hover focus-visible:outline-offset-[-2px]',
                t.id === 'blank' && 'border-dashed border-line-strong bg-transparent'
              )}
            >
              <span className="text-[22px] leading-none" aria-hidden>
                {t.id === 'blank' ? '＋' : t.emoji}
              </span>
              <span className="text-[13px] font-medium text-ink">{t.id === 'blank' ? 'Blank bot' : t.name}</span>
              <span className="line-clamp-2 text-[12px] leading-[16px] text-ink-secondary">{t.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
