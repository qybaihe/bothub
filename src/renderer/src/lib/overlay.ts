import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Native WebContentsViews are composited above the renderer, so DOM overlays
 * (menus, dialogs) would render underneath them. Overlays register here and
 * embedded views hide while any overlay is open.
 */
export const useOverlayStore = create<{ count: number }>()(() => ({ count: 0 }))

export function useOverlayLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    useOverlayStore.setState((s) => ({ count: s.count + 1 }))
    return () => useOverlayStore.setState((s) => ({ count: Math.max(0, s.count - 1) }))
  }, [active])
}
