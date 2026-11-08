import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { getPlatform } from '@adapters/platforms'
import { adapterRegistry } from '@adapters/registry'
import type { PlatformId } from '@adapters/types'
import { createId } from '@shared/id'
import { Camera, ChevronLeft, ChevronRight, ListPlus } from 'lucide-react'
import { MuseBatchImport } from './MuseBatchImport'
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
import { BLANK_TEMPLATE, BOT_TEMPLATES, localizeTemplate, type BotTemplate } from '@/data/botTemplates'
import { useT } from '@/lib/i18n'
import { usePrefsStore } from '@/store/prefsStore'
import { t as tStatic } from '@/lib/i18n'

const NAME_MAX = 40

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : tStatic('Something went wrong.')
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
  const [template, setTemplate] = useState<BotTemplate>(BLANK_TEMPLATE)
  const [batch, setBatch] = useState(false)
  const { phase } = login
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)

  const close = () => {
    // Leaving before "Done" (Esc, scrim, close button) drops the session.
    login.discard()
    onClose()
  }

  const finish = (platformId: PlatformId, name: string, avatar: string | undefined) => {
    login.keep()
    created.current = true
    const picked = localizeTemplate(template, locale)
    addBot({
      id: botId,
      platformId,
      name,
      avatar,
      emoji: picked.emoji,
      description: picked.id === 'blank' ? undefined : picked.description,
      notes: picked.starter ? `${t('Starter brief')}（${picked.name}）:\n${picked.starter}` : undefined,
      accounts: [{ key: login.accountId, accountId: login.accountId, displayName: name, handle: '' }]
    })
  }

  const platform = phase.kind === 'idle' ? undefined : getPlatform(phase.platformId)
  const title = batch
    ? t('Batch import Muse accounts')
    : phase.kind === 'idle'
      ? t('New bot')
      : phase.kind === 'waiting'
        ? t('Sign in to {name}', { name: platform!.name })
        : t('Set up your bot')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title={title}
      className={batch ? 'w-[min(92vw,520px)]' : 'w-[min(92vw,420px)]'}
      headerStart={
        batch ? (
          <IconButton label={t('Back')} size="sm" onClick={() => setBatch(false)} className="-ml-1">
            <ChevronLeft />
          </IconButton>
        ) : phase.kind === 'waiting' ? (
          <IconButton label={t('Back')} size="sm" onClick={login.discard} className="-ml-1">
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
          {batch && (
            <MuseBatchImport
              key="batch"
              onDone={() => {
                created.current = true
                onClose()
              }}
            />
          )}
          {!batch && phase.kind === 'idle' && (
            <PlatformStep
              key="platform"
              listRef={listRef}
              error={phase.error}
              onPick={login.start}
              onBatch={() => setBatch(true)}
            />
          )}
          {!batch && phase.kind === 'waiting' && (
            <LoginWaiting
              key="login"
              platformId={phase.platformId}
              accountId={login.accountId}
              windowClosed={phase.windowClosed}
              onReopen={login.reopen}
            />
          )}
          {!batch && phase.kind === 'signed-in' && (
            <NameStep
              key="name"
              platformId={phase.platformId}
              template={template}
              onTemplate={setTemplate}
              defaultName={freshName(
                localizeTemplate(template, locale).name || getPlatform(phase.platformId).name,
                bots.map((b) => b.name)
              )}
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
  onPick,
  onBatch
}: {
  listRef: RefObject<HTMLUListElement | null>
  error?: string
  onPick: (platformId: PlatformId) => void
  onBatch: () => void
}) {
  const platforms = adapterRegistry.listPlatforms().filter((p) => p.usable)
  const t = useT()
  return (
    <div className="animate-veil-in">
      <p className="mb-3 rounded-lg bg-hover px-3 py-2 text-[12px] leading-[17px] text-ink-secondary">
        {t('In BotHub, one bot = one signed-in account. Pick a platform and sign in — that account becomes this bot. Add another bot to use another account.')}
      </p>
      <p className="mb-1 px-2 text-[12px] font-medium text-ink-muted">{t('Choose a platform to sign in')}</p>
      <ul ref={listRef} className="flex flex-col gap-0.5" onKeyDown={moveFocus} aria-label={t('Platforms')}>
        {platforms.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p.id)}
              className={cn(
                'group flex h-12 w-full items-center gap-3 rounded-[10px] px-2 text-left transition-colors duration-100',
                'hover:bg-hover active:bg-active'
              )}
            >
              <PlatformGlyph platform={p} size="md" />
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink">
                {p.name}
              </span>
              <ChevronRight
                className="size-4 text-ink-muted opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onBatch}
        className="mt-2 flex h-10 w-full items-center gap-2.5 rounded-[10px] border border-dashed border-line px-3 text-left text-[13px] text-ink-secondary transition-colors hover:border-ink/20 hover:bg-hover hover:text-ink"
      >
        <ListPlus className="size-4" aria-hidden />
        <span className="flex-1">{t('Batch import Muse accounts')}</span>
        <span className="text-[11px] text-ink-muted">{t('email | inbox link')}</span>
      </button>
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
  accountId,
  windowClosed,
  onReopen
}: {
  platformId: PlatformId
  accountId?: string
  windowClosed: boolean
  onReopen: () => void
}) {
  const platform = getPlatform(platformId)
  const actionRef = useRef<HTMLButtonElement>(null)
  const t = useT()
  const [dotBusy, setDotBusy] = useState(false)
  const [dotErr, setDotErr] = useState('')
  const [dotRaw, setDotRaw] = useState('')
  const [dotRt, setDotRt] = useState('')
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => actionRef.current?.focus(), [])

  const quickImportRaw = async () => {
    if (!accountId || (!dotRaw.trim() && !dotRt.trim()) || !window.electron?.dot?.importCredentials) return
    setDotBusy(true)
    setDotErr('')
    try {
      await window.electron.dot.importCredentials({
        accountId,
        rawInput: dotRaw.trim(),
        refreshToken: dotRt.trim() || undefined
      })
      await window.electron.dot.cancelLogin?.(accountId).catch(() => undefined)
    } catch (e) {
      setDotErr(errorMessage(e))
    } finally {
      setDotBusy(false)
    }
  }

  const quickImportHarkRaw = async () => {
    if (!accountId || !dotRaw.trim() || !window.electron?.hark?.importCredentials) return
    setDotBusy(true)
    setDotErr('')
    try {
      const st = await window.electron.hark.importCredentials({
        accountId,
        rawInput: dotRaw.trim()
      })
      if (!st.signedIn) {
        setDotErr('未检测到有效 Hark 会话，请检查 Cookie / Session Token 是否有效')
        return
      }
      await window.electron.hark.cancelLogin?.(accountId).catch(() => undefined)
    } catch (e) {
      setDotErr(errorMessage(e))
    } finally {
      setDotBusy(false)
    }
  }

  return (
    <div className="flex animate-step-in flex-col items-center gap-4 pt-4 pb-2 text-center" role="status">
      <PlatformGlyph platform={platform} size="lg" />
      <p
        key={windowClosed ? 'closed' : 'waiting'}
        className={cn('animate-veil-in text-[14px] leading-5', windowClosed ? 'text-ink' : 'shimmer-text')}
      >
        {windowClosed ? t('The sign-in window was closed') : t('Waiting for you to sign in…')}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button ref={actionRef} variant={windowClosed ? 'primary' : 'secondary'} onClick={onReopen}>
          {windowClosed ? t('Open again') : t('Show window')}
        </Button>
        {platformId === 'dot' && accountId && (
          <Button variant="ghost" disabled={dotBusy} onClick={() => setShowRaw((v) => !v)}>
            导入 AT / RT 凭据
          </Button>
        )}
        {platformId === 'hark' && accountId && (
          <Button variant="ghost" disabled={dotBusy} onClick={() => setShowRaw((v) => !v)}>
            导入 Cookie / Token
          </Button>
        )}
      </div>
      {platformId === 'dot' && showRaw && (
        <div className="flex w-full flex-col gap-1.5 text-left">
          <textarea
            value={dotRaw}
            onChange={(e) => setDotRaw(e.target.value)}
            placeholder="粘贴 ChatGPT access_token (eyJ...)、refresh_token (rt_...) 或 JSON (auth.json)…"
            rows={3}
            className="w-full rounded-lg border border-line bg-surface p-2 font-mono text-[11px] text-ink outline-none"
          />
          <input
            value={dotRt}
            onChange={(e) => setDotRt(e.target.value)}
            placeholder="可选：单独填写 refresh_token (rt_...) 用于自动续期"
            className="h-7 w-full rounded-lg border border-line bg-surface px-2 font-mono text-[11px] text-ink outline-none"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={dotBusy || (!dotRaw.trim() && !dotRt.trim())}
            onClick={() => void quickImportRaw()}
          >
            {dotBusy ? '正在验证凭据…' : '导入凭据并继续'}
          </Button>
        </div>
      )}
      {platformId === 'hark' && showRaw && (
        <div className="flex w-full flex-col gap-1.5 text-left">
          <textarea
            value={dotRaw}
            onChange={(e) => setDotRaw(e.target.value)}
            placeholder="粘贴 Hark Cookie 字符串（含 __Secure-hark.session_token=...）或 Session Token…"
            rows={3}
            className="w-full rounded-lg border border-line bg-surface p-2 font-mono text-[11px] text-ink outline-none"
          />
          <Button
            size="sm"
            variant="primary"
            disabled={dotBusy || !dotRaw.trim()}
            onClick={() => void quickImportHarkRaw()}
          >
            {dotBusy ? '正在验证会话…' : '导入凭据并继续'}
          </Button>
        </div>
      )}
      {dotErr && <p className="text-[12px] text-status-error">{dotErr}</p>}
    </div>
  )
}

