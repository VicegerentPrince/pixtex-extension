// "Open in Pixtex": handing a workflow to pixtex.dev without a URL ever
// carrying it.
//
//   1. The worker keeps the workflow in storage.session (memory only, and not
//      readable by content scripts) under a random 128-bit nonce.
//   2. It opens pixtex.dev/open#n=<nonce> — the nonce rides in the fragment,
//      which never reaches a server, and the page removes it at once.
//   3. The page claims the workflow over externally_connectable. The claim is
//      honoured only from the exact web origin, only from the very tab the
//      worker opened, only once, and only while it is fresh.
//
// The page has no window `message` listener at all, so no script on it can
// inject a workflow; only this extension can answer a claim, because Chrome
// exposes chrome.runtime.sendMessage to pixtex.dev only for extensions whose
// manifest lists it.

import type { ClaimResponse } from '../shared/protocol'
import type { ExportStyle, N8nWorkflow } from '../vendor/pixtex-types'

export interface HandoffRecord {
  workflow: N8nWorkflow
  style?: ExportStyle
  intent?: 'edit' | 'handover'
  createdAt: number
  /** The tab the worker opened for this handoff; -1 until tabs.create returns. */
  tabId: number
}

export const HANDOFF_PREFIX = 'handoff:'

/** storage.session holds 10 MB; a record must leave room for the others. */
export const MAX_HANDOFF_BYTES = 8 * 1024 * 1024

export function newNonce(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(16))
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * The handoff records nobody is going to collect. A claim — accepted or
 * refused — deletes its own record, but a pixtex.dev tab that never loads, or
 * is closed first, never claims at all, and memory is no place for a workflow
 * to wait until the browser quits. Anything past its time, or not a record we
 * wrote, is swept.
 */
export function staleHandoffKeys(stored: Record<string, unknown>, now: number, ttlMs: number): string[] {
  return Object.keys(stored).filter((key) => {
    if (!key.startsWith(HANDOFF_PREFIX)) return false
    const createdAt = (stored[key] as Partial<HandoffRecord> | null)?.createdAt
    return typeof createdAt !== 'number' || !(now - createdAt <= ttlMs)
  })
}

/**
 * Decides a claim. Pure, so every refusal is testable: the order matters —
 * an unknown nonce says nothing about origin or tab, and a wrong origin must
 * never learn whether a nonce exists.
 */
export function judgeClaim(input: {
  record: HandoffRecord | undefined
  senderOrigin: string | undefined
  senderTabId: number | undefined
  webOrigin: string
  now: number
  ttlMs: number
}): ClaimResponse | 'accept' {
  const { record, senderOrigin, senderTabId, webOrigin, now, ttlMs } = input
  if (senderOrigin !== webOrigin) return { ok: false, code: 'wrong-origin' }
  if (!record) return { ok: false, code: 'unknown' }
  if (now - record.createdAt > ttlMs) return { ok: false, code: 'expired' }
  if (record.tabId < 0 || senderTabId !== record.tabId) return { ok: false, code: 'wrong-tab' }
  return 'accept'
}
