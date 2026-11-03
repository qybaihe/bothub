import { useCallback, useEffect, useState } from "react"
import type { MuseFileEntryView } from "@shared/ipc"
import { EmptyLine, Section } from "@/components/info/Section"
import { RefreshButton } from "@/components/muse/RefreshButton"
import { getBridge } from "@/lib/bridge"
import { useBotStore } from "@/store/botStore"

function formatBytes(n: number | null): string {
  if (n == null || n < 0) return "—"
  if (n < 1024) return n + " B"
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB"
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB"
  return (n / (1024 * 1024 * 1024)).toFixed(1) + " GB"
}

export function FilesSection({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<MuseFileEntryView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.listFiles) return
    setLoading(true)
    setError(undefined)
    try {
      setItems(await muse.listFiles(accountId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    void refresh()
  }, [refresh, status])

  useEffect(() => {
    const muse = getBridge()?.muse
    if (!muse?.onEvent) return
    return muse.onEvent((event) => {
      if (event.type === "files" && event.accountId === accountId) setItems(event.files)
    })
  }, [accountId])

  return (
    <Section
      title="文件"
      count={items.length || undefined}
      flush={items.length > 0}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="px-3 pt-2 text-[12px] text-status-error">{error}</p>}
      <p className="px-3 pt-2 text-[11px] text-ink-muted">只读浏览 Artifacts / Library。删除请在 Muse 网页确认。</p>
      {items.length === 0 ? (
        <div className="px-3 pb-2">
          <EmptyLine>{loading ? "加载文件…" : "暂无文件"}</EmptyLine>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((f) => (
            <li key={f.source + ":" + f.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-ink">{f.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                  {f.kind}
                  {" · "}
                  {f.source}
                  {f.pinned ? " · 置顶" : ""}
                  {" · "}
                  {formatBytes(f.sizeBytes)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
