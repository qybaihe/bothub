import { describe, expect, it } from 'vitest'
import { REPLY_BUSY_LIMIT_MS, REPLY_IDLE_LIMIT_MS, ReplyWatchdog } from './replyWatchdog'

describe('ReplyWatchdog', () => {
  it('flags a typing bot that went quiet, but not one still streaming', () => {
    let t = 0
    const w = new ReplyWatchdog(() => t)
    w.touch('a')
    w.touch('b')
    t = REPLY_IDLE_LIMIT_MS - 1
    w.touch('b')
    t = REPLY_IDLE_LIMIT_MS
    expect(w.stalled(['a', 'b'], () => false)).toEqual(['a'])
  })

  it('waits longer while the agent reports busy', () => {
    let t = 0
    const w = new ReplyWatchdog(() => t)
    w.touch('a')
    t = REPLY_IDLE_LIMIT_MS
    expect(w.stalled(['a'], () => true)).toEqual([])
    t = REPLY_BUSY_LIMIT_MS
    expect(w.stalled(['a'], () => true)).toEqual(['a'])
  })

  it('starts the clock for bots it has not seen and drops idle ones', () => {
    let t = 0
    const w = new ReplyWatchdog(() => t)
    expect(w.stalled(['x'], () => false)).toEqual([])
    t = REPLY_IDLE_LIMIT_MS
    expect(w.stalled(['x'], () => false)).toEqual(['x'])
    expect(w.stalled([], () => false)).toEqual([])
    expect(w.stalled(['x'], () => false)).toEqual([])
  })
})
