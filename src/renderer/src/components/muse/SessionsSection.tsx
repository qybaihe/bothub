import { useCallback, useEffect, useMemo, useState } from "react"
import type { MuseChatSessionView } from "@shared/ipc"
import { EmptyLine, Section } from "@/components/info/Section"
import { Button } from "@/components/ui/Button"
import { TextInput } from "@/components/ui/Field"
import { RefreshButton } from "@/components/muse/RefreshButton"
import { getBridge } from "@/lib/bridge"
import { cn } from "@/lib/cn"
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
  const [searchQuery, setSearchQuery] = useState("")
  const [searchHits, setSearchHits] = useState<Array<{ id: string; sessionId?: string; text: string }> | null>(null)
  const [searching, setSearching] = useState(false)
  const status = useBotStore((s) => s.accounts[accountId]?.status)
  const bot = useBotStore((s) => s.bots.find((b) => b.id === s.selectedBotId))
  const switchMuseSession = useBotStore((s) => s.switchMuseSession)
  const startNewMuseSession = useBotStore((s) => s.startNewMuseSession)

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

  const runChatSearch = async () => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchHits(null)
      return
    }
    const muse = getBridge()?.muse
    if (!muse?.rpc) return
    setSearching(true)
    setError(undefined)
    try {
      const raw = await muse.rpc({ accountId, method: "chat.search", params: { query: q, limit: 20 } })
      const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
      const list = (o["results"] ?? o["items"] ?? o["messages"] ?? (Array.isArray(raw) ? raw : [])) as unknown
      const hits: Array<{ id: string; sessionId?: string; text: string }> = []
      if (Array.isArray(list)) {
        for (const r of list.slice(0, 20)) {
          if (!r || typeof r !== "object") continue
          const row = r as Record<string, unknown>
          const text = String(row["snippet"] ?? row["text"] ?? row["content"] ?? row["display_text"] ?? "").slice(0, 180)
          if (!text) continue
          hits.push({
            id: String(row["id"] ?? row["message_id"] ?? hits.length),
            sessionId: typeof row["session_id"] === "string" ? (row["session_id"] as string) : undefined,
            text
          })
        }
      }
      setSearchHits(hits)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  return (
    <Section
      title="会话"
      count={visible.length || undefined}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="pb-1 text-[12px] text-status-error">{error}</p>}
      <div className="mb-2 flex gap-1.5">
        <TextInput
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            if (!e.target.value.trim()) setSearchHits(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runChatSearch()
          }}
          placeholder="搜索聊天内容…"
          aria-label="搜索聊天内容"
          className="h-7 flex-1 text-[12px]"
        />
        <Button size="sm" variant="secondary" disabled={searching} onClick={() => void runChatSearch()}>
          搜索
        </Button>
        {bot && (
          <Button
            size="sm"
            variant="secondary"
            disabled={Boolean(busyId)}
            onClick={() => {
              setBusyId("__new__")
              void startNewMuseSession(bot.id).finally(() => {
                setBusyId(undefined)
                void refresh()
              })
            }}
          >
            + 新建
          </Button>
        )}
        {items.some((s) => s.archived) && (
          <Button size="sm" variant="ghost" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "隐藏归档" : "已归档"}
          </Button>
        )}
      </div>
      {searchHits && (
        <div className="mb-2 rounded-lg border border-line bg-surface p-2 text-[12px]">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-ink-secondary">搜索结果 ({searchHits.length})</span>
            <button
              type="button"
              onClick={() => setSearchHits(null)}
              className="text-[11px] text-ink-muted hover:text-ink"
            >
              关闭
            </button>
          </div>
          {searchHits.length === 0 ? (
            <p className="text-ink-muted">无匹配聊天记录</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {searchHits.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 rounded bg-hover px-2 py-1">
                  <span className="min-w-0 truncate text-ink">{h.text}</span>
                  {h.sessionId && bot && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setBusyId(h.sessionId!)
                        void switchMuseSession(bot.id, h.sessionId!).finally(() => setBusyId(undefined))
                      }}
                    >
                      打开
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {visible.length === 0 ? (
        <EmptyLine>{loading ? "加载会话…" : "暂无会话"}</EmptyLine>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => {
            const confirmingArchive = confirmId === item.id && confirmOp === "archive"
            const confirmingDelete = confirmId === item.id && confirmOp === "delete"
            const renaming = renameId === item.id
            const isActive = bot?.activeSessionId === item.id
            return (
              <li
                key={item.id}
                className={cn(
                  "rounded-lg border p-2.5 transition-colors",
                  isActive
                    ? "border-accent-600/60 bg-accent-50/30"
                    : "border-line/60 bg-surface/40"
                )}
              >
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
                      {isActive ? " · 当前会话" : ""}
                      {item.pinned ? " · 置顶" : ""}
                      {item.archived ? " · 已归档" : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {bot && (
                    <Button
                      size="sm"
                      variant={isActive ? "secondary" : "primary"}
                      disabled={busyId === item.id}
                      onClick={() => {
                        setBusyId(item.id)
                        void switchMuseSession(bot.id, item.id).finally(() => setBusyId(undefined))
                      }}
                    >
                      {isActive ? "刷新历史" : "打开对话"}
                    </Button>
                  )}
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
