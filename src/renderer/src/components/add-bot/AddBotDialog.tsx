import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { getPlatform } from '@adapters/platforms'
import { adapterRegistry } from '@adapters/registry'
import type { AdapterEvent, ConnectionStatus, PlatformId } from '@adapters/types'
import { createId } from '@shared/id'
import { Camera, ChevronLeft, ChevronRight } from 'lucide-react'
import { BotAvatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { PlatformGlyph } from '@/components/ui/PlatformGlyph'
import { useMorphHeight } from '@/hooks/useMorphHeight'
import { avatarFromFile } from '@/lib/avatarImage'
import { cn } from '@/lib/cn'
import { useBotStore } from '@/store/botStore'

const NAME_MAX = 40
const LIVE: ReadonlySet<ConnectionStatus> = new Set(['online', 'busy', 'attention'])

type Step =
  | { kind: 'platform'; error?: string }
  | { kind: 'login'; platformId: PlatformId; windowClosed: boolean }
  | { kind: 'name'; platformId: PlatformId }

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
  const [step, setStep] = useState<Step>({ kind: 'platform' })
  const ids = useRef({ botId: createId('bot'), accountId: createId('acc') })
  /** Platform whose login is in flight and must be discarded unless finished. */
  const pendingLogin = useRef<PlatformId | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const morph = useMorphHeight<HTMLDivElement>()

  const stopListening = () => {
    unsubscribe.current?.()
    unsubscribe.current = null
  }

  const discardLogin = () => {
    stopListening()
    const platformId = pendingLogin.current
    if (!platformId) return
    pendingLogin.current = null
    void adapterRegistry
      .get(platformId)
      ?.cancelLogin?.(ids.current.accountId)
      .catch(() => {})
  }

  // Leaving without "Done" (Esc, scrim, close button, unmount) drops the session.
  useEffect(() => () => discardLogin(), [])

  const close = () => {
    discardLogin()
    onClose()
  }

  const toName = (platformId: PlatformId) => {
    stopListening()
    setStep({ kind: 'name', platformId })
  }

  const openLoginWindow = async (platformId: PlatformId) => {
    const adapter = adapterRegistry.get(platformId)
    if (!adapter?.openLogin) return
    setStep({ kind: 'login', platformId, windowClosed: false })
    try {
      const status = await adapter.openLogin(ids.current.accountId, ids.current.botId)
      if (LIVE.has(status)) toName(platformId)
    } catch (error) {
      discardLogin()
      setStep({ kind: 'platform', error: errorMessage(error) })
    }
  }

  const startLogin = (platformId: PlatformId) => {
    const adapter = adapterRegistry.get(platformId)
    if (!adapter) return
    // Adapters without an interactive login (the mock) go straight to naming.
    if (!adapter.openLogin) {
      setStep({ kind: 'name', platformId })
      return
    }
    pendingLogin.current = platformId
    const accountId = ids.current.accountId
    // Subscribe before opening so a session that already exists is not missed.
    stopListening()
    unsubscribe.current = adapter.subscribe((event: AdapterEvent) => {
      if (event.type === 'login' && event.accountId === accountId) {
        if (event.signedIn) toName(platformId)
        else if (event.windowClosed)
          setStep((s) => (s.kind === 'login' ? { ...s, windowClosed: true } : s))
      } else if (event.type === 'status' && event.accountId === accountId && LIVE.has(event.status)) {
        toName(platformId)
      }
    })
    void openLoginWindow(platformId)
  }

  const back = () => {
    discardLogin()
    // A fresh account id keeps late events from the abandoned window out.
    ids.current = { ...ids.current, accountId: createId('acc') }
    setStep({ kind: 'platform' })
  }

  const finish = (platformId: PlatformId, name: string, avatar: string | undefined) => {
    stopListening()
    pendingLogin.current = null
    addBot({
      id: ids.current.botId,
      platformId,
      name,
      avatar,
      accounts: [{ key: ids.current.accountId, accountId: ids.current.accountId, displayName: name, handle: '' }]
    })
  }

  const platform = step.kind === 'platform' ? undefined : getPlatform(step.platformId)
  const title =
    step.kind === 'platform' ? 'New bot' : step.kind === 'login' ? `Sign in to ${platform!.name}` : 'Name your bot'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={title}
      className="w-[min(92vw,420px)]"
      headerStart={
        step.kind === 'login' ? (
          <IconButton label="Back" size="sm" onClick={back} className="-ml-1">
            <ChevronLeft />
          </IconButton>
        ) : null
      }
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
      }}
    >
      <div
        className="overflow-hidden transition-[height] duration-[420ms] ease-spring-shape motion-reduce:transition-none"
        style={{ height: morph.height }}
      >
        <div ref={morph.ref}>
          {step.kind === 'platform' && (
            <PlatformStep key="platform" listRef={listRef} error={step.error} onPick={startLogin} />
          )}
          {step.kind === 'login' && (
            <LoginStep
              key="login"
              platformId={step.platformId}
              windowClosed={step.windowClosed}
              onReopen={() => void openLoginWindow(step.platformId)}
            />
          )}
          {step.kind === 'name' && (
            <NameStep
              key="name"
              platformId={step.platformId}
              defaultName={freshName(getPlatform(step.platformId).name, bots.map((b) => b.name))}
              onDone={(name, avatar) => finish(step.platformId, name, avatar)}
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

function LoginStep({
  platformId,
  windowClosed,
  onReopen
}: {
  platformId: PlatformId
  windowClosed: boolean
  onReopen: () => void
}) {
  const platform = getPlatform(platformId)
  return (
    <div className="flex animate-step-in flex-col items-center gap-4 pt-4 pb-2 text-center" role="status">
      <PlatformGlyph platform={platform} size="lg" />
      <p
        key={windowClosed ? 'closed' : 'waiting'}
        className={cn('animate-veil-in text-[14px] leading-5', windowClosed ? 'text-ink' : 'shimmer-text')}
      >
        {windowClosed ? 'The sign-in window was closed' : 'Waiting for you to sign in…'}
      </p>
      <Button variant={windowClosed ? 'primary' : 'secondary'} onClick={onReopen}>
        {windowClosed ? 'Open again' : 'Show window'}
      </Button>
    </div>
  )
}

function NameStep({
  platformId,
  defaultName,
  onDone
}: {
  platformId: PlatformId
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
            <BotAvatar emoji="🤖" seed={platformId} avatar={avatar} platformId={platformId} size="xl" />
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