function NameStep({
  platformId,
  template,
  onTemplate,
  defaultName,
  onDone
}: {
  platformId: PlatformId
  template: BotTemplate
  onTemplate: (template: BotTemplate) => void
  defaultName: string
  onDone: (name: string, avatar: string | undefined) => void
}) {
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | undefined>()
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const finalName = name.trim() || defaultName
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)
  const emoji = template.emoji
  const starter = localizeTemplate(template, locale).starter

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
          aria-label={avatar ? t('Change photo') : t('Add a photo')}
          title={avatar ? t('Change photo') : t('Add a photo')}
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
          aria-label={t('Bot name')}
          className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-center text-[14px] text-ink outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-ink-muted focus:border-accent-600 focus:ring-3 focus:ring-accent-100"
        />
        {starter && (
          <p className="rounded-lg bg-hover px-3 py-2 text-left text-[12px] leading-[17px] text-ink-secondary">
            <span className="font-medium text-ink">{t('Starter brief')}</span>
            {t(' — saved to Notes. Send it as your first message to set the bot up; Muse has no separate persona setting.')}
          </p>
        )}
        <TemplateStep selected={template.id} onPick={onTemplate} />
        {error && (
          <p className="text-center text-[12px] text-status-error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex w-full items-center justify-end gap-2">
        {avatar && (
          <Button variant="ghost" className="mr-auto -ml-2" onClick={() => setAvatar(undefined)}>
            {t('Remove photo')}
          </Button>
        )}
        <Button variant="primary" type="submit">
          {t('Done')}
        </Button>
      </div>
    </form>
  )
}


