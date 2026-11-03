import { usePrefsStore, type Locale } from '@/store/prefsStore'
import { ZH } from './i18n.zh'

/** Lightweight i18n: English source strings are keys; zh-CN dictionary overrides. `{name}` placeholders. */
export function translate(locale: Locale, text: string, vars?: Record<string, string | number>): string {
  let out = locale === 'zh' ? (ZH[text] ?? text) : text
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
  return out
}

export type TFn = (text: string, vars?: Record<string, string | number>) => string

export function useT(): TFn {
  const locale = usePrefsStore((s) => s.locale)
  return (text, vars) => translate(locale, text, vars)
}

/** Non-hook access (stores, helpers). */
export const t: TFn = (text, vars) => translate(usePrefsStore.getState().locale, text, vars)
