import { useCallback, useEffect, useMemo, useState } from "react"
import type { MuseConnectorView } from "@shared/ipc"
import { EmptyLine, Section } from "@/components/info/Section"
import { Button } from "@/components/ui/Button"
import { ConnectorIcon } from "@/components/ui/ConnectorIcon"
import { TextInput } from "@/components/ui/Field"
import { RefreshButton } from "@/components/muse/RefreshButton"
import { getBridge } from "@/lib/bridge"
import { useBotStore } from "@/store/botStore"

export function ConnectorsSection({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<MuseConnectorView[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [busyId, setBusyId] = useState<string>()
  const [confirmId, setConfirmId] = useState<string>()
  const [hint, setHint] = useState<string>()
  const [filter, setFilter] = useState("")
  const [expanded, setExpanded] = useState(false)
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.listConnectors) return
    setLoading(true)
    setError(undefined)
    try {
      setItems(await muse.listConnectors(accountId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (status === "online" || status === "busy" || status === "attention") void refresh()
  }, [refresh, status])

  useEffect(() => {
    const muse = getBridge()?.muse
    if (!muse?.onEvent) return
    return muse.onEvent((event) => {
      if (event.type === "connectors" && event.accountId === accountId) setItems(event.connectors)
    })
  }, [accountId])

  const connect = async (id: string) => {
    const muse = getBridge()?.muse
    if (!muse?.connectConnector) return
    setBusyId(id)
    setError(undefined)
    setHint(undefined)
    try {
      const result = await muse.connectConnector(accountId, id)
      if (result.oauthUrl) {
        await muse.openHttps?.(result.oauthUrl)
        setHint(result.message || "请在浏览器完成授权，然后点刷新")
      } else if (!result.ok) {
        setError(result.message || "连接失败")
      } else {
        setHint(result.message || "已连接")
        await refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const disconnect = async (id: string) => {
    const muse = getBridge()?.muse
    if (!muse?.disconnectConnector) return
    if (confirmId !== id) {
      setConfirmId(id)
      return
    }
    setBusyId(id)
    setError(undefined)
    try {
      const result = await muse.disconnectConnector(accountId, id)
      setConfirmId(undefined)
      if (!result.ok) setError(result.message || "断开失败")
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(undefined)
    }
  }

  const sorted = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return [...items]
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
      .sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name))
  }, [items, filter])

  const connectedCount = useMemo(() => items.filter((c) => c.connected).length, [items])
  const visible = expanded || filter.trim() ? sorted : sorted.slice(0, Math.max(6, connectedCount))

  return (
    <Section
      title="连接器"
      count={connectedCount || items.length || undefined}
      flush={items.length > 0}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="px-3 pt-2 text-[12px] text-status-error">{error}</p>}
      {hint && <p className="px-3 pt-2 text-[12px] text-ink-secondary">{hint}</p>}
      {items.length === 0 ? (
        <EmptyLine>暂无连接器</EmptyLine>
      ) : (
        <>
          {items.length > 6 && (
            <div className="border-b border-line px-3 py-2">
              <TextInput
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="筛选连接器…"
                aria-label="筛选连接器"
                className="h-7 text-[12px]"
              />
            </div>
          )}
          <ul className="divide-y divide-line">
            {visible.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2.5 px-3 py-2" title={c.description}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <ConnectorIcon id={c.id} name={c.name} />
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="min-w-0 truncate text-[12.5px] font-medium text-ink">{c.name}</p>
                    {c.connected && (
                      <span className="shrink-0 rounded-full bg-status-online/10 px-1.5 text-[10px] leading-4 font-medium text-status-online-ink">
                        已连接
                      </span>
                    )}
                  </div>
                </div>
                {c.connected ? (
                  <Button
                    size="sm"
                    variant={confirmId === c.id ? "danger-confirm" : "ghost"}
                    disabled={busyId === c.id}
                    onClick={() => void disconnect(c.id)}
                  >
                    {confirmId === c.id ? "确认" : "断开"}
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" disabled={busyId === c.id} onClick={() => void connect(c.id)}>
                    连接
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!filter.trim() && sorted.length > visible.length && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full border-t border-line py-2 text-center text-[11.5px] font-medium text-ink-secondary hover:bg-hover hover:text-ink"
            >
              展开全部 ({sorted.length})
            </button>
          )}
          {expanded && !filter.trim() && sorted.length > 6 && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="w-full border-t border-line py-2 text-center text-[11.5px] font-medium text-ink-secondary hover:bg-hover hover:text-ink"
            >
              收起列表
            </button>
          )}
        </>
      )}
    </Section>
  )
}
