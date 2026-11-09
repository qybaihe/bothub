import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BotAccount, ChatMessage } from '@/types'
import {
  clearNoReplyFlag,
  createInFlightSet,
  deliveryAfterError,
  INTERRUPTED_REPLY_TEXT,
  createSafeStorage,
  INTERRUPTED_SEND_TEXT,
  sanitizePersisted,
  SendTimeoutError,
  toPersistedMessages,
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

describe('toPersistedMessages', () => {
  it('drops attachment bytes and keeps only the newest messages', () => {
    const list = Array.from({ length: 5 }, (_, i) =>
      msg({ id: String(i), attachments: [{ id: 'f', name: 'a.png', size: 9, mimeType: 'image/png', dataBase64: 'AAAA' }] })
    )
    const out = toPersistedMessages({ b: list }, 3)
    expect(out.b!.map((m) => m.id)).toEqual(['2', '3', '4'])
    expect(out.b![0]!.attachments![0]).toEqual({ id: 'f', name: 'a.png', size: 9, mimeType: 'image/png' })
    // The in-memory message is untouched.
    expect(list[4]!.attachments![0]!.dataBase64).toBe('AAAA')
  })
})

describe('createSafeStorage', () => {
  it('swallows quota errors and reports them', () => {
    const onError = vi.fn()
    const storage = createSafeStorage(
      () => ({
        getItem: () => 'x',
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
        removeItem: () => undefined
      }),
      onError
    )
    expect(() => storage.setItem('k', 'v')).not.toThrow()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(storage.getItem('k')).toBe('x')
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

describe('accepted delivery', () => {
  const msg = (delivery: ChatMessage['delivery']): ChatMessage =>
    ({ id: 'm1', botId: 'b', accountId: 'a', role: 'user', text: 'hi', createdAt: 1, delivery }) as ChatMessage

  it('never reports an accepted message as failed', () => {
    expect(deliveryAfterError(true, 'other', 'socket closed').delivery).toBe('no-reply')
    expect(deliveryAfterError(true, 'timeout', 't').delivery).toBe('no-reply')
    expect(deliveryAfterError(false, 'other', 'boom')).toEqual({ delivery: 'failed', error: 'boom' })
    expect(deliveryAfterError(false, 'no-reply', 'x')).toEqual({ delivery: 'no-reply', error: 'x' })
  })

  it('lets only one delivery per message run', () => {
    const set = createInFlightSet()
    expect(set.enter('m1')).toBe(true)
    expect(set.enter('m1')).toBe(false)
    set.leave('m1')
    expect(set.enter('m1')).toBe(true)
  })

  it('turns an accepted message into no-reply after a restart', () => {
    const out = sanitizePersisted({ messages: { b: [msg('accepted')] } })
    expect(out.messages!.b![0]).toMatchObject({ delivery: 'no-reply', error: INTERRUPTED_REPLY_TEXT })
  })

  it('marks an accepted message sent when the reply lands', () => {
    expect(clearNoReplyFlag([msg('accepted')])[0]!.delivery).toBe('sent')
  })
})