/** Optional starting style (local presets). Picked after sign-in; Blank = none. */
function TemplateStep({ selected, onPick }: { selected: string; onPick: (template: BotTemplate) => void }) {
  const t = useT()
  const locale = usePrefsStore((s) => s.locale)
  return (
    <div className="mt-1 flex flex-col gap-1.5" role="radiogroup" aria-label={t('Starting style (optional)')}>
      <p className="px-0.5 text-left text-[12px] font-medium text-ink-muted">{t('Starting style (optional)')}</p>
      <ul className="grid grid-cols-2 gap-1.5">
        {BOT_TEMPLATES.map((raw) => {
          const tpl = localizeTemplate(raw, locale)
          const on = selected === raw.id
          return (
            <li key={raw.id}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPick(raw)}
                title={tpl.description}
                className={cn(
                  'press flex h-full w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                  on ? 'border-accent-600 bg-accent-50' : 'border-line bg-surface hover:border-line-strong hover:bg-hover'
                )}
              >
                <span className="text-[16px] leading-none" aria-hidden>
                  {raw.id === 'blank' ? '＋' : tpl.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium text-ink">
                    {raw.id === 'blank' ? t('None') : tpl.name}
                  </span>
                  <span className="block truncate text-[11px] text-ink-muted">{tpl.description}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
