import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

interface GlideBox {
  offset: number
  size: number
  /** False for the first placement, so the thumb appears in place. */
  animate: boolean
}

/**
 * A highlight that slides to the selected item on the glide spring instead
 * of jumping. The container must be `position: relative`; the selected item
 * is found with `selector` (default `[aria-selected=true]`).
 */
export function useGlide<T extends HTMLElement>(
  dependency: unknown,
  { axis = 'y', selector = '[aria-selected="true"]' }: { axis?: 'x' | 'y'; selector?: string } = {}
) {
  const ref = useRef<T>(null)
  const [box, setBox] = useState<GlideBox | null>(null)
  const placed = useRef(false)

  useLayoutEffect(() => {
    const container = ref.current
    const item = container?.querySelector<HTMLElement>(selector)
    if (!container || !item) {
      setBox(null)
      placed.current = false
      return
    }
    const offset = axis === 'y' ? item.offsetTop : item.offsetLeft
    const size = axis === 'y' ? item.offsetHeight : item.offsetWidth
    setBox({ offset, size, animate: placed.current })
    placed.current = true
  }, [dependency, axis, selector])

  const thumb: CSSProperties | undefined = box
    ? {
        ...(axis === 'y'
          ? { top: 0, height: box.size, translate: `0 ${box.offset}px` }
          : { left: 0, width: box.size, translate: `${box.offset}px 0` }),
        transition: box.animate
          ? `translate 300ms var(--ease-spring-glide), ${axis === 'y' ? 'height' : 'width'} 300ms var(--ease-spring-glide)`
          : 'none'
      }
    : undefined

  return { ref, thumb }
}
