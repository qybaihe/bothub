/**
 * Noise_XX_25519_AESGCM_SHA256 initiator, ported from muse.ai's NoiseXX
 * (js/2iv-bzae6ju_t.js). AES-GCM, empty AD for transport, nonce = u64 BE at
 * IV bytes 4..11.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  type KeyObject
} from 'node:crypto'

const PROTOCOL = 'Noise_XX_25519_AESGCM_SHA256'
const EMPTY = new Uint8Array(0)

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function hmac(key: Uint8Array, data: Uint8Array): Uint8Array {
  return new Uint8Array(createHmac('sha256', key).update(data).digest())
}

/** Noise HKDF with two outputs. */
function hkdf2(ck: Uint8Array, ikm: Uint8Array): [Uint8Array, Uint8Array] {
  const temp = hmac(ck, ikm)
  const o1 = hmac(temp, Uint8Array.of(1))
  const o2 = hmac(temp, concat(o1, Uint8Array.of(2)))
  return [o1, o2]
}

interface X25519Pair {
  priv: KeyObject
  pub: Uint8Array
}

function genX25519(): X25519Pair {
  const { privateKey, publicKey } = generateKeyPairSync('x25519')
  const jwk = publicKey.export({ format: 'jwk' })
  return { priv: privateKey, pub: new Uint8Array(Buffer.from(jwk.x as string, 'base64url')) }
}

function dh(priv: KeyObject, remotePub: Uint8Array): Uint8Array {
  const pub = createPublicKey({
    key: { kty: 'OKP', crv: 'X25519', x: Buffer.from(remotePub).toString('base64url') },
    format: 'jwk'
  })
  return new Uint8Array(diffieHellman({ privateKey: priv, publicKey: pub }))
}

export class CipherState {
  private key: Uint8Array | null = null
  private n = 0
  private poisoned = false

  constructor(key?: Uint8Array) {
    if (key) this.key = key
  }

  hasKey(): boolean {
    return this.key !== null
  }

  private iv(): Buffer {
    if (this.n >= Number.MAX_SAFE_INTEGER) {
      this.poisoned = true
      throw new Error('CipherState: nonce exhausted')
    }
    const iv = Buffer.alloc(12)
    iv.writeBigUInt64BE(BigInt(this.n++), 4)
    return iv
  }

  encryptWithAd(ad: Uint8Array, plaintext: Uint8Array): Uint8Array {
    if (this.poisoned) throw new Error('CipherState: poisoned')
    if (!this.key) return plaintext
    try {
      const c = createCipheriv('aes-256-gcm', this.key, this.iv())
      c.setAAD(ad)
      const body = Buffer.concat([c.update(plaintext), c.final(), c.getAuthTag()])
      return new Uint8Array(body)
    } catch (e) {
      this.poisoned = true
      throw e
    }
  }

  decryptWithAd(ad: Uint8Array, ciphertext: Uint8Array): Uint8Array {
    if (this.poisoned) throw new Error('CipherState: poisoned')
    if (!this.key) return ciphertext
    try {
      if (ciphertext.length < 16) throw new Error('CipherState: ciphertext too short')
      const d = createDecipheriv('aes-256-gcm', this.key, this.iv())
      d.setAAD(ad)
      d.setAuthTag(ciphertext.subarray(ciphertext.length - 16))
      return new Uint8Array(Buffer.concat([d.update(ciphertext.subarray(0, ciphertext.length - 16)), d.final()]))
    } catch (e) {
      this.poisoned = true
      throw e
    }
  }
}

class SymmetricState {
  private h: Uint8Array
  private ck: Uint8Array
  private cs = new CipherState()

  constructor() {
    const name = new TextEncoder().encode(PROTOCOL)
    const h = new Uint8Array(32)
    h.set(name) // name is exactly 28 bytes → zero-padded
    this.h = h
    this.ck = new Uint8Array(h)
    this.mixHash(EMPTY) // prologue
  }

  mixHash(data: Uint8Array): void {
    this.h = new Uint8Array(createHash('sha256').update(concat(this.h, data)).digest())
  }

  mixKey(ikm: Uint8Array): void {
    const [ck, k] = hkdf2(this.ck, ikm)
    this.ck = ck
    this.cs = new CipherState(k)
  }

  encryptAndHash(p: Uint8Array): Uint8Array {
    const c = this.cs.encryptWithAd(this.h, p)
    this.mixHash(c)
    return c
  }

  decryptAndHash(c: Uint8Array): Uint8Array {
    const p = this.cs.decryptWithAd(this.h, c)
    this.mixHash(c)
    return p
  }

  split(): [CipherState, CipherState] {
    const [k1, k2] = hkdf2(this.ck, EMPTY)
    return [new CipherState(k1), new CipherState(k2)]
  }

  handshakeHash(): Uint8Array {
    return new Uint8Array(this.h)
  }
}

/** XX initiator: -> e ; <- e, ee, s, es ; -> s, se */
export class NoiseXXInitiator {
  private ss = new SymmetricState()
  private e: X25519Pair | null = null
  private re: Uint8Array | null = null
  private rs: Uint8Array | null = null
  private phase = 1

  writeMessage1(payload: Uint8Array): Uint8Array {
    if (this.phase !== 1) throw new Error('NoiseXX: writeMessage1 wrong phase')
    this.e = genX25519()
    this.ss.mixHash(this.e.pub)
    const c = this.ss.encryptAndHash(payload)
    this.phase = 2
    return concat(this.e.pub, c)
  }

  readMessage2(msg: Uint8Array): Uint8Array {
    if (this.phase !== 2 || !this.e) throw new Error('NoiseXX: readMessage2 wrong phase')
    if (msg.length < 96) throw new Error(`NoiseXX: message 2 too short (${msg.length})`)
    this.re = msg.slice(0, 32)
    this.ss.mixHash(this.re)
    this.ss.mixKey(dh(this.e.priv, this.re))
    this.rs = this.ss.decryptAndHash(msg.subarray(32, 80))
    this.ss.mixKey(dh(this.e.priv, this.rs))
    const payload = this.ss.decryptAndHash(msg.subarray(80))
    this.phase = 3
    return payload
  }

  writeMessage3(payload: Uint8Array): Uint8Array {
    if (this.phase !== 3 || !this.re) throw new Error('NoiseXX: writeMessage3 wrong phase')
    const s = genX25519() // official client uses an ephemeral static key
    const c1 = this.ss.encryptAndHash(s.pub)
    this.ss.mixKey(dh(s.priv, this.re))
    const c2 = this.ss.encryptAndHash(payload)
    this.phase = 4
    return concat(c1, c2)
  }

  /** Returns [send, recv]. */
  split(): [CipherState, CipherState] {
    if (this.phase !== 4) throw new Error('NoiseXX: split wrong phase')
    this.phase = 5
    return this.ss.split()
  }

  remoteStatic(): Uint8Array | null {
    return this.rs
  }

  handshakeHash(): Uint8Array {
    return this.ss.handshakeHash()
  }
}
