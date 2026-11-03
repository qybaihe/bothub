import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePref = 'system' | 'light' | 'dark'
export type Locale = 'zh' | 'en'

interface PrefsState {
  theme: ThemePref
  locale: Locale
  setTheme: (theme: ThemePref) => void
  setLocale: (locale: Locale) => void
}

/** UI preferences (local only). Light theme + Chinese by default. */
export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      theme: 'light',
      locale: 'zh',
      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale })
    }),
    { name: 'bothub-prefs-v1' }
  )
)

function resolve(theme: ThemePref): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Keep <html data-theme> and lang in sync with prefs and the OS setting. */
export function startPrefsSync(): () => void {
  const root = document.documentElement
  const apply = () => {
    const { theme, locale } = usePrefsStore.getState()
    root.dataset.theme = resolve(theme)
    root.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }
  apply()
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  mq?.addEventListener?.('change', apply)
  const unsub = usePrefsStore.subscribe(apply)
  return () => {
    mq?.removeEventListener?.('change', apply)
    unsub()
  }
}
