import { useCallback, useEffect, useMemo, useState } from "react"
import type { MuseChatSessionView } from "@shared/ipc"
import { EmptyLine, Section } from "@/components/info/Section"
import { Button } from "@/components/ui/Button"
import { TextInput } from "@/components/ui/Field"
import { RefreshButton } from "@/components/muse/RefreshButton"
import { getBridge } from "@/lib/bridge"
import { useBotStore } from "@/store/botStore"

function formatTime(ms: number | null): string {
  if (ms == null || ms <= 0) return "—"
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(ms)
    )
  } catch {
    return new Date(ms).toLocaleString()
  }
}

export function SessionsSection({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<MuseChatSessionView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [busyId, setBusyId] = useState<string>()
  const [confirmId, setConfirmId] = useState<string>()
  const [confirmOp, setConfirmOp] = useState<"archive" | "delete">()
  const [renameId, setRenameId] = useState<string>()
  const [renameTitle, setRenameTitle] = useState("")
  const [showArchived, setShowArchived] = useState(false)
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.listSessions) return
    setLoading(true)
    setError(undefined)
    try {
      setItems(await muse.listSessions(accountId))
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
      if (event.type === "sessions" && event.accountId === accountId) setItems(event.sessions)
    })
  }, [accountId])

  const visible = useMemo(() => {
    const list = showArchived ? items : items.filter((s) => !s.archived)
    return list
  }, [items, showArchived])

  const mutate = async (
    sessionId: string,
    mutation:
      | { op: "archive" | "unarchive" | "pin" | "unpin" | "delete"; sessionId: string }
      | { op: "rename"; sessionId: string; title: string }
  ) => {
    const muse = getBridge()?.muse
    if (!muse?.mutateSession) return
    setBusyId(sessionId)
    setError(undefined)
    try {
      await muse.mutateSession(accountId, mutation)
      setConfirmId(undefined)
      setConfirmOp(undefined)
      if (mutation.op === "rename") setRenameId(undefined)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const ask = (id: string, op: "archive" | "delete") => {
    if (confirmId === id && confirmOp === op) {
      void mutate(id, { op, sessionId: id })
      return
    }
    setConfirmId(id)
    setConfirmOp(op)
  }

  return (
    <Section
      title="会话"
      count={visible.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="pb-1 text-[12px] text-status-error">{error}</p>}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink-muted">置顶 / 重命名安全；归档与删除需二次确认。</p>
        <Button size="sm" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "隐藏已归档" : "显示已归档"}
        </Button>
      </div>
      {visible.length === 0 ? (
        <EmptyLine>{loading ? "加载会话…" : "暂无会话"}</EmptyLine>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => {
            const confirmingArchive = confirmId === item.id && confirmOp === "archive"
            const confirmingDelete = confirmId === item.id && confirmOp === "delete"
            const renaming = renameId === item.id
            return (
              <li key={item.id} className="rounded-lg border border-line/60 bg-surface/40 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {renaming ? (
                      <div className="flex gap-1.5">
                        <TextInput
                          value={renameTitle}
                          onChange={(e) => setRenameTitle(e.target.value)}
                          aria-label="会话标题"
                          className="h-7 text-[13px]"
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={!renameTitle.trim() || busyId === item.id}
                          onClick={() =>
                            void mutate(item.id, {
                              op: "rename",
                              sessionId: item.id,
                              title: renameTitle.trim()
                            })
                          }
                        >
                          保存
                        </Button>
                        <Button size="sm" onClick={() => setRenameId(undefined)}>
                          取消
                        </Button>
                      </div>
                    ) : (
                      <p className="truncate text-[13px] font-medium text-ink">{item.title}</p>
                    )}
                    {item.preview && (
                      <p className="mt-0.5 truncate text-[12px] text-ink-secondary">{item.preview}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {formatTime(item.updatedAtMs)}
                      {item.pinned ? " · 置顶" : ""}
                      {item.archived ? " · 已归档" : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    disabled={busyId === item.id}
                    onClick={() =>
                      void mutate(item.id, {
                        op: item.pinned ? "unpin" : "pin",
                        sessionId: item.id
                      })
                    }
                  >
                    {item.pinned ? "取消置顶" : "置顶"}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === item.id}
                    onClick={() => {
                      setRenameId(item.id)
                      setRenameTitle(item.title)
                    }}
                  >
                    重命名
                  </Button>
                  <Button
                    size="sm"
                    variant={confirmingArchive ? "primary" : undefined}
                    disabled={busyId === item.id}
                    onClick={() =>
                      item.archived
                        ? void mutate(item.id, { op: "unarchive", sessionId: item.id })
                        : ask(item.id, "archive")
                    }
                  >
                    {item.archived
                      ? "取消归档"
                      : confirmingArchive
                        ? "再点一次确认归档"
                        : "归档"}
                  </Button>
                  <Button
                    size="sm"
                    variant={confirmingDelete ? "danger-confirm" : "danger"}
                    disabled={busyId === item.id}
                    onClick={() => ask(item.id, "delete")}
                  >
                    {confirmingDelete ? "再点一次确认删除" : "删除"}
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
