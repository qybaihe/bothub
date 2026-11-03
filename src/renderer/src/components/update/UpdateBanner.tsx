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
  const [checking, setChecking] = useState(false)

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

  if (state.kind === 'hidden') return null

  return (
    <div
      className={cn(
        'no-drag pointer-events-auto absolute inset-x-0 top-3 z-50 mx-auto flex w-fit max-w-[min(520px,92vw)] items-center gap-3 rounded-full border border-line bg-surface px-3 py-1.5 shadow-pop'
      )}
      role="status"
    >
      {state.kind === 'available' && state.manualInstall && (
        <>
          <Download className="size-4 text-accent-600" aria-hidden />
          <span className="text-ui text-ink">
            新版本 {state.version} 已发布，请手动下载安装
          </span>
          <Button
            size="sm"
            variant="primary"
            className="rounded-full"
            onClick={() => void getBridge()?.updates.install()}
          >
            下载
          </Button>
          <button
            type="button"
            className="rounded-full p-1 text-ink-muted hover:bg-surface-hover hover:text-ink"
            aria-label="Dismiss"
            onClick={() => setState({ kind: 'hidden' })}
          >
            <X className="size-3.5" />
          </button>
        </>
      )}
      {state.kind === 'available' && !state.manualInstall && (
        <>
          <Download className="size-4 text-accent-600" aria-hidden />
          <span className="text-ui text-ink">Update {state.version} available — downloading…</span>
        </>
      )}
      {state.kind === 'downloading' && (
        <>
          <RefreshCw className="size-4 animate-spin text-accent-600" aria-hidden />
          <span className="text-ui text-ink">Downloading update… {Math.round(state.percent)}%</span>
        </>
      )}
      {state.kind === 'ready' && (
        <>
          <Download className="size-4 text-accent-600" aria-hidden />
          <span className="text-ui text-ink">Version {state.version} ready — restart to update</span>
          <Button
            size="sm"
            variant="primary"
            className="rounded-full"
            onClick={() => void getBridge()?.updates.install()}
          >
            Restart
          </Button>
        </>
      )}
      {state.kind === 'message' && (
        <>
          <span className="text-ui text-ink-secondary">{state.text}</span>
          <button
            type="button"
            className="rounded-full p-1 text-ink-muted hover:bg-surface-hover hover:text-ink"
            aria-label="Dismiss"
            onClick={() => setState({ kind: 'hidden' })}
          >
            <X className="size-3.5" />
          </button>
        </>
      )}
      {checking && state.kind !== 'downloading' ? null : null}
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
