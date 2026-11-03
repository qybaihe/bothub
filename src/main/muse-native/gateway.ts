/**
 * Native Muse gateway: Noise_XX over wss://hatch.metaaivm.com/v1/noise with
 * HTTP-over-Noise RPC, NDJSON subscriptions, heartbeat and reconnect.
 * Secrets (auth_token / notary / cookies) are never logged.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { TextDecoder } from 'node:util'
import WebSocket from 'ws'
import { MuseControlPlane, MuseControlPlaneError, type FetchFn, type GatewayCreds } from './controlPlane'
import { MUSE_METHODS } from './methods'
import { NoiseXXInitiator } from './noise'
import { PbWriter, pbDecode, pbGet } from './protobuf'
import { NoiseTransport, type InboundFrame, type ServiceName } from './transport'

const NOISE_URL = 'wss://hatch.metaaivm.com/v1/noise'
const APP_ID = 'hatch-web'
const HANDSHAKE_TIMEOUT_MS = 10_000
const HEARTBEAT_INTERVAL_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 10_000
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'

export type GatewayPhase = 'idle' | 'credentials' | 'connecting' | 'handshake' | 'ready' | 'reconnecting' | 'error'

export class MuseGatewayError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'cvm_required'
      | 'signed_out'
      | 'handshake_failed'
      | 'closed'
      | 'timeout'
      | 'http'
      | 'reset'
      | 'unknown_method',
    readonly status?: number
  ) {
    super(message)
    this.name = 'MuseGatewayError'
  }
}

export interface SubscriptionHandle {
  /** First non-event JSON object (RPC ack). */
  ack: Promise<Record<string, unknown>>
  /** Resolves when the server ends the body or the stream is cancelled. */
  done: Promise<void>
  cancel(reason?: string): void
}

interface PendingStream {
  service: ServiceName
  responseHeaders?: Array<[string, string]>
  subscription: boolean
  status?: number
  chunks: Uint8Array[]
  lineBuf: string
  decoder: TextDecoder
  ackSeen: boolean
  resolveUnary?: (v: { status: number; body: Uint8Array; headers?: Array<[string, string]> }) => void
  rejectUnary?: (e: Error) => void
  onAck?: (v: Record<string, unknown>) => void
  onEvent?: (e: Record<string, unknown>) => void
  onDone?: (err?: Error) => void
  timer?: ReturnType<typeof setTimeout>
}

/** RV challenge detection, mirrors muse.ai `(0,s.d)` (field1 bytes, field2 1|2, field3 32B). */
function isOwnerRvChallenge(payload: Uint8Array): boolean {
  try {
    const f = pbDecode(payload)
    const att = pbGet(f, 1)
    const state = pbGet(f, 2)
    const nonce = pbGet(f, 3)
    return (
      att?.wire === 2 &&
      state?.wire === 0 &&
      (state.int === 1n || state.int === 2n) &&
      nonce?.wire === 2 &&
      nonce.bytes?.length === 32
    )
  } catch {
    return false
  }
}

function backoffMs(attempt: number, trusted: boolean): number {
  const t = trusted ? 1 : 0
  if (attempt < 40 * t) return 1000
  const base = Math.min((t ? 1000 : 200) * Math.pow(1.5, Math.max(0, attempt - 40 * t)), 8000)
  return Math.round(base * (1 + 0.2 * Math.random()))
}

function substitutePath(path: string, params: Record<string, unknown>): { path: string; rest: Record<string, unknown> } {
  const rest = { ...params }
  // Official paths use `{id}` and splat `{*path}` (e.g. /fs/raw/{*path}).
  const out = path.replace(/\{\*?(\w+)\}/g, (full, k: string) => {
    const splat = full.startsWith('{*')
    const v = rest[k]
    delete rest[k]
    if (v == null) return ''
    const s = String(v).replace(/^\/+/, '')
    if (splat) {
      // Keep path separators; encode each segment.
      return s
        .split('/')
        .filter((seg) => seg.length > 0 && seg !== '.' && seg !== '..')
        .map((seg) => encodeURIComponent(seg))
        .join('/')
    }
    return encodeURIComponent(s)
  })
  return { path: out, rest }
}

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    q.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export interface MuseNativeGatewayOptions {
  fetch: FetchFn
  /** Keep the socket up (heartbeat + auto reconnect) even without in-flight calls. */
  keepAlive?: boolean
  log?: (msg: string, extra?: Record<string, unknown>) => void
}

