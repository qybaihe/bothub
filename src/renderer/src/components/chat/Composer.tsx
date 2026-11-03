import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import type { AttachmentMeta } from '@adapters/types'
import { createId } from '@shared/id'
import { ArrowUp, FileText, Loader2, LogIn, Plus, PlugZap, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'
import { formatBytes } from '@/lib/format'
import type { Bot, BotAccount } from '@/types'
import { t } from '@/lib/i18n'

interface ComposerProps {
  bot: Bot
  account: BotAccount | undefined
  onSend: (text: string, attachments: AttachmentMeta[]) => void
  onConnect: (accountId: string) => void
  onMuseLogin?: (accountId: string) => void
  onGrokLogin?: (accountId: string) => void
  /** The empty conversation already shows its own sign-in action. */
  hideNotice?: boolean
}

const MAX_HEIGHT_PX = 200

const MAX_IMAGE_ATTACHMENT_BYTES = 12 * 1024 * 1024
/** Non-image ≥10MiB uses file_ref (fs.write); allow up to 40MiB in BotHub. */
const MAX_FILE_ATTACHMENT_BYTES = 40 * 1024 * 1024

async function fileToAttachment(file: File): Promise<AttachmentMeta> {
  const mimeType = file.type || 'application/octet-stream'
  const base: AttachmentMeta = {
    id: createId('att'),
    name: file.name,
    size: file.size,
    mimeType
  }
  const isImage = mimeType.startsWith("image/")
  const limit = isImage ? MAX_IMAGE_ATTACHMENT_BYTES : MAX_FILE_ATTACHMENT_BYTES
  if (file.size > limit) {
    return base // no dataBase64 → Composer shows oversized notice
  }
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return { ...base, dataBase64: btoa(binary) }
}

async function toAttachments(files: FileList | File[]): Promise<AttachmentMeta[]> {
  return Promise.all(Array.from(files).map((file) => fileToAttachment(file)))
}

function ConnectionNotice({
  account,
  onConnect,
  onMuseLogin,
  onGrokLogin
}: {
  account: BotAccount
  onConnect: () => void
  onMuseLogin?: () => void
  onGrokLogin?: () => void
}) {
  const isError = account.status === 'error'
  const isMuse = account.platformId === 'meta-muse'
  const isGrok = account.platformId === 'grok'
  return (
    <div
      className={cn(
        'mb-2 flex animate-step-in flex-wrap items-center gap-2 rounded-xl border py-1.5 pr-1.5 pl-3',
        isError ? 'border-status-error/20 bg-status-error/5 text-status-error' : 'border-line bg-surface text-ink'
      )}
      role="status"
    >
      {isMuse ? (
        <LogIn className="size-4 shrink-0 text-accent-600" aria-hidden />
      ) : (
        <PlugZap className="size-4 shrink-0 text-ink-muted" aria-hidden />
      )}
      <span className="min-w-0 flex-1 text-[13px]">
        {isError
          ? (account.statusDetail ?? '连接出错')
          : isMuse
            ? '登录 Muse 后即可发消息'
            : isGrok
              ? '登录 Grok Bot 后即可发消息'
              : '账号未连接'}
      </span>
      {isMuse && onMuseLogin && !isError ? (
        <>
          <Button size="sm" variant="primary" onClick={onMuseLogin} disabled={account.pending}>
            {account.pending && <Loader2 className="animate-spin" aria-hidden />}
            {account.pending ? '登录中…' : '使用 Muse 登录'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onConnect} disabled={account.pending}>
            已完成登录
          </Button>
        </>
      ) : isGrok && onGrokLogin ? (
        <>
          <Button size="sm" variant="primary" onClick={onGrokLogin} disabled={account.pending}>
            {account.pending && <Loader2 className="animate-spin" aria-hidden />}
            {account.pending ? '登录中…' : '使用 Grok Bot 登录'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onConnect} disabled={account.pending}>
            刷新连接
          </Button>
        </>
      ) : (
        <Button size="sm" variant="secondary" onClick={onConnect} disabled={account.pending}>
          {account.pending && <Loader2 className="animate-spin" aria-hidden />}
          {account.pending ? '连接中' : isError ? '重试' : '连接'}
        </Button>
      )}
    </div>
  )
}

export function Composer({ bot, account, onSend, onConnect, onMuseLogin, onGrokLogin, hideNotice = false }: ComposerProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([])
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const connected = account?.status === 'online' || account?.status === 'busy' || account?.status === 'attention'
  const [multiline, setMultiline] = useState(false)
  const expanded = multiline || attachments.length > 0
  const hasContent = text.trim().length > 0 || attachments.length > 0
  const canSend = connected && hasContent

  // The palette asks for focus after jumping to a bot.
  useEffect(() => {
    const focus = () => textareaRef.current?.focus()
    window.addEventListener('bothub:focus-composer', focus)
    return () => window.removeEventListener('bothub:focus-composer', focus)
  }, [])

  const resize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
    setMultiline(el.scrollHeight > 40)
  }

  const submit = () => {
    if (!canSend) return
    const sendable = attachments.filter((a) => a.dataBase64)
    if (!text.trim() && sendable.length === 0) return
    onSend(text, sendable)
    setText('')
    setAttachments([])
    requestAnimationFrame(resize)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Respect IME composition (e.g. Chinese/Japanese input) before sending.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  const addFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return
    void toAttachments(files).then((next) => {
      setAttachments((current) => [...current, ...next])
    })
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  return (
    <div className="shrink-0 px-6 pt-2 pb-5">
      <div className="mx-auto max-w-[860px] px-2">
        {account && !connected && !hideNotice && (
          <ConnectionNotice
            account={account}
            onConnect={() => onConnect(account.id)}
            onMuseLogin={onMuseLogin ? () => onMuseLogin(account.id) : undefined}
            onGrokLogin={onGrokLogin ? () => onGrokLogin(account.id) : undefined}
          />
        )}

        <div
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault()
              setDragging(true)
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'border border-line-strong bg-surface p-[7px] shadow-card transition-[border-color,box-shadow,border-radius] duration-200',
            expanded ? 'rounded-[18px]' : 'rounded-[22px]',
            'focus-within:border-ink/20',
            dragging && 'border-accent-600 ring-4 ring-accent-100'
          )}
        >
          {attachments.some((f) => !f.dataBase64) && (
            <p className="px-1 pb-1 text-[12px] text-status-error">
              {t('Some files are too large to send inline (max 12 MB).')}
            </p>
          )}
          {attachments.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 px-1 pt-0.5 pb-1.5" aria-label={t('Attachments')}>
              {attachments.map((file) => (
                <li
                  key={file.id}
                  className="flex animate-mark-pop items-center gap-2 rounded-lg bg-hover py-1 pr-1 pl-2 text-[12px]"
                >
                  <FileText className="size-3.5 text-ink-secondary" aria-hidden />
                  <span className="max-w-40 truncate text-ink">{file.name}</span>
                  <span className="text-ink-muted tabular-nums">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setAttachments((current) => current.filter((f) => f.id !== file.id))}
                    className="press-icon grid size-5 place-items-center rounded-md text-ink-muted hover:bg-active hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                addFiles(event.target.files)
                event.target.value = ''
              }}
            />
            <IconButton label={t('Attach files')} onClick={() => fileInputRef.current?.click()}>
              <Plus />
            </IconButton>
            <textarea
              ref={textareaRef}
              value={text}
              rows={1}
              onChange={(event) => {
                setText(event.target.value)
                resize()
              }}
              onKeyDown={onKeyDown}
              onPaste={(event) => {
                if (event.clipboardData.files.length > 0) {
                  event.preventDefault()
                  addFiles(event.clipboardData.files)
                }
              }}
              placeholder={t('Message {name}', { name: bot.name })}
              aria-label={`Message ${bot.name}`}
              className="block max-h-[200px] min-h-8 flex-1 resize-none bg-transparent px-1 py-[5px] text-[14px] leading-[22px] text-ink outline-none placeholder:text-ink-muted"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label={t('Send message')}
              title={t('Send (Enter)')}
              className={cn(
                'press-icon grid size-8 shrink-0 place-items-center rounded-full',
                canSend ? 'bg-accent-600 text-white hover:bg-accent-700' : 'bg-hover text-ink-faint'
              )}
            >
              <ArrowUp className="size-4" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
