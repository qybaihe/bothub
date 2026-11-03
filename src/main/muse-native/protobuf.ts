/** Minimal proto3 wire codec for the handful of Hatch Noise messages. */

export class PbWriter {
  private parts: number[] = []

  private varint(v: bigint): void {
    let x = BigInt.asUintN(64, v)
    while (x > 0x7fn) {
      this.parts.push(Number((x & 0x7fn) | 0x80n))
      x >>= 7n
    }
    this.parts.push(Number(x))
  }

  private tag(field: number, wire: number): void {
    this.varint(BigInt((field << 3) | wire))
  }

  uint(field: number, v: number | bigint): this {
    this.tag(field, 0)
    this.varint(BigInt(v))
    return this
  }

  bool(field: number, v: boolean): this {
    return this.uint(field, v ? 1 : 0)
  }

  bytes(field: number, v: Uint8Array): this {
    this.tag(field, 2)
    this.varint(BigInt(v.length))
    for (const b of v) this.parts.push(b)
    return this
  }

  string(field: number, v: string): this {
    return this.bytes(field, new TextEncoder().encode(v))
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.parts)
  }
}

export interface PbField {
  field: number
  wire: number
  /** varint value (wire 0) */
  int?: bigint
  /** length-delimited value (wire 2) */
  bytes?: Uint8Array
}

/** Decode a flat list of fields. Throws on malformed input. */
export function pbDecode(buf: Uint8Array): PbField[] {
  const out: PbField[] = []
  let pos = 0
  const readVarint = (): bigint => {
    let result = 0n
    let shift = 0n
    for (;;) {
      if (pos >= buf.length) throw new Error('pb: truncated varint')
      const b = buf[pos++]!
      result |= BigInt(b & 0x7f) << shift
      if ((b & 0x80) === 0) return result
      shift += 7n
      if (shift > 70n) throw new Error('pb: varint too long')
    }
  }
  while (pos < buf.length) {
    const key = Number(readVarint())
    const field = key >>> 3
    const wire = key & 7
    if (field === 0) throw new Error('pb: field 0')
    if (wire === 0) out.push({ field, wire, int: readVarint() })
    else if (wire === 2) {
      const len = Number(readVarint())
      if (pos + len > buf.length) throw new Error('pb: truncated bytes')
      out.push({ field, wire, bytes: buf.subarray(pos, pos + len) })
      pos += len
    } else if (wire === 1) pos += 8
    else if (wire === 5) pos += 4
    else throw new Error(`pb: unsupported wire type ${wire}`)
  }
  return out
}

export function pbGet(fields: PbField[], n: number): PbField | undefined {
  return fields.find((f) => f.field === n)
}

export const utf8 = {
  enc: (s: string): Uint8Array => new TextEncoder().encode(s),
  dec: (b: Uint8Array): string => new TextDecoder().decode(b)
}
