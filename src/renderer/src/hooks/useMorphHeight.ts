import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Let a container's height follow its content on the shape spring, so a
 * surface changes size instead of jumping when its content swaps.
 */
export function useMorphHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [height, setHeight] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight))
    observer.observe(el)
    setHeight(el.offsetHeight)
    return () => observer.disconnect()
  }, [])

  return { ref, height }
}
