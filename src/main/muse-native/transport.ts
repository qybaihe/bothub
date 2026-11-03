/** HTTP-over-Noise framing (NoiseTransportFrame → ServiceRequest/Response → ServiceFrame). */
import { randomBytes } from 'node:crypto'
import type { CipherState } from './noise'
import { PbWriter, pbDecode, pbGet, utf8, type PbField } from './protobuf'

const EMPTY = new Uint8Array(0)
const MAX_CHUNK = 65489

export const SERVICE = { daemon: 0, sentinel: 1, vault: 2, authd: 3, ssh_access: 4 } as const
export type ServiceName = keyof typeof SERVICE

export interface HttpRequest {
  service: ServiceName
  verb: string
  path: string
  headers: Array<[string, string]>
  body: Uint8Array
}

export type InboundFrame =
  | { kind: 'response'; streamId: bigint; status: number; headers: Array<[string, string]>; body: Uint8Array; endBody: boolean }
  | { kind: 'bodyChunk'; streamId: bigint; data: Uint8Array; endBody: boolean }
  | { kind: 'reset'; streamId: bigint; code: number; reason: string }

function encodeHeaders(w: PbWriter, field: number, headers: Array<[string, string]>): void {
  for (const [k, v] of headers) w.bytes(field, new PbWriter().string(1, k).string(2, v).finish())
}

function decodeHeaders(fields: PbField[], field: number): Array<[string, string]> {
  return fields
    .filter((f) => f.field === field && f.bytes)
    .map((f) => {
      const h = pbDecode(f.bytes!)
      return [utf8.dec(pbGet(h, 1)?.bytes ?? EMPTY), utf8.dec(pbGet(h, 2)?.bytes ?? EMPTY)] as [string, string]
    })
}

export class NoiseTransport {
  private nextStreamId = 1n
  private dead = false
  private assemblies = new Map<bigint, { total: number; chunks: Map<number, Uint8Array>; bytes: number; at: number }>()

  constructor(
    private readonly send: CipherState,
    private readonly recv: CipherState
  ) {}

  isDead(): boolean {
    return this.dead
  }

  private guard<T>(fn: () => T): T {
    if (this.dead) throw new Error('NoiseTransport: dead after prior failure')
    try {
      return fn()
    } catch (e) {
      this.dead = true
      throw e
    }
  }

  /** Returns encrypted WS messages for a unary request. */
  encryptRequest(req: HttpRequest): { streamId: bigint; frames: Uint8Array[] } {
    return this.guard(() => {
      const streamId = this.nextStreamId++
      const app = new PbWriter().string(1, req.verb).string(2, req.path)
      encodeHeaders(app, 3, req.headers)
      if (req.body.length) app.bytes(4, req.body)
      app.bool(5, true)
      const frame = new PbWriter().uint(1, streamId).bytes(2, app.finish()).finish()
      return { streamId, frames: this.wrap(req.service, frame) }
    })
  }

  encryptReset(service: ServiceName, streamId: bigint, reason = ''): Uint8Array[] {
    return this.guard(() => {
      const reset = new PbWriter().uint(1, 1 /* CANCELLED */)
      if (reason) reset.string(2, reason)
      const frame = new PbWriter().uint(1, streamId).bytes(5, reset.finish()).finish()
      return this.wrap(service, frame)
    })
  }

  private wrap(service: ServiceName, serviceFrame: Uint8Array): Uint8Array[] {
    const sr = new PbWriter()
    if (SERVICE[service] !== 0) sr.uint(1, SERVICE[service])
    sr.bytes(2, serviceFrame)
    const payload = sr.finish()
    const chunkId = BigInt.asIntN(64, randomBytes(8).readBigUInt64LE())
    const total = Math.max(1, Math.ceil(payload.length / MAX_CHUNK))
    if (total > 256) throw new Error('payload too large for noise framing')
    const out: Uint8Array[] = []
    for (let i = 0; i < total; i++) {
      const part = payload.subarray(i * MAX_CHUNK, Math.min((i + 1) * MAX_CHUNK, payload.length))
      const f = new PbWriter().uint(1, chunkId).uint(2, i).uint(3, total).bytes(4, part).finish()
      out.push(this.send.encryptWithAd(EMPTY, f))
    }
    return out
  }

  /** Decrypt one WS message; null while a multi-chunk assembly is incomplete. */
  decrypt(msg: Uint8Array): InboundFrame | null {
    return this.guard(() => {
      const plain = this.recv.decryptWithAd(EMPTY, msg)
      const nf = pbDecode(plain)
      const chunkId = BigInt.asIntN(64, pbGet(nf, 1)?.int ?? 0n)
      const index = Number(pbGet(nf, 2)?.int ?? 0n)
      const total = Number(pbGet(nf, 3)?.int ?? 1n)
      const payload = pbGet(nf, 4)?.bytes ?? EMPTY
      if (total < 1 || total > 256 || index < 0 || index >= total) throw new Error('bad noise chunk header')
      let whole: Uint8Array
      if (total === 1) whole = payload
      else {
        const now = Date.now()
        for (const [k, a] of this.assemblies) if (now - a.at > 60_000) this.assemblies.delete(k)
        let a = this.assemblies.get(chunkId)
        if (!a) {
          if (this.assemblies.size >= 16) throw new Error('too many pending assemblies')
          a = { total, chunks: new Map(), bytes: 0, at: now }
          this.assemblies.set(chunkId, a)
        }
        if (a.total !== total || a.chunks.has(index)) throw new Error('inconsistent noise chunks')
        a.bytes += payload.length
        if (a.bytes > 0x1000000) throw new Error('assembly exceeded byte budget')
        a.chunks.set(index, new Uint8Array(payload))
        if (a.chunks.size < total) return null
        this.assemblies.delete(chunkId)
        const parts = Array.from({ length: total }, (_, i) => a!.chunks.get(i)!)
        whole = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
        let o = 0
        for (const p of parts) {
          whole.set(p, o)
          o += p.length
        }
      }
      const resp = pbGet(pbDecode(whole), 1)?.bytes
      if (!resp || resp.length === 0) throw new Error('empty ServiceResponse payload')
      const sf = pbDecode(resp)
      const streamId = BigInt.asIntN(64, pbGet(sf, 1)?.int ?? 0n)
      const r = pbGet(sf, 3)?.bytes
      if (r) {
        const f = pbDecode(r)
        return {
          kind: 'response',
          streamId,
          status: Number(pbGet(f, 1)?.int ?? 0n),
          headers: decodeHeaders(f, 2),
          body: new Uint8Array(pbGet(f, 3)?.bytes ?? EMPTY),
          endBody: (pbGet(f, 4)?.int ?? 0n) !== 0n
        }
      }
      const bc = pbGet(sf, 4)?.bytes
      if (bc) {
        const f = pbDecode(bc)
        return { kind: 'bodyChunk', streamId, data: new Uint8Array(pbGet(f, 1)?.bytes ?? EMPTY), endBody: (pbGet(f, 2)?.int ?? 0n) !== 0n }
      }
      const rs = pbGet(sf, 5)?.bytes
      if (rs) {
        const f = pbDecode(rs)
        return { kind: 'reset', streamId, code: Number(pbGet(f, 1)?.int ?? 0n), reason: utf8.dec(pbGet(f, 2)?.bytes ?? EMPTY) }
      }
      if (pbGet(sf, 2)) throw new Error('NoiseTransport: unexpected request frame from server')
      return null
    })
  }
}
