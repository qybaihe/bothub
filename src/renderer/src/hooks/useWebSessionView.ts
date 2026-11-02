import { useEffect, useState, type RefObject } from 'react'
import type { WebViewBounds } from '@shared/ipc'
import { getBridge } from '@/lib/bridge'
import { useOverlayStore } from '@/lib/overlay'

export type WebSessionState =
  | { status: 'unsupported' }
  | { status: 'loading' }
  | { status: 'ready'; partition: string }
  | { status: 'error'; message: string }

interface Options {
  botId: string
  accountId: string
  url?: string
  label: string
  /** Element whose on-screen rect the native view should cover. */
  containerRef: RefObject<HTMLElement | null>
}

function measure(el: HTMLElement): WebViewBounds {
  const rect = el.getBoundingClientRect()
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

/**
 * Shows the main-process WebContentsView for a bot + account over
 * `containerRef`, keeping its bounds in sync. Hidden while DOM overlays are
 * open, and detached (not destroyed) on unmount so the session survives.
 */
export function useWebSessionView({ botId, accountId, url, label, containerRef }: Options): WebSessionState {
  const webViews = getBridge()?.webViews
  const overlayOpen = useOverlayStore((s) => s.count > 0)
  const [state, setState] = useState<WebSessionState>(() =>
    webViews ? { status: 'loading' } : { status: 'unsupported' }
  )

  useEffect(() => {
    const el = containerRef.current
    if (!webViews || !el || overlayOpen) return

    let disposed = false
    let viewId: string | null = null
    const sync = () => {
      if (viewId) webViews.resize(viewId, measure(el))
    }

    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }))
    webViews
      .create({ botId, accountId, url, label })
      .then(async (info) => {
        if (disposed) return
        viewId = info.viewId
        await webViews.attach(info.viewId, measure(el))
        // Unmounted while attaching: hide it again.
        if (disposed) void webViews.detach(info.viewId)
        else setState({ status: 'ready', partition: info.partition })
      })
      .catch((error: unknown) => {
        if (!disposed) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      })

    const observer = new ResizeObserver(sync)
    observer.observe(el)
    window.addEventListener('resize', sync)

    return () => {
      disposed = true
      observer.disconnect()
      window.removeEventListener('resize', sync)
      if (viewId) void webViews.detach(viewId)
    }
  }, [webViews, botId, accountId, url, label, containerRef, overlayOpen])

  return state
}
