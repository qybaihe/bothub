import { useCallback, useEffect, useState } from "react"
import type { MuseConnectorView } from "@shared/ipc"
import { EmptyLine, Section } from "@/components/info/Section"
import { Button } from "@/components/ui/Button"
import { ConnectorIcon } from "@/components/ui/ConnectorIcon"
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

  return (
    <Section
      title="连接器"
      count={items.length}
      flush={items.length > 0}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="px-3 pt-2 text-[12px] text-status-error">{error}</p>}
      {hint && <p className="px-3 pt-2 text-[12px] text-ink-secondary">{hint}</p>}
      {items.length === 0 ? (
        <div className="px-3 pb-2">
          <EmptyLine>暂无连接器</EmptyLine>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2.5 px-3 py-2.5" title={c.description}>
              <div className="flex min-w-0 items-center gap-2.5">
                <ConnectorIcon id={c.id} name={c.name} />
                <div className="min-w-0">
                  <p className="min-w-0 truncate text-[13px] font-medium text-ink">{c.name}</p>
                  <span
                    className={
                      c.connected
                        ? "mt-0.5 inline-flex rounded-[4px] bg-status-online/10 px-1.5 text-[10.5px] leading-4 text-status-online-ink"
                        : "mt-0.5 inline-flex rounded-[4px] bg-sunken px-1.5 text-[10.5px] leading-4 text-ink-muted"
                    }
                  >
                    {c.connected ? "已连接" : "未连接"}
                  </span>
                </div>
              </div>
              {c.connected ? (
                <Button
                  size="sm"
                  variant={confirmId === c.id ? "danger-confirm" : "danger"}
                  disabled={busyId === c.id}
                  onClick={() => void disconnect(c.id)}
                >
                  {confirmId === c.id ? "再点一次断开" : "断开"}
                </Button>
              ) : (
                <Button size="sm" variant="primary" disabled={busyId === c.id} onClick={() => void connect(c.id)}>
                  连接
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
