import { describe, expect, it, vi } from 'vitest'
import { HarkWatchRegistry } from './watchRegistry'

describe('HarkWatchRegistry', () => {
  it('keeps concurrent watches of one account alive', () => {
    const reg = new HarkWatchRegistry()
    const first = vi.fn()
    const t1 = reg.add('acc', first, 'r1')
    reg.add('acc', vi.fn(), 'r2')
    expect(first).not.toHaveBeenCalled()
    expect(reg.size('acc')).toBe(2)
    expect([...reg.claimedByOthers('acc', t1)]).toEqual(['r2'])
  })

  it('cancelAll stops every watch and remove forgets one', () => {
    const reg = new HarkWatchRegistry()
    const a = vi.fn()
    const b = vi.fn()
    const t = reg.add('acc', a)
    reg.add('acc', b)
    reg.remove('acc', t)
    reg.cancelAll('acc')
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledOnce()
    expect(reg.size('acc')).toBe(0)
  })
})
