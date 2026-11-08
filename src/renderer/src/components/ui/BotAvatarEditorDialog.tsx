import { useRef, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import {
  BOT_COLORS,
  BOT_SHAPES,
  GrokBotMark,
  getBotColorHex,
  resolveBotColor,
  resolveBotShape,
  type BotColorId,
  type BotShape
} from '@/components/ui/GrokBotMark'
import { avatarFromFile } from '@/lib/avatarImage'
import { cn } from '@/lib/cn'
import { useBotStore } from '@/store/botStore'
import type { Bot } from '@/types'
import { t } from '@/lib/i18n'

interface BotAvatarEditorDialogProps {
  bot: Bot
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Mirrors Grok Bot's `AgentAvatarEditor` (`Bot | Photo` tabs):
 * - Bot tab: live interactive GrokBotMark preview + 26 shapes grid (5 per row) + 11 colors row
 * - Photo tab: upload custom image or switch back to animated Bot
 */
export function BotAvatarEditorDialog({ bot, open, onOpenChange }: BotAvatarEditorDialogProps) {
  const setBotAvatar = useBotStore((s) => s.setBotAvatar)
  const setBotCharacter = useBotStore((s) => s.setBotCharacter)
  const [tab, setTab] = useState<'bot' | 'upload'>(bot.avatar ? 'upload' : 'bot')
  const [poke, setPoke] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const currentShape = resolveBotShape(bot.id, bot.avatarShape)
  const currentColor = resolveBotColor(bot.id, bot.avatarColor)
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'

  const selectShape = (shape: BotShape) => {
    if (bot.avatar) setBotAvatar(bot.id, undefined)
    setBotCharacter(bot.id, { shape, color: bot.avatarColor ?? currentColor })
    setPoke((n) => n + 1)
  }

  const selectColor = (color: BotColorId) => {
    if (bot.avatar) setBotAvatar(bot.id, undefined)
    setBotCharacter(bot.id, { shape: bot.avatarShape ?? currentShape, color })
    setPoke((n) => n + 1)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('Bot appearance')} className="max-w-[360px]">
      <div className="mb-3 flex rounded-lg bg-hover p-0.5 text-[12px]" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'bot'}
          onClick={() => setTab('bot')}
          className={cn(
            'flex-1 rounded-md py-1 font-medium transition-colors',
            tab === 'bot' ? 'bg-surface text-ink shadow-soft' : 'text-ink-secondary hover:text-ink'
          )}
        >
          Bot
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'upload'}
          onClick={() => setTab('upload')}
          className={cn(
            'flex-1 rounded-md py-1 font-medium transition-colors',
            tab === 'upload' ? 'bg-surface text-ink shadow-soft' : 'text-ink-secondary hover:text-ink'
          )}
        >
          {t('Photo')}
        </button>
      </div>

      {tab === 'bot' ? (
        <div className="flex flex-col items-center gap-3">
          {/* Live Interactive Character Stage */}
          <div
            onClick={() => setPoke((n) => n + 1)}
            title="Click to poke!"
            className="flex size-24 cursor-pointer items-center justify-center rounded-2xl bg-hover/60 transition-transform active:scale-95"
          >
            <GrokBotMark
              seed={bot.id}
              shape={currentShape}
              color={currentColor}
              sizePx={72}
              followPointer
              pokeSignal={poke}
            />
          </div>

          {/* 26 Shapes Grid (5 columns like Grok Bot) */}
          <div
            aria-label="Bot shapes"
            className="grid max-h-[210px] w-full grid-cols-5 gap-1.5 overflow-y-auto rounded-xl bg-hover/40 p-2"
          >
            {BOT_SHAPES.map((s) => {
              const selected = !bot.avatar && currentShape === s
              return (
                <button
                  key={s}
                  type="button"
                  title={s}
                  aria-pressed={selected}
                  onClick={() => selectShape(s)}
                  className={cn(
                    'press-icon flex size-12 items-center justify-center rounded-xl transition-all',
                    selected ? 'bg-surface ring-2 ring-ink shadow-soft' : 'hover:bg-surface/70'
                  )}
                >
                  <GrokBotMark seed={bot.id} shape={s} color={currentColor} sizePx={36} isPaused />
                </button>
              )
            })}
          </div>

          {/* 11 Colors Palette */}
          <div aria-label="Bot colors" className="flex flex-wrap items-center justify-center gap-1.5 py-1">
            {BOT_COLORS.map((c) => {
              const selected = !bot.avatar && currentColor === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  aria-pressed={selected}
                  onClick={() => selectColor(c.id)}
                  className={cn(
                    'press-icon grid size-6 place-items-center rounded-full transition-transform',
                    selected && 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface'
                  )}
                >
                  <span className="size-4.5 rounded-full" style={{ backgroundColor: getBotColorHex(c.id, isDark) }} />
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4">
          {bot.avatar ? (
            <img src={bot.avatar} alt="" className="size-24 rounded-full object-cover ring-1 ring-line" />
          ) : (
            <div className="flex size-24 items-center justify-center rounded-full bg-hover">
              <GrokBotMark seed={bot.id} shape={currentShape} color={currentColor} sizePx={64} />
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                void avatarFromFile(file).then(
                  (avatar) => {
                    setBotAvatar(bot.id, avatar)
                    onOpenChange(false)
                  },
                  () => {}
                )
              }
            }}
          />
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => fileRef.current?.click()}>
              {bot.avatar ? t('Change photo') : t('Add a photo')}
            </Button>
            {bot.avatar && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setBotAvatar(bot.id, undefined)
                  setTab('bot')
                }}
              >
                {t('Use animated Bot')}
              </Button>
            )}
          </div>
        </div>
      )}
    </Dialog>
  )
}