export class MuseNativeGateway extends EventEmitter {
  private readonly cp: MuseControlPlane
  private ws: WebSocket | null = null
  private transport: NoiseTransport | null = null
  private connecting: Promise<void> | null = null
  private streams = new Map<bigint, PendingStream>()
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  private trusted = false
  private forceRefresh = false
  private closedByUser = false
  phase: GatewayPhase = 'idle'
  lastError: string | null = null

  constructor(private readonly opts: MuseNativeGatewayOptions) {
    super()
    this.cp = new MuseControlPlane(opts.fetch)
  }

  private log(msg: string, extra?: Record<string, unknown>): void {
    this.opts.log?.(msg, extra)
  }

  private setPhase(p: GatewayPhase, err?: string): void {
    this.phase = p
    if (err !== undefined) this.lastError = err
    this.emit('phase', p, this.lastError)
  }

  isReady(): boolean {
    return this.phase === 'ready' && !!this.transport && !this.transport.isDead() && this.ws?.readyState === WebSocket.OPEN
  }

  async connect(): Promise<void> {
    if (this.isReady()) return
    if (this.connecting) return this.connecting
    this.closedByUser = false
    this.connecting = this.doConnect().finally(() => {
      this.connecting = null
    })
    return this.connecting
  }

  private async doConnect(): Promise<void> {
    this.setPhase('credentials')
    let creds: GatewayCreds
    try {
      creds = await this.cp.credentials({ forceRefresh: this.forceRefresh })
      this.forceRefresh = false
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.setPhase('error', msg)
      if (e instanceof MuseControlPlaneError && e.code === 'signed_out') throw new MuseGatewayError(msg, 'signed_out', e.status)
      throw new MuseGatewayError(msg, 'http', e instanceof MuseControlPlaneError ? e.status : undefined)
    }

    const parts = [
      `vm_id=${encodeURIComponent(creds.vmId)}`,
      `auth_token=${encodeURIComponent(creds.authToken)}`
    ]
    if (creds.notaryToken) parts.push(`notary_token=${encodeURIComponent(creds.notaryToken)}`)
    parts.push(`app_id=${APP_ID}`, `request_id=${randomUUID()}`)
    const url = `${NOISE_URL}?${parts.join('&')}`

    this.setPhase('connecting')
    const ws = new WebSocket(url, { headers: { Origin: 'https://muse.ai', 'User-Agent': UA }, perMessageDeflate: false })
    ws.binaryType = 'nodebuffer'
    this.ws = ws

    try {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new MuseGatewayError('websocket open timeout', 'timeout')), HANDSHAKE_TIMEOUT_MS)
        ws.once('open', () => {
          clearTimeout(t)
          resolve()
        })
        ws.once('unexpected-response', (_req, res) => {
          clearTimeout(t)
          const status = res.statusCode ?? 0
          if (status === 401 || status === 403) this.forceRefresh = true
          reject(new MuseGatewayError(`websocket rejected: HTTP ${status}`, status === 401 || status === 403 ? 'signed_out' : 'handshake_failed', status))
        })
        ws.once('error', (err) => {
          clearTimeout(t)
          reject(new MuseGatewayError(`websocket error: ${err.message}`, 'handshake_failed'))
        })
      })
      this.setPhase('handshake')
      this.transport = await this.handshake(ws)
    } catch (e) {
      try {
        ws.terminate()
      } catch {
        /* ignore */
      }
      this.ws = null
      const msg = e instanceof Error ? e.message : String(e)
      this.setPhase('error', msg)
      throw e instanceof MuseGatewayError ? e : new MuseGatewayError(msg, 'handshake_failed')
    }

    ws.on('message', (data: Buffer, isBinary: boolean) => this.onMessage(ws, data, isBinary))
    ws.on('close', (code: number, reason: Buffer) => this.onClose(ws, code, reason.toString()))
    ws.on('error', () => {
      /* close follows */
    })
    this.attempt = 0
    this.trusted = true
    this.lastError = null
    this.setPhase('ready')
    this.startHeartbeat()
    this.log('muse-native: connected', { vm: creds.vmId.slice(0, 8) })
  }

  private handshake(ws: WebSocket): Promise<NoiseTransport> {
    return new Promise<NoiseTransport>((resolve, reject) => {
      const hs = new NoiseXXInitiator()
      const timer = setTimeout(() => fail(new MuseGatewayError('noise handshake timeout', 'timeout')), HANDSHAKE_TIMEOUT_MS)
      const cleanup = (): void => {
        clearTimeout(timer)
        ws.off('message', onMsg)
        ws.off('close', onClose)
      }
      const fail = (e: Error): void => {
        cleanup()
        reject(e)
      }
      const onClose = (code: number, reason: Buffer): void => {
        if (code === 4001 || code === 4003 || code === 1008) this.forceRefresh = true
        fail(new MuseGatewayError(`closed during handshake (${code} ${reason.toString().slice(0, 80)})`, 'handshake_failed'))
      }
      const onMsg = (data: Buffer, isBinary: boolean): void => {
        if (!isBinary) return fail(new MuseGatewayError('plaintext frame during handshake', 'handshake_failed'))
        try {
          if (data.length > 65535) throw new Error('handshake message too large')
          const payload2 = hs.readMessage2(new Uint8Array(data))
          if (isOwnerRvChallenge(payload2)) {
            throw new MuseGatewayError(
              'This Muse VM is a confidential VM (Owner RV challenge). Open muse.ai in the browser to enroll it, or use a standard VM — BotHub does not handle CVM recovery keys.',
              'cvm_required'
            )
          }
          // Standard personal VM: payload2 is an attestation bundle (accepted as
          // NON_TEE / auth_token-bound, like the web client's default policy).
          const msg3 = hs.writeMessage3(new Uint8Array(0))
          ws.send(msg3)
          const [send, recv] = hs.split()
          cleanup()
          resolve(new NoiseTransport(send, recv))
        } catch (e) {
          fail(e instanceof Error ? e : new Error(String(e)))
        }
      }
      ws.on('message', onMsg)
      ws.once('close', onClose)
      try {
        const nonce = new Uint8Array(randomBytes(32))
        const payload1 = new PbWriter().bytes(1, nonce).finish()
        ws.send(hs.writeMessage1(payload1))
      } catch (e) {
        fail(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  private onMessage(ws: WebSocket, data: Buffer, isBinary: boolean): void {
    if (ws !== this.ws || !this.transport) return
    if (!isBinary) {
      this.hardClose(4004, 'plaintext frame')
      return
    }
    let frame: InboundFrame | null
    try {
      frame = this.transport.decrypt(new Uint8Array(data))
    } catch (e) {
      this.log('muse-native: decrypt failed, re-handshaking', { err: e instanceof Error ? e.message : String(e) })
      this.hardClose(4004, 'decrypt failed')
      return
    }
    if (!frame) return
    if (process.env['BOTHUB_MUSE_NATIVE_TRACE'] === '1') {
      const size = frame.kind === 'response' ? frame.body.length : frame.kind === 'bodyChunk' ? frame.data.length : 0
      const end = frame.kind === 'reset' ? true : frame.endBody
      this.log('muse-native: frame', { kind: frame.kind, stream: Number(frame.streamId), size, end, status: frame.kind === 'response' ? frame.status : undefined })
    }
    const st = this.streams.get(frame.streamId)
    if (!st) return
    if (frame.kind === 'reset') {
      this.finishStream(frame.streamId, new MuseGatewayError(`stream reset (${frame.code}${frame.reason ? ` ${frame.reason}` : ''})`, 'reset'))
      return
    }
    if (frame.kind === 'response') {
      st.status = frame.status
      st.responseHeaders = frame.headers
      if (frame.body.length) this.feed(st, frame.body)
      if (frame.endBody) this.finishStream(frame.streamId)
      return
    }
    if (frame.data.length) this.feed(st, frame.data)
    if (frame.endBody) this.finishStream(frame.streamId)
  }

  private feed(st: PendingStream, data: Uint8Array): void {
    if (!st.subscription) {
      st.chunks.push(data)
      return
    }
    st.lineBuf += st.decoder.decode(data, { stream: true })
    let idx: number
    while ((idx = st.lineBuf.indexOf('\n')) >= 0) {
      const line = st.lineBuf.slice(0, idx).trim()
      st.lineBuf = st.lineBuf.slice(idx + 1)
      if (line) this.dispatchLine(st, line)
    }
  }

  private dispatchLine(st: PendingStream, line: string): void {
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    if (obj['type'] === 'event') st.onEvent?.(obj)
    else if (!st.ackSeen) {
      st.ackSeen = true
      st.onAck?.(obj)
    } else st.onEvent?.(obj)
  }

  private finishStream(id: bigint, err?: Error): void {
    const st = this.streams.get(id)
    if (!st) return
    this.streams.delete(id)
    if (st.timer) clearTimeout(st.timer)
    if (st.subscription) {
      const tail = st.lineBuf.trim()
      st.lineBuf = ''
      if (tail) this.dispatchLine(st, tail)
      if (!st.ackSeen && (st.status ?? 200) >= 400) err ??= new MuseGatewayError(`HTTP ${st.status}`, 'http', st.status)
      st.onDone?.(err)
      return
    }
    if (err) st.rejectUnary?.(err)
    else {
      const total = st.chunks.reduce((n, c) => n + c.length, 0)
      const body = new Uint8Array(total)
      let o = 0
      for (const c of st.chunks) {
        body.set(c, o)
        o += c.length
      }
      st.resolveUnary?.({ status: st.status ?? 0, body, headers: st.responseHeaders })
    }
  }

  private buildRequest(method: string, params: Record<string, unknown>): { service: ServiceName; verb: string; path: string; body: Uint8Array; subscription: boolean } {
    const spec = MUSE_METHODS[method]
    if (!spec) throw new MuseGatewayError(`unknown muse method ${method}`, 'unknown_method')
    const { path, rest } = substitutePath(spec.path, params)
    const isGet = spec.httpMethod === 'GET'
    return {
      service: (spec.service ?? 'daemon') as ServiceName,
      verb: spec.httpMethod,
      path: isGet ? path + toQuery(rest) : path,
      body: isGet ? new Uint8Array(0) : new TextEncoder().encode(JSON.stringify(rest)),
      subscription: !!spec.subscription
    }
  }

  private send(
    service: ServiceName,
    verb: string,
    path: string,
    body: Uint8Array,
    extraHeaders: Array<[string, string]> = []
  ): bigint {
    if (!this.transport || !this.ws || this.ws.readyState !== WebSocket.OPEN) throw new MuseGatewayError('gateway not connected', 'closed')
    const headers: Array<[string, string]> = []
    if (verb !== 'GET' && body.length) headers.push(['Content-Type', 'application/json'])
    headers.push(['x-request-id', randomUUID()], ['x-app-id', APP_ID], ['Accept-Language', 'en-US'], ...extraHeaders)
    let enc: { streamId: bigint; frames: Uint8Array[] }
    try {
      enc = this.transport.encryptRequest({ service, verb, path, headers, body })
    } catch (e) {
      this.hardClose(4005, 'encrypt failed')
      throw new MuseGatewayError(`encrypt failed: ${e instanceof Error ? e.message : String(e)}`, 'closed')
    }
    for (const f of enc.frames) this.ws.send(f)
    return enc.streamId
  }

  /** Unary RPC. Returns parsed JSON (or text) body; throws on HTTP ≥ 400. */
  async request(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<unknown> {
    await this.connect()
    const req = this.buildRequest(method, params)
    if (req.subscription) throw new MuseGatewayError(`${method} is a subscription; use subscribe()`, 'unknown_method')
    const res = await new Promise<{ status: number; body: Uint8Array }>((resolve, reject) => {
      const id = this.send(req.service, req.verb, req.path, req.body)
      const st: PendingStream = { service: req.service, subscription: false, chunks: [], lineBuf: '', decoder: new TextDecoder(), ackSeen: false, resolveUnary: resolve, rejectUnary: reject }
      st.timer = setTimeout(() => {
        this.cancelStream(id, 'timeout')
        reject(new MuseGatewayError(`${method} timed out`, 'timeout'))
      }, timeoutMs)
      this.streams.set(id, st)
    })
    const text = new TextDecoder().decode(res.body)
    let json: unknown = text
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* keep text */
    }
    if (res.status >= 400) {
      const detail = json && typeof json === 'object' ? JSON.stringify(json).slice(0, 200) : String(text).slice(0, 200)
      throw new MuseGatewayError(`${method}: HTTP ${res.status} ${detail}`, 'http', res.status)
    }
    return json
  }

  /**
   * Unary RPC that returns the raw response bytes (fs.raw / media).
   * Optional Range via params._range = { start, end } → Range header.
   */
  async requestBinary(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 120_000
  ): Promise<{ status: number; body: Uint8Array; contentType?: string }> {
    await this.connect()
    const range = params['_range'] as { start?: number; end?: number } | undefined
    const clean = { ...params }
    delete clean['_range']
    const req = this.buildRequest(method, clean)
    if (req.subscription) throw new MuseGatewayError(`${method} is a subscription; use subscribe()`, 'unknown_method')
    const extraHeaders: Array<[string, string]> = []
    if (
      range &&
      Number.isSafeInteger(range.start) &&
      Number.isSafeInteger(range.end) &&
      (range.start as number) >= 0 &&
      (range.end as number) >= (range.start as number)
    ) {
      extraHeaders.push(['Range', `bytes=${range.start}-${range.end}`])
    }
    const res = await new Promise<{ status: number; body: Uint8Array; headers?: Array<[string, string]> }>((resolve, reject) => {
      const id = this.send(req.service, req.verb, req.path, req.body, extraHeaders)
      const st: PendingStream = {
        service: req.service,
        subscription: false,
        chunks: [],
        lineBuf: '',
        decoder: new TextDecoder(),
        ackSeen: false,
        resolveUnary: resolve,
        rejectUnary: reject
      }
      st.timer = setTimeout(() => {
        this.cancelStream(id, 'timeout')
        reject(new MuseGatewayError(`${method} timed out`, 'timeout'))
      }, timeoutMs)
      this.streams.set(id, st)
    })
    if (res.status >= 400) {
      const detail = new TextDecoder().decode(res.body).slice(0, 200)
      throw new MuseGatewayError(`${method}: HTTP ${res.status} ${detail}`, 'http', res.status)
    }
    const ct = res.headers?.find(([k]) => k.toLowerCase() === 'content-type')?.[1]
    return { status: res.status, body: res.body, contentType: ct }
  }

  /** Subscription RPC (chat.stream / chat.subscribe …): ack + NDJSON events on one stream. */
  async subscribe(method: string, params: Record<string, unknown>, onEvent: (e: Record<string, unknown>) => void): Promise<SubscriptionHandle> {
    await this.connect()
    const req = this.buildRequest(method, params)
    let resolveAck!: (v: Record<string, unknown>) => void
    let rejectAck!: (e: Error) => void
    let resolveDone!: () => void
    let rejectDone!: (e: Error) => void
    const ack = new Promise<Record<string, unknown>>((a, b) => {
      resolveAck = a
      rejectAck = b
    })
    const done = new Promise<void>((a, b) => {
      resolveDone = a
      rejectDone = b
    })
    ack.catch(() => undefined)
    done.catch(() => undefined)
    const id = this.send(req.service, req.verb, req.path, req.body)
    const st: PendingStream = {
      service: req.service,
      subscription: true,
      chunks: [],
      lineBuf: '',
      decoder: new TextDecoder(),
      ackSeen: false,
      onAck: resolveAck,
      onEvent,
      onDone: (err) => {
        if (err) {
          rejectAck(err)
          rejectDone(err)
        } else {
          resolveAck({})
          resolveDone()
        }
      }
    }
    this.streams.set(id, st)
    return { ack, done, cancel: (reason) => this.cancelStream(id, reason ?? 'cancelled') }
  }

  private cancelStream(id: bigint, reason: string): void {
    const st = this.streams.get(id)
    if (!st) return
    try {
      if (this.transport && this.ws?.readyState === WebSocket.OPEN) {
        for (const f of this.transport.encryptReset(st.service, id, reason)) this.ws.send(f)
      }
    } catch {
      this.hardClose(4005, 'reset send failed')
    }
    this.finishStream(id, reason === 'cancelled' ? undefined : new MuseGatewayError(reason, 'timeout'))
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeat = setInterval(() => {
      if (!this.isReady()) return
      this.request('connection.ping', { presence: 'visible' }, HEARTBEAT_TIMEOUT_MS).catch((e) => {
        if (e instanceof MuseGatewayError && e.code === 'timeout') this.hardClose(4002, 'heartbeat timeout')
      })
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
  }

  private hardClose(code: number, reason: string): void {
    const ws = this.ws
    if (!ws) return
    try {
      ws.close(code, reason)
    } catch {
      /* ignore */
    }
    // Do not wait for the close handshake; a poisoned cipher is never reused.
    this.onClose(ws, code, reason)
    setTimeout(() => {
      try {
        ws.terminate()
      } catch {
        /* ignore */
      }
    }, 1000)
  }

  private onClose(ws: WebSocket, code: number, reason: string): void {
    if (ws !== this.ws) return
    this.ws = null
    this.transport = null
    this.stopHeartbeat()
    const err = new MuseGatewayError(`gateway closed (${code}${reason ? ` ${reason.slice(0, 80)}` : ''})`, 'closed')
    for (const id of [...this.streams.keys()]) this.finishStream(id, err)
    if (code === 4001 || code === 4003 || code === 1008) this.forceRefresh = true
    this.log('muse-native: closed', { code })
    if (this.closedByUser) {
      this.setPhase('idle')
      return
    }
    this.setPhase('reconnecting', err.message)
    if (this.opts.keepAlive) this.scheduleReconnect()
  }

  private scheduleReconnect(authFailure = false): void {
    if (this.reconnectTimer || this.closedByUser) return
    const delay = authFailure ? 30_000 : backoffMs(this.attempt++, this.trusted)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch((e) => {
        const auth = e instanceof MuseGatewayError && (e.code === 'signed_out' || e.code === 'cvm_required')
        if (e instanceof MuseGatewayError && e.code === 'cvm_required') return // do not hammer a CVM
        this.scheduleReconnect(auth)
      })
    }, delay)
  }

  /** Test hook: drop the socket as if the network died. */
  simulateDrop(): void {
    this.ws?.terminate()
  }

  close(): void {
    this.closedByUser = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.stopHeartbeat()
    const ws = this.ws
    if (ws) {
      try {
        ws.close(1000, 'client closed')
      } catch {
        /* ignore */
      }
      this.onClose(ws, 1000, 'client closed')
    }
  }
}
