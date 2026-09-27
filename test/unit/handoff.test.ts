import { describe, expect, it } from 'vitest'
import { judgeClaim, newNonce, staleHandoffKeys, type HandoffRecord } from '../../src/background/handoff'

/**
 * "Open in Pixtex" moves a whole workflow into a web page. Only pixtex.dev,
 * only the tab the extension opened, only once, only while fresh — and a
 * caller from the wrong origin must not even learn whether a nonce exists.
 */

const WEB = 'https://pixtex.dev'
const record = (over: Partial<HandoffRecord> = {}): HandoffRecord => ({
  workflow: { nodes: [], connections: {} }, createdAt: 1_000_000, tabId: 42, ...over,
})
const judge = (over: Partial<Parameters<typeof judgeClaim>[0]> = {}) => judgeClaim({
  record: record(), senderOrigin: WEB, senderTabId: 42, webOrigin: WEB, now: 1_000_000 + 5_000, ttlMs: 60_000, ...over,
})

describe('judgeClaim', () => {
  it('accepts the tab the extension opened, from pixtex.dev, while fresh', () => {
    expect(judge()).toBe('accept')
  })

  it('refuses any other origin before looking the nonce up', () => {
    for (const origin of ['https://pixtex.dev.evil.com', 'http://pixtex.dev', 'https://evil.com', undefined]) {
      expect(judge({ senderOrigin: origin })).toEqual({ ok: false, code: 'wrong-origin' })
      // same answer whether or not the nonce exists — no oracle
      expect(judge({ senderOrigin: origin, record: undefined })).toEqual({ ok: false, code: 'wrong-origin' })
    }
  })

  it('refuses an unknown or already-spent nonce', () => {
    expect(judge({ record: undefined })).toEqual({ ok: false, code: 'unknown' })
  })

  it('refuses a stale one', () => {
    expect(judge({ now: 1_000_000 + 60_001 })).toEqual({ ok: false, code: 'expired' })
  })

  it('refuses every tab but the one it opened — including before the tab is known', () => {
    expect(judge({ senderTabId: 7 })).toEqual({ ok: false, code: 'wrong-tab' })
    expect(judge({ senderTabId: undefined })).toEqual({ ok: false, code: 'wrong-tab' })
    expect(judge({ record: record({ tabId: -1 }), senderTabId: -1 })).toEqual({ ok: false, code: 'wrong-tab' })
  })
})

describe('staleHandoffKeys', () => {
  const now = 1_000_000 + 5_000

  it('sweeps a workflow nobody collected once it is past its time — and keeps a fresh one', () => {
    const stored = {
      'handoff:fresh': record(),
      'handoff:uncollected': record({ createdAt: now - 60_001 }),
      'handoff:mid-create': record({ tabId: -1, createdAt: now }),
    }
    expect(staleHandoffKeys(stored, now, 60_000)).toEqual(['handoff:uncollected'])
  })

  it('treats anything under the handoff prefix that is not a record as stale', () => {
    const stored = { 'handoff:a': null, 'handoff:b': { createdAt: 'yesterday' }, 'handoff:c': {} }
    expect(staleHandoffKeys(stored, now, 60_000)).toEqual(['handoff:a', 'handoff:b', 'handoff:c'])
  })

  it('never touches the other things session storage holds', () => {
    const stored = { caps: { at: 0 }, 'pending:abc': { createdAt: 0 } }
    expect(staleHandoffKeys(stored, now, 60_000)).toEqual([])
  })
})

describe('newNonce', () => {
  it('is 128 bits of url-safe base64 — 22 characters, nothing a URL has to escape', () => {
    const nonce = newNonce()
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(newNonce()).not.toBe(nonce)
  })
})
