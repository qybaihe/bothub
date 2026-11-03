import { useEffect, useRef, useState } from 'react'
import { adapterRegistry } from '@adapters/registry'
import type { AdapterEvent, ConnectionStatus, PlatformId } from '@adapters/types'
import { createId } from '@shared/id'

const LIVE: ReadonlySet<ConnectionStatus> = new Set(['online', 'busy', 'attention'])

export type LoginPhase =
  | { kind: 'idle'; error?: string }
  | { kind: 'waiting'; platformId: PlatformId; windowClosed: boolean }
  | { kind: 'signed-in'; platformId: PlatformId }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/**
 * Sign a brand-new account in through the platform's own login window. The
 * window uses the account's persist partition, so the session cookie lands
 * where the bot will look for it. Unless `keep()` is called, the half-made
 * session is discarded when the caller unmounts or calls `discard()`.
 */
export function usePlatformLogin(botId: string) {
  const [phase, setPhase] = useState<LoginPhase>({ kind: 'idle' })
  const accountId = useRef(createId('acc'))
  const pending = useRef<PlatformId | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)

  const stopListening = () => {
    unsubscribe.current?.()
    unsubscribe.current = null
  }

  const discard = () => {
    stopListening()
    const platformId = pending.current
    pending.current = null
    if (platformId) {
      void adapterRegistry
        .get(platformId)
        ?.cancelLogin?.(accountId.current)
        .catch(() => {})
    }
    // A fresh id keeps late events from the abandoned window out.
    accountId.current = createId('acc')
    setPhase({ kind: 'idle' })
  }

  /** The session is now owned by a bot; stop guarding it. */
  const keep = () => {
    stopListening()
    pending.current = null
  }

  useEffect(() => () => discard(), [])

  const signedIn = (platformId: PlatformId) => {
    stopListening()
    setPhase({ kind: 'signed-in', platformId })
  }

  const openWindow = async (platformId: PlatformId) => {
    const adapter = adapterRegistry.get(platformId)
    if (!adapter?.openLogin) return
    const id = accountId.current
    setPhase({ kind: 'waiting', platformId, windowClosed: false })
    try {
      const status = await adapter.openLogin(id, botId)
      if (LIVE.has(status) && accountId.current === id) signedIn(platformId)
    } catch (error) {
      discard()
      setPhase({ kind: 'idle', error: errorMessage(error) })
    }
  }

  const start = (platformId: PlatformId) => {
    const adapter = adapterRegistry.get(platformId)
    if (!adapter) return
    // Adapters without an interactive login (the mock) count as signed in.
    if (!adapter.openLogin) {
      setPhase({ kind: 'signed-in', platformId })
      return
    }
    pending.current = platformId
    const id = accountId.current
    // Subscribe before opening so an already existing session is not missed.
    stopListening()
    unsubscribe.current = adapter.subscribe((event: AdapterEvent) => {
      if (event.type === 'login' && event.accountId === id) {
        if (event.signedIn) signedIn(platformId)
        else if (event.windowClosed) {
          // Only surface "window closed" while still waiting — never after Name step.
          setPhase((p) => (p.kind === 'waiting' ? { ...p, windowClosed: true } : p))
        }
      } else if (event.type === 'status' && event.accountId === id && LIVE.has(event.status)) {
        signedIn(platformId)
      }
    })
    void openWindow(platformId)
  }

  return {
    phase,
    /** Id of the account being signed in (stable until `discard`). */
    get accountId() {
      return accountId.current
    },
    start,
    reopen: () => phase.kind === 'waiting' && void openWindow(phase.platformId),
    discard,
    keep
  }
}
