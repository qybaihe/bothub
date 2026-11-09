import { describe, expect, it } from 'vitest'
import { chromiumProxyRule, createMutex, planPoolAssignment, releasePoolSlot } from './proxyPool'

const pool = (...owners: Array<string | undefined>) => owners.map((o, i) => ({ id: `p${i}`, assignedAccountId: o }))

describe('planPoolAssignment', () => {
  it('keeps existing slots and fills new accounts from free ones', () => {
    const { pool: next, assigned } = planPoolAssignment(pool('a', undefined, undefined), ['a', 'b'])
    expect(next.map((s) => s.assignedAccountId)).toEqual(['a', 'b', undefined])
    expect(assigned.map((x) => [x.accountId, x.slot.id])).toEqual([['a', 'p0'], ['b', 'p1']])
  })

  it('does not hand an in-flight account slot to someone else', () => {
    // "a" is still logging in and was left out of the caller list.
    const { pool: next } = planPoolAssignment(pool('a', undefined), ['b'], (id) => id === 'a')
    expect(next.map((s) => s.assignedAccountId)).toEqual(['a', 'b'])
  })

  it('never shares a slot when the pool runs out', () => {
    const { pool: next, assigned } = planPoolAssignment(pool(undefined), ['a', 'b'])
    expect(next[0]!.assignedAccountId).toBe('a')
    expect(assigned.map((x) => x.accountId)).toEqual(['a'])
  })

  it('does not mutate the input', () => {
    const input = pool('x')
    planPoolAssignment(input, ['y'])
    expect(input[0]!.assignedAccountId).toBe('x')
  })
})

describe('releasePoolSlot', () => {
  it('frees only that account', () => {
    expect(releasePoolSlot(pool('a', 'b'), 'a').map((s) => s.assignedAccountId)).toEqual([undefined, 'b'])
  })
})

describe('chromiumProxyRule', () => {
  it('never puts credentials into the rule', () => {
    expect(chromiumProxyRule({ mode: 'http', host: 'h.test', port: 8080 })).toBe('http://h.test:8080')
    expect(chromiumProxyRule({ mode: 'socks5h', host: 'h.test', port: 1080 })).toBe('socks5://h.test:1080')
    expect(chromiumProxyRule({ mode: 'socks5', host: '::1', port: 1080 })).toBe('socks5://[::1]:1080')
    expect(chromiumProxyRule({ mode: 'direct' })).toBeNull()
  })
})

describe('createMutex', () => {
  it('runs sections one at a time even across awaits', async () => {
    const lock = createMutex()
    let value = 0
    const bump = () =>
      lock(async () => {
        const read = value
        await new Promise((r) => setTimeout(r, 5))
        value = read + 1
      })
    await Promise.all([bump(), bump(), bump()])
    expect(value).toBe(3)
  })

  it('keeps going after a section throws', async () => {
    const lock = createMutex()
    await expect(lock(() => Promise.reject(new Error('x')))).rejects.toThrow('x')
    await expect(lock(() => 1)).resolves.toBe(1)
  })
})
