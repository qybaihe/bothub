import { useCallback, useEffect, useState } from "react"
import type { MuseInviteSnapshot } from "@shared/ipc"
import { EmptyLine, Section } from "@/components/info/Section"
import { Button } from "@/components/ui/Button"
import { TextInput } from "@/components/ui/Field"
import { RefreshButton } from "@/components/muse/RefreshButton"
import { getBridge } from "@/lib/bridge"
import { useBotStore } from "@/store/botStore"

export function InviteSection({ accountId }: { accountId: string }) {
  const [snap, setSnap] = useState<MuseInviteSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [copied, setCopied] = useState<"code" | "share" | null>(null)
  const [redeemCode, setRedeemCode] = useState("")
  const [redeemBusy, setRedeemBusy] = useState(false)
  const [redeemMsg, setRedeemMsg] = useState<string>()
  const status = useBotStore((s) => s.accounts[accountId]?.status)

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.refreshInvite) return
    setLoading(true)
    setError(undefined)
    try {
      const next = await muse.refreshInvite(accountId)
      setSnap(next)
      if (next.error) setError(next.error)
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
      if (event.type === "invite" && event.accountId === accountId) setSnap(event.snapshot)
    })
  }, [accountId])

  const copy = async (kind: "code" | "share") => {
    const text =
      kind === "code"
        ? snap?.code || ""
        : snap?.shareText || [snap?.code, snap?.inviteLink].filter(Boolean).join("\n")
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setError("Clipboard unavailable")
    }
  }

  const redeem = async () => {
    const muse = getBridge()?.muse
    if (!muse?.redeemInvite || !snap?.inviteCodeEntryAvailable) return
    setRedeemBusy(true)
    setRedeemMsg(undefined)
    try {
      const result = await muse.redeemInvite(accountId, redeemCode)
      setRedeemMsg(result.message)
      if (result.openSettings) {
        void muse.openExternal?.("https://muse.ai/")
      }
      if (result.ok) {
        setRedeemCode("")
        await refresh()
      }
    } catch (err) {
      setRedeemMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setRedeemBusy(false)
    }
  }

  const remaining =
    typeof snap?.usesRemaining === "number" && typeof snap?.maxUses === "number"
      ? snap.usesRemaining + " / " + snap.maxUses
      : typeof snap?.usesRemaining === "number"
        ? String(snap.usesRemaining)
        : null

  return (
    <Section title="邀请码" action={<RefreshButton loading={loading} onClick={() => void refresh()} />}>
      {error && <p className="pb-1 text-[12px] text-status-error">{error}</p>}
      {!snap || (snap.error && !snap.code) ? (
        <EmptyLine>{loading ? "加载邀请信息…" : "暂无邀请信息"}</EmptyLine>
      ) : (
        <div className="flex flex-col gap-3 py-0.5">
          {snap.title && <p className="text-[13px] font-medium text-ink">{snap.title}</p>}
          {snap.subtitle && <p className="text-[12px] text-ink-secondary">{snap.subtitle}</p>}
          {snap.reward?.title && (
            <div className="rounded-lg bg-hover/60 px-2.5 py-2">
              <p className="text-[12px] font-medium text-ink">{snap.reward.title}</p>
              {snap.reward.body && (
                <p className="mt-0.5 text-[12px] text-ink-secondary">{snap.reward.body}</p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-line/60 px-2.5 py-2">
            <div className="min-w-0">
              <p className="text-[11px] text-ink-muted">你的邀请码</p>
              <p className="truncate font-mono text-[14px] tracking-wide text-ink">
                {snap.code || "—"}
              </p>
              {remaining && (
                <p className="mt-0.5 text-[11px] text-ink-secondary">剩余次数 {remaining}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <Button size="sm" disabled={!snap.code} onClick={() => void copy("code")}>
                {copied === "code" ? "已复制" : "复制码"}
              </Button>
              <Button size="sm" disabled={!snap.code && !snap.inviteLink} onClick={() => void copy("share")}>
                {copied === "share" ? "已复制" : "复制分享"}
              </Button>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              兑换好友码
            </p>
            {snap.inviteCodeEntryAvailable ? (
              <div className="flex flex-col gap-2">
                {snap.redeemSubtitle && (
                  <p className="text-[12px] text-ink-secondary">{snap.redeemSubtitle}</p>
                )}
                <div className="flex gap-2">
                  <TextInput
                    value={redeemCode}
                    onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                    placeholder="输入邀请码"
                    aria-label="好友邀请码"
                    disabled={redeemBusy}
                    className="font-mono uppercase"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={redeemBusy || redeemCode.trim().length < 4}
                    onClick={() => void redeem()}
                  >
                    兑换
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-sunken/50 px-2.5 py-2">
                <TextInput
                  value=""
                  placeholder="本账号已兑换过，入口已关闭"
                  disabled
                  aria-label="兑换入口不可用"
                />
                <p className="mt-1.5 text-[11px] text-ink-muted">
                  {snap.hasRedeemedInviteCode
                    ? "每个账号只能兑换一次好友邀请码。"
                    : "当前账号不可兑换邀请码。"}
                </p>
              </div>
            )}
            {redeemMsg && <p className="mt-1.5 text-[12px] text-ink-secondary">{redeemMsg}</p>}
          </div>
        </div>
      )}
    </Section>
  )
}
