import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BotAccount, ChatMessage } from '@/types'
import {
  clearNoReplyFlag,
  INTERRUPTED_SEND_TEXT,
  sanitizePersisted,
  SendTimeoutError,
  withTimeout
} from './delivery'

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: over.id ?? 'm',
  botId: 'b',
  accountId: 'a',
  role: 'user',
  text: 'hi',
  createdAt: 1,
  ...over
})

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('resolves when the promise wins', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7)
  })

  it('rejects with SendTimeoutError and reports a late result', async () => {
    let finish!: (v: number) => void
    const slow = new Promise<number>((r) => (finish = r))
    const late = vi.fn()
    const raced = withTimeout(slow, 1000, late)
    const assertion = expect(raced).rejects.toBeInstanceOf(SendTimeoutError)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    finish(3)
    await Promise.resolve()
    expect(late).toHaveBeenCalledWith({ ok: true, value: 3 })
  })

  it('passes through rejections before the deadline', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
  })
})

describe('sanitizePersisted', () => {
  it('turns in-flight messages into failed ones and clears pending accounts', () => {
    const accounts: Record<string, BotAccount> = {
      a: { id: 'a', platformId: 'meta-muse', displayName: 'A', handle: '', status: 'busy', pending: true },
      b: { id: 'b', platformId: 'grok', displayName: 'B', handle: '', status: 'online' }
    }
    const out = sanitizePersisted({
      messages: { b: [msg({ id: '1', delivery: 'sent' }), msg({ id: '2', delivery: 'sending' })] },
      accounts
    })
    expect(out.messages!.b![0]!.delivery).toBe('sent')
    expect(out.messages!.b![1]).toMatchObject({ delivery: 'failed', error: INTERRUPTED_SEND_TEXT })
    expect(out.accounts!.a).toMatchObject({ pending: false, status: 'offline' })
    expect(out.accounts!.b).toBe(accounts.b)
  })

  it('returns the same object when nothing needs fixing', () => {
    const state = { messages: { b: [msg({ delivery: 'sent' })] }, accounts: {} }
    expect(sanitizePersisted(state)).toBe(state)
  })
})

describe('clearNoReplyFlag', () => {
  it('clears the newest user no-reply flag once a bot message lands', () => {
    const list = [
      msg({ id: '1', delivery: 'no-reply', error: 'x' }),
      msg({ id: '2', role: 'bot' })
    ]
    const out = clearNoReplyFlag(list)
    expect(out[0]).toMatchObject({ delivery: 'sent', error: undefined })
  })

  it('leaves older flags alone when the latest user message is fine', () => {
    const list = [msg({ id: '1', delivery: 'no-reply' }), msg({ id: '2', delivery: 'sent' }), msg({ id: '3', role: 'bot' })]
    expect(clearNoReplyFlag(list)).toBe(list)
  })
})
