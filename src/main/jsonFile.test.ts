import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readJsonFile, writeJsonAtomic } from './jsonFile'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bothub-json-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const isObject = (raw: unknown) => Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw)

describe('jsonFile', () => {
  it('round-trips and leaves no temp file', () => {
    const p = join(dir, 'nested', 'store.json')
    writeJsonAtomic(p, { a: 1 })
    expect(readJsonFile(p, {}, isObject)).toEqual({ a: 1 })
    expect(readdirSync(join(dir, 'nested'))).toEqual(['store.json'])
  })

  it('moves a corrupt file aside instead of losing it', () => {
    const p = join(dir, 'store.json')
    writeFileSync(p, '{"a":')
    expect(readJsonFile(p, { empty: true }, isObject)).toEqual({ empty: true })
    const kept = readdirSync(dir).find((f) => f.startsWith('store.json.corrupt-'))
    expect(kept).toBeDefined()
    expect(readFileSync(join(dir, kept!), 'utf8')).toBe('{"a":')
  })

  it('falls back when the shape is wrong', () => {
    const p = join(dir, 'store.json')
    writeJsonAtomic(p, [1, 2])
    expect(readJsonFile(p, {}, isObject)).toEqual({})
  })
})
