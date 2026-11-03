import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { useBotStore } from '@/store/botStore'

interface ConfigureSectionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Local-only section editor (Grok "Configure sections" chrome).
 * Renames / deletes workspace groups; does not call any host sidebar APIs.
 */
export function ConfigureSectionsDialog({ open, onOpenChange }: ConfigureSectionsDialogProps) {
  const groups = useBotStore((s) => s.groups)
  const bots = useBotStore((s) => s.bots)
  const renameGroup = useBotStore((s) => s.renameGroup)
  const removeGroup = useBotStore((s) => s.removeGroup)
  const addGroup = useBotStore((s) => s.addGroup)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const openChange = (next: boolean) => {
    if (next) {
      const nextDrafts: Record<string, string> = {}
      for (const g of useBotStore.getState().groups) nextDrafts[g.id] = g.name
      setDrafts(nextDrafts)
    }
    onOpenChange(next)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={openChange}
      title="Configure sections"
      description="Organize bots into sidebar sections. Local to this workspace."
      showDescription
      className="max-w-[380px]"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const id = addGroup()
              setDrafts((d) => ({ ...d, [id]: useBotStore.getState().groups.find((g) => g.id === id)?.name ?? 'New section' }))
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            New section
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      }
    >
      <ul className="flex flex-col gap-2">
        {groups.map((group) => {
          const count = bots.filter((b) => b.groupId === group.id).length
          const only = groups.length <= 1
          return (
            <li key={group.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-2.5 py-2">
              <input
                value={drafts[group.id] ?? group.name}
                aria-label={`Section name for ${group.name}`}
                maxLength={40}
                onChange={(event) => setDrafts((d) => ({ ...d, [group.id]: event.target.value }))}
                onBlur={() => {
                  const next = (drafts[group.id] ?? group.name).trim()
                  if (next) renameGroup(group.id, next)
                  else setDrafts((d) => ({ ...d, [group.id]: group.name }))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                }}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none"
              />
              <span className="shrink-0 text-[12px] tabular-nums text-ink-muted">{count}</span>
              <IconButton
                label={only ? 'Keep at least one section' : count > 0 ? 'Bots move to another section' : 'Delete section'}
                disabled={only}
                onClick={() => {
                  removeGroup(group.id)
                  setDrafts((d) => {
                    const { [group.id]: _drop, ...rest } = d
                    return rest
                  })
                }}
              >
                <Trash2 />
              </IconButton>
            </li>
          )
        })}
      </ul>
    </Dialog>
  )
}
