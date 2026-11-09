import { describe, expect, it } from 'vitest'
import { extractReplyText } from './GrokBotAdapter'

const page = (...entries: Array<Record<string, unknown>>) => ({ entries })

describe('extractReplyText', () => {
  it('returns the answer that follows the sent message', () => {
    const p = page(
      { id: 'u1', role: 'user', text: 'old q' },
      { id: 'a1', role: 'assistant', text: 'old answer' },
      { id: 'u2', role: 'user', text: 'new q' },
      { id: 'a2', role: 'assistant', text: 'new answer' }
    )
    expect(extractReplyText(p, 'u2')).toBe('new answer')
  })

  it('does not return the previous answer while the new one is pending', () => {
    const p = page(
      { id: 'a1', role: 'assistant', text: 'old answer' },
      { id: 'u2', role: 'user', text: 'new q' }
    )
    expect(extractReplyText(p, 'u2')).toBe('')
  })

  it('needs the sent message on the page', () => {
    expect(extractReplyText(page({ id: 'a1', role: 'assistant', text: 'old answer' }), 'u2')).toBe('')
  })

  it('without an anchor returns the newest assistant text', () => {
    expect(extractReplyText(page({ id: 'a1', role: 'assistant', text: 'hi' }))).toBe('hi')
  })
})
