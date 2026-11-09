import { useCallback, useEffect, useState } from 'react'
import type { MuseProxyMode, MuseProxyView } from '@shared/ipc'
import { EmptyLine, Section } from '@/components/info/Section'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { RefreshButton } from '@/components/muse/RefreshButton'
import { getBridge } from '@/lib/bridge'
import { t } from '@/lib/i18n'

const MODES: Array<{ value: MuseProxyMode; label: () => string }> = [
  { value: 'direct', label: () => t('Direct (no proxy)') },
  { value: 'http', label: () => t('HTTP proxy') },
  { value: 'socks5', label: () => t('SOCKS5') },
  { value: 'socks5h', label: () => t('SOCKS5H (remote DNS)') }
]

/**
 * BotHub-local per-account Muse egress proxy (partition session.setProxy + Noise WSS agent).
 * Not a Muse RPC. Password stored via Electron safeStorage only.
 */
export function ProxySection({ accountId }: { accountId: string }) {
  const [view, setView] = useState<MuseProxyView | null>(null)
  const [mode, setMode] = useState<MuseProxyMode>('direct')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [hint, setHint] = useState<string>()

  const refresh = useCallback(async () => {
    const muse = getBridge()?.muse
    if (!muse?.getProxy) {
      setView(null)
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      const next = await muse.getProxy(accountId)
      setView(next)
      setMode(next.mode)
      setHost(next.host || '')
      setPort(next.port != null ? String(next.port) : '')
      setUsername(next.username || '')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const save = async () => {
    const muse = getBridge()?.muse
    if (!muse?.setProxy) return
    setSaving(true)
    setError(undefined)
    setHint(undefined)
    try {
      const next = await muse.setProxy(accountId, {
        mode,
        host: host.trim() || undefined,
        port: port.trim() ? Number(port) : undefined,
        username: username.trim() || undefined,
        password: password || undefined
      })
      setView(next)
      setPassword('')
      setHint(t('Proxy saved — reconnect Muse to apply WSS fully'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (!getBridge()?.muse?.getProxy) {
    return (
      <Section title={t('Account proxy')}>
        <EmptyLine>{t('Proxy settings require the Electron app')}</EmptyLine>
      </Section>
    )
  }

  return (
    <Section
      title={t('Account proxy')}
      action={<RefreshButton loading={loading} onClick={() => void refresh()} />}
    >
      {error && <p className="pb-1 text-[12px] text-status-error">{error}</p>}
      {hint && <p className="pb-1 text-[12px] text-ink-secondary">{hint}</p>}
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-[12px]">
          <span className="font-medium text-ink">{t('Mode')}</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as MuseProxyMode)}
            className="rounded-lg border border-line bg-surface px-2 py-1 text-[12.5px] text-ink"
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label()}
              </option>
            ))}
          </select>
        </label>
        {mode !== 'direct' && (
          <>
            <div className="grid grid-cols-[1fr_84px] gap-1.5">
              <label className="flex flex-col gap-1 text-[12px]">
                <span className="font-medium text-ink">{t('Host')}</span>
                <TextInput value={host} onChange={(e) => setHost(e.target.value)} placeholder="127.0.0.1" />
              </label>
              <label className="flex flex-col gap-1 text-[12px]">
                <span className="font-medium text-ink">{t('Port')}</span>
                <TextInput value={port} onChange={(e) => setPort(e.target.value)} placeholder="7890" />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="font-medium text-ink">{t('Username (optional)')}</span>
              <TextInput value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="font-medium text-ink">
                {t('Password')}
                {view?.hasPassword ? ` · ${t('stored')}` : ''}
              </span>
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={view?.hasPassword ? t('Leave blank to keep') : ''}
                autoComplete="new-password"
              />
            </label>
          </>
        )}
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => void save()}>
          {t('Save proxy')}
        </Button>
      </div>
    </Section>
  )
}
