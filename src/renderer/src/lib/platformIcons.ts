import type { PlatformId } from "@adapters/types"
import grokIcon from "@/assets/platforms/grok.png"
import museIcon from "@/assets/platforms/muse.svg"
import harkIcon from "@/assets/platforms/hark.svg"
import dotIcon from "@/assets/platforms/dot.svg"

/**
 * Official brand marks, keyed by platform. Muse uses the white app icon from
 * muse.ai/images/landing/brand/muse-app-icon.svg; Grok uses grok.com's
 * apple-touch-icon.
 */
const ICONS: Partial<Record<PlatformId, string>> = {
  "meta-muse": museIcon,
  grok: grokIcon,
  hark: harkIcon,
  dot: dotIcon
}

export function platformIcon(id: PlatformId | undefined): string | undefined {
  return id ? ICONS[id] : undefined
}
