import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import type { AttachmentMeta } from '@adapters/types'
import { createId } from '@shared/id'
import { ArrowUp, FileText, Loader2, Paperclip, PlugZap, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'
import { formatBytes } from '@/lib/format'
import type { Bot, BotAccount } from '@/types'

interface ComposerProps {
  bot: Bot
  account: BotAccount | undefined
  onSend: (text: string, attachments: AttachmentMeta[]) => void
  onConnect: (accountId: string) => void
}

const MAX_HEIGHT_PX = 200

function toAttachments(files: FileList | File[]): AttachmentMeta[] {
  return Array.from(files).map((file) => ({
    id: createId('att'),
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream'
  }))
}

function ConnectionNotice({ account, onConnect }: { account: BotAccount; onConnect: () => void }) {
  const isError = account.status === 'error'
  return (
    <div
      className={cn(
        'mb-2 flex items-center gap-3 rounded-xl border px-3 py-2 text-ui',
        isError
          ? 'border-status-error/25 bg-status-error/5 text-status-error-ink'
          : 'border-line bg-canvas text-ink-secondary'
      )}
      role="status"
    >
      <PlugZap className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {isError
          ? (account.statusDetail ?? `${account.displayName} hit a connection error.`)
          : `${account.displayName} is offline. Connect to send messages.`}
      </span>
      <Button size="sm" variant="secondary" onClick={onConnect} disabled={account.pending}>
        {account.pending && <Loader2 className="animate-spin" aria-hidden />}
        {account.pending ? 'Connecting' : isError ? 'Reconnect' : 'Connect'}
      </Button>
    </div>
  )
}

export function Composer({ bot, account, onSend, onConnect }: ComposerProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([])
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const connected = account?.status === 'online' || account?.status === 'busy'
  const hasContent = text.trim().length > 0 || attachments.length > 0
  const canSend = connected && hasContent

  const resize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
  }

  const submit = () => {
    if (!canSend) return
    onSend(text, attachments)
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
    setAttachments((current) => [...current, ...toAttachments(files)])
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  return (
    <div className="shrink-0 px-6 pt-2 pb-5">
      <div className="mx-auto max-w-3xl">
        {account && !connected && <ConnectionNotice account={account} onConnect={() => onConnect(account.id)} />}

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
            'rounded-2xl border border-line-strong bg-surface shadow-card transition-[border-color,box-shadow]',
            'focus-within:border-accent-300 focus-within:ring-4 focus-within:ring-accent-100/70',
            dragging && 'border-accent-400 ring-4 ring-accent-100'
          )}
        >
          {attachments.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 px-3 pt-3" aria-label="Attachments">
              {attachments.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center gap-2 rounded-lg border border-line bg-canvas py-1 pr-1 pl-2 text-caption"
                >
                  <FileText className="size-3.5 text-accent-600" aria-hidden />
                  <span className="max-w-40 truncate font-medium text-ink">{file.name}</span>
                  <span className="text-ink-muted">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setAttachments((current) => current.filter((f) => f.id !== file.id))}
                    className="grid size-5 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

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
            placeholder={`Message ${bot.name}…`}
            aria-label={`Message ${bot.name}`}
            className="block max-h-[200px] min-h-11 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[13.5px] leading-[1.55] text-ink outline-none placeholder:text-ink-muted"
          />

          <div className="flex items-center gap-2 px-2.5 pb-2.5">
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
            <IconButton label="Attach files" onClick={() => fileInputRef.current?.click()}>
              <Paperclip />
            </IconButton>
            {account && (
              <span className="truncate text-caption text-ink-muted">
                as <span className="font-medium text-ink-secondary">{account.displayName}</span>
              </span>
            )}
            <span className="ml-auto hidden text-caption text-ink-faint sm:inline">
              Enter to send · Shift + Enter for a new line
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="Send message"
              title="Send"
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-lg transition-colors',
                canSend
                  ? 'bg-accent-600 text-white shadow-soft hover:bg-accent-700'
                  : 'bg-sunken text-ink-faint'
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
