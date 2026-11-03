import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import type { UpdateStatusEvent } from '@shared/ipc'
import { Button } from '@/components/ui/Button'
import { getBridge } from '@/lib/bridge'
import { cn } from '@/lib/cn'

type BannerState =
  | { kind: 'hidden' }
  | { kind: 'available'; version: string; manualInstall?: boolean }
  | { kind: 'downloading'; version?: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'message'; text: string }

export function UpdateBanner() {
  const [state, setState] = useState<BannerState>({ kind: 'hidden' })
  const [, setChecking] = useState(false)

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge?.updates) return

    return bridge.updates.onEvent((event: UpdateStatusEvent) => {
      switch (event.type) {
        case 'checking':
          setChecking(true)
          break
        case 'available':
          setChecking(false)
          setState({
            kind: 'available',
            version: event.version,
            manualInstall: event.manualInstall
          })
          break
        case 'downloading':
          setChecking(false)
          setState({ kind: 'downloading', percent: event.percent })
          break
        case 'downloaded':
          setChecking(false)
          setState({ kind: 'ready', version: event.version })
          break
        case 'not-available':
          setChecking(false)
          setState({ kind: 'message', text: `You're on the latest version (${event.version}).` })
          break
        case 'error':
          setChecking(false)
          if (event.message === 'dev-skip') break
          setState({ kind: 'message', text: event.message })
          break
      }
    })
  }, [])

  // Auto-hide transient messages.
  useEffect(() => {
    if (state.kind !== 'message') return
    const t = window.setTimeout(() => setState({ kind: 'hidden' }), 4500)
    return () => window.clearTimeout(t)
  }, [state])

  // Keep the last state on screen while the toast fades out.
  const [shown, setShown] = useState<BannerState>(state)
  const leaving = state.kind === 'hidden' && shown.kind !== 'hidden'
  useEffect(() => {
    if (state.kind !== 'hidden') {
      setShown(state)
      return
    }
    const t = window.setTimeout(() => setShown({ kind: 'hidden' }), 160)
    return () => window.clearTimeout(t)
  }, [state])

  const view = state.kind === 'hidden' ? shown : state
  if (view.kind === 'hidden') return null

  return (
    <div
      className={cn(
        'no-drag pointer-events-auto absolute inset-x-0 bottom-[104px] z-50 mx-auto flex w-fit max-w-[min(520px,92vw)] items-center gap-2.5 rounded-xl border border-line-strong bg-main py-1.5 pr-1.5 pl-3 text-[13px] shadow-toast',
        leaving ? 'pointer-events-none animate-scrim-out' : 'animate-toast-in'
      )}
      role="status"
    >
      {view.kind === 'available' && view.manualInstall && (
        <>
          <Download className="size-4 text-accent-600" aria-hidden />
          <span className="text-ink">
            新版本 {view.version} 已发布，请手动下载安装
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void getBridge()?.updates.install()}
          >
            下载
          </Button>
          <button
            type="button"
            className="press-icon grid size-7 place-items-center rounded-full text-ink-muted hover:bg-hover hover:text-ink"
            aria-label="Dismiss"
            onClick={() => setState({ kind: 'hidden' })}
          >
            <X className="size-3.5" />
          </button>
        </>
      )}
      {view.kind === 'available' && !view.manualInstall && (
        <>
          <Download className="size-4 text-accent-600" aria-hidden />
          <span className="text-ink">Update {view.version} available — downloading…</span>
        </>
      )}
      {view.kind === 'downloading' && (
        <>
          <RefreshCw className="size-4 animate-spin text-accent-600" aria-hidden />
          <span className="text-ink">Downloading update… {Math.round(view.percent)}%</span>
        </>
      )}
      {view.kind === 'ready' && (
        <>
          <Download className="size-4 text-accent-600" aria-hidden />
          <span className="text-ink">Version {view.version} ready — restart to update</span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void getBridge()?.updates.install()}
          >
            Restart
          </Button>
        </>
      )}
      {view.kind === 'message' && (
        <>
          <span className="text-ink-secondary">{view.text}</span>
          <button
            type="button"
            className="press-icon grid size-7 place-items-center rounded-full text-ink-muted hover:bg-hover hover:text-ink"
            aria-label="Dismiss"
            onClick={() => setState({ kind: 'hidden' })}
          >
            <X className="size-3.5" />
          </button>
        </>
      )}
    </div>
  )
}

export function useCheckForUpdates(): { check: () => void; checking: boolean } {
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const bridge = getBridge()
    if (!bridge?.updates) return
    return bridge.updates.onEvent((event) => {
      if (event.type === 'checking') setChecking(true)
      else setChecking(false)
    })
  }, [])

  return {
    checking,
    check: () => {
      setChecking(true)
      void getBridge()?.updates.check()
    }
  }
}
