import { useCallback, useEffect, useState } from 'react'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

type GoalItem = {
  id: string
  title: string
  description?: string
  status?: string
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function parseGoals(raw: unknown): GoalItem[] {
  const root = asObj(raw) || {}
  const list =
    (Array.isArray(root['goals']) && root['goals']) ||
    (Array.isArray(root['items']) && root['items']) ||
    (Array.isArray(root['results']) && root['results']) ||
    (Array.isArray(raw) ? raw : [])
  const out: GoalItem[] = []
  for (const row of list.slice(0, 30)) {
    const o = asObj(row)
    if (!o) continue
    const id = String(o['id'] ?? o['goal_id'] ?? out.length)
    const title = String(o['title'] ?? o['name'] ?? o['prompt'] ?? o['summary'] ?? id)
    const description = o['description'] ? String(o['description']).slice(0, 200) : undefined
    const status = o['status'] ? String(o['status']) : undefined
    out.push({ id, title, description, status })
  }
  return out
}

export function GoalsSection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const [items, setItems] = useState<GoalItem[]>([])
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [unavailable, setUnavailable] = useState(false)

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) {
      setUnavailable(true)
      return
    }
    setLoading(true)
    setError(undefined)
    setUnavailable(false)
    try {
      const raw = await muse.rpc({ accountId, method: 'goals.list', params: {} })
      const next = parseGoals(raw)
      setItems(next)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/404|not.?found|unsupported|unknown.?method/i.test(msg)) {
        setUnavailable(true)
      } else {
        setError(msg)
      }
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === 'online' || status === 'busy' || status === 'attention') void refresh()
  }, [refresh, status])

  const submitGoalPrompt = async () => {
    const text = prompt.trim()
    if (!text) return
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setBusy(true)
    setError(undefined)
    try {
      await muse.rpc({ accountId, method: 'goal_prompt', params: { prompt: text, text } })
      setPrompt('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const removeGoal = async (id: string) => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setBusy(true)
    setError(undefined)
    try {
      await muse.rpc({ accountId, method: 'goals.delete', params: { id } })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title={t('Goals')}
      count={items.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2">
        <div className="flex gap-1.5">
          <TextInput
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitGoalPrompt()
            }}
            placeholder="添加长期目标…"
            aria-label="Goal prompt"
            className="h-7 flex-1 text-[12px]"
          />
          <Button size="sm" variant="secondary" disabled={busy || !prompt.trim()} onClick={() => void submitGoalPrompt()}>
            {t('Add')}
          </Button>
        </div>
        {error && <p className="text-[12px] text-status-error">{error}</p>}
        {unavailable && items.length === 0 ? (
          <EmptyLine>目标功能暂不可用</EmptyLine>
        ) : items.length === 0 ? (
          <EmptyLine>暂无长期目标</EmptyLine>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((g) => (
              <li key={g.id} className="flex items-start justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-medium text-ink">{g.title}</p>
                  {g.description && <p className="mt-0.5 text-[11.5px] text-ink-secondary">{g.description}</p>}
                </div>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeGoal(g.id)}>
                  {t('Delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}
