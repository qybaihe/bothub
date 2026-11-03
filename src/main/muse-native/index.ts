/**
 * Per-account native Muse clients (main process). Cookies stay inside the
 * account's persist partition; requests go through `session.fetch`.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, session as electronSession } from 'electron'
import { MuseChatChannel } from './chat'
import { MuseNativeGateway } from './gateway'

export { MuseGatewayError, MuseNativeGateway } from './gateway'
export { MuseChatChannel, streamChat, MUSE_CHAT_CAPABILITIES } from './chat'

export type MuseTransportMode = 'native' | 'hook'

/** `BOTHUB_MUSE_TRANSPORT=hook` forces the legacy WebContentsView hook path. */
export function museTransportMode(): MuseTransportMode {
  return process.env['BOTHUB_MUSE_TRANSPORT'] === 'hook' ? 'hook' : 'native'
}

export interface MuseNativeClient {
  accountId: string
  nodeId: string
  gateway: MuseNativeGateway
  chat: MuseChatChannel
}

const DEVICE_FILE = 'muse-native-devices.json'

/** Stable per-account device id (`node_id`), like the web client's deviceContext.local.deviceId. */
function nodeIdFor(accountId: string): string {
  const file = join(app.getPath('userData'), DEVICE_FILE)
  let map: Record<string, string> = {}
  try {
    map = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
  } catch {
    /* first run */
  }
  let id = map[accountId]
  if (!id) {
    id = randomUUID()
    map[accountId] = id
    try {
      writeFileSync(file, JSON.stringify(map, null, 2))
    } catch (e) {
      console.warn('[muse-native] could not persist device id', e)
    }
  }
  return id
}

export class MuseNativeRegistry {
  private clients = new Map<string, MuseNativeClient>()

  constructor(
    private readonly partitionFor: (accountId: string) => string,
    private readonly onPhase?: (accountId: string, phase: string, error: string | null) => void
  ) {}

  get(accountId: string): MuseNativeClient {
    let c = this.clients.get(accountId)
    if (c) return c
    const ses = electronSession.fromPartition(this.partitionFor(accountId))
    const gateway = new MuseNativeGateway({
      fetch: (url, init) => ses.fetch(url, init),
      keepAlive: true,
      log: (msg, extra) => console.info(`[muse-native] ${accountId}`, msg, extra ?? '')
    })
    gateway.on('phase', (p: string, err: string | null) => this.onPhase?.(accountId, p, err))
    c = { accountId, nodeId: nodeIdFor(accountId), gateway, chat: new MuseChatChannel(gateway) }
    this.clients.set(accountId, c)
    return c
  }

  peek(accountId: string): MuseNativeClient | undefined {
    return this.clients.get(accountId)
  }

  dispose(accountId: string): void {
    const c = this.clients.get(accountId)
    if (!c) return
    c.chat.stop()
    c.gateway.close()
    this.clients.delete(accountId)
  }
}

/** Gateway responses are `{ok, result}` envelopes; hook callers expect `result`. */
export function unwrapMuseResult(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    if (o['ok'] === false) {
      const err = o['error']
      const msg = typeof err === 'string' ? err : err && typeof err === 'object' ? JSON.stringify(err).slice(0, 200) : 'request failed'
      throw new Error(`Muse: ${msg}`)
    }
    if (o['ok'] === true && 'result' in o) return o['result']
  }
  return raw
}
