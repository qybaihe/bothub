import { useCallback, useEffect, useState } from 'react'
import { Monitor, Play, RefreshCw, Square } from 'lucide-react'
import { Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { useBotStore } from '@/store/botStore'
import { t } from '@/lib/i18n'

type ComputerContextSnap = {
  taskId?: string
  sha256?: string
  status?: string
  url?: string
  title?: string
  raw: Record<string, unknown>
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function parseContext(raw: unknown): ComputerContextSnap {
  const root = asObj(raw) || {}
  const nested = asObj(root['context']) || asObj(root['result']) || asObj(root['task']) || root
  const preview = asObj(nested['preview']) || asObj(nested['latest_preview']) || nested
  const taskId = str(
    nested['task_id'] ||
      nested['taskId'] ||
      preview['task_id'] ||
      preview['taskId'] ||
      nested['active_task_id'] ||
      nested['id']
  )
  const sha256 = str(preview['sha256'] || preview['hash'] || nested['sha256'] || nested['preview_sha256'])
  return {
    taskId: taskId || undefined,
    sha256: sha256 || undefined,
    status: str(nested['status'] || nested['state']) || undefined,
    url: str(nested['url'] || nested['current_url'] || preview['url']) || undefined,
    title: str(nested['title'] || preview['title']) || undefined,
    raw: nested
  }
}

/**
 * Muse Computer & Remote Browser Tab (`computer.*` + `browser_task.*` + `browser.*`).
 *
 * Connects to Muse's real `computer.context`, `computer.preview`, `browser.debug_access.get`,
 * and `browser_task.*` (get / lease_info / stop / release / refresh_environment).
 */
export function ComputerSection({ accountId }: { accountId: string }) {
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const toggleWebSession = useBotStore((s) => s.toggleWebSession)
  const webSessionOpen = useBotStore((s) => s.webSessionOpen)

  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [hint, setHint] = useState<string>()
  const [ctx, setCtx] = useState<ComputerContextSnap | null>(null)
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null)
  const [manualTaskId, setManualTaskId] = useState('')
  const [taskDetail, setTaskDetail] = useState<Record<string, unknown> | null>(null)
  const [vmHealth, setVmHealth] = useState<string>('RUNNING')

  const loadPreview = useCallback(
    async (taskId: string, sha256: string) => {
      const muse = getBridge()?.muse
      if (!muse?.rpc || !taskId || !sha256) return
      try {
        const res = await muse.rpc({
          accountId,
          method: 'computer.preview',
          params: { task_id: taskId, sha256 }
        })
        const o = asObj(res)
        if (o && typeof o['dataBase64'] === 'string' && o['dataBase64']) {
          const mime = typeof o['contentType'] === 'string' ? o['contentType'] : 'image/png'
          setPreviewDataUrl(`data:${mime};base64,${o['dataBase64']}`)
        }
      } catch {
        /* preview optional */
      }
    },
    [accountId]
  )

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setLoading(true)
    setError(undefined)
    try {
      const [ctxRaw, healthRaw] = await Promise.all([
        muse.rpc({ accountId, method: 'computer.context', params: {} }).catch(() => null),
        muse.rpc({ accountId, method: 'vm.health', params: {} }).catch(() => null)
      ])
      if (healthRaw) {
        const h = asObj(healthRaw)
        setVmHealth(str(h?.['status'] ?? h?.['state'] ?? 'RUNNING') || 'RUNNING')
      }
      if (ctxRaw) {
        const parsed = parseContext(ctxRaw)
        setCtx(parsed)
        const tid = parsed.taskId || manualTaskId.trim()
        if (tid && parsed.sha256) {
          void loadPreview(tid, parsed.sha256)
        }
        if (tid) {
          const tRaw = await muse
            .rpc({ accountId, method: 'browser_task.get', params: { task_id: tid } })
            .catch(() => null)
          if (tRaw && typeof tRaw === 'object') setTaskDetail(tRaw as Record<string, unknown>)
        }
      } else {
        setCtx(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId, loadPreview, manualTaskId])

  useEffect(() => {
    if (status === 'online' || status === 'busy' || status === 'attention') void refresh()
  }, [refresh, status])

  const activeTaskId = manualTaskId.trim() || ctx?.taskId || ''

  const runTaskOp = async (
    method:
      | 'browser_task.get'
      | 'browser_task.stop'
      | 'browser_task.release'
      | 'browser_task.refresh_environment'
      | 'browser.lease',
    label: string
  ) => {
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setBusy(true)
    setError(undefined)
    setHint(undefined)
    try {
      const params: Record<string, unknown> = activeTaskId ? { task_id: activeTaskId } : {}
      const raw = await muse.rpc({ accountId, method, params })
      if (raw && typeof raw === 'object') setTaskDetail(raw as Record<string, unknown>)
      setHint(label)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title={t('Computer')}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      <div className="flex flex-col gap-2.5">
        {/* Grok Bot-style Computer Screen Stage */}
        <div className="relative overflow-hidden rounded-xl border border-line bg-ink/[0.04] p-3">
          {previewDataUrl ? (
            <div className="flex flex-col gap-2">
              <img
                src={previewDataUrl}
                alt="Muse computer preview"
                className="max-h-48 w-full rounded-lg border border-line object-contain bg-black"
              />
              {ctx?.url && (
                <p className="truncate font-mono text-[11px] text-ink-secondary" title={ctx.url}>
                  {ctx.url}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
              <span className="grid size-9 place-items-center rounded-xl bg-surface text-ink-secondary shadow-soft">
                <Monitor className="size-4.5" aria-hidden />
              </span>
              <div>
                <p className="text-[13px] font-medium text-ink">
                  Muse Cloud VM · <span className="font-mono text-[12px] text-status-online-ink">{vmHealth}</span>
                </p>
                {ctx?.status && (
                  <p className="mt-0.5 text-[11.5px] text-ink-muted">
                    {ctx.status}{ctx.title ? ` · ${ctx.title}` : ''}
                  </p>
                )}
              </div>
              <Button size="sm" variant="secondary" onClick={toggleWebSession}>
                {webSessionOpen ? t('Back to conversation') : t('Show web session')}
              </Button>
            </div>
          )}
        </div>

        {error && <p className="text-[12px] text-status-error">{error}</p>}
        {hint && <p className="text-[12px] text-ink-secondary">{hint}</p>}

        {/* Browser / Computer Task Controls */}
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <TextInput
              value={manualTaskId}
              onChange={(e) => setManualTaskId(e.target.value)}
              placeholder={ctx?.taskId || 'Task ID (可选)'}
              aria-label="Browser task ID"
              className="h-7 flex-1 font-mono text-[11.5px]"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void runTaskOp('browser.lease', '已请求浏览器租约')}
            >
              <Play className="size-3" /> 租用
            </Button>
          </div>
          {activeTaskId && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void runTaskOp('browser_task.get', '已刷新任务状态')}
              >
                查询状态
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void runTaskOp('browser_task.refresh_environment', '已刷新浏览器环境')
                }
              >
                <RefreshCw className="size-3" /> 重置环境
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void runTaskOp('browser_task.stop', '已停止浏览器任务')}
              >
                <Square className="size-3" /> 停止
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void runTaskOp('browser_task.release', '已释放浏览器租约')}
              >
                释放
              </Button>
            </div>
          )}
        </div>

        {/* Context / Task JSON snapshot */}
        {(taskDetail || (ctx && Object.keys(ctx.raw).length > 0)) && (
          <pre className="max-h-40 overflow-auto rounded-lg bg-hover/60 p-2 font-mono text-[11px] text-ink-secondary">
            {JSON.stringify(taskDetail ?? ctx?.raw, null, 2)}
          </pre>
        )}
      </div>
    </Section>
  )
}
