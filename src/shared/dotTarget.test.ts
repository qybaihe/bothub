import { describe, expect, it } from 'vitest'
import { resolveDotTarget } from './dotTarget'

const acc = { activeDotId: 'dot-new', roomId: 'room-new' }

describe('resolveDotTarget', () => {
  it('ignores a stale profile from the renderer after a switch', () => {
    expect(resolveDotTarget({ dotId: 'dot-old', roomId: 'room-old' }, acc)).toEqual({ dotId: 'dot-new', roomId: 'room-new' })
  })
  it('ignores a bare old room id (chat sessionId)', () => {
    expect(resolveDotTarget({ roomId: 'room-old' }, acc)).toEqual({ dotId: 'dot-new', roomId: 'room-new' })
  })
  it('uses the stored account when the request names nothing', () => {
    expect(resolveDotTarget({}, acc)).toEqual({ dotId: 'dot-new', roomId: 'room-new' })
  })
  it('keeps an explicit target that matches the active profile', () => {
    expect(resolveDotTarget({ dotId: 'dot-new', roomId: 'room-x' }, acc)).toEqual({ dotId: 'dot-new', roomId: 'room-x' })
  })
  it('passes through when nothing is stored yet', () => {
    expect(resolveDotTarget({ dotId: 'd', roomId: 'r' }, undefined)).toEqual({ dotId: 'd', roomId: 'r' })
  })
})
