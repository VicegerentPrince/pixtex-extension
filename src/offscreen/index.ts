// The offscreen document: sends the render request and holds the image.
//
// Two jobs the service worker cannot do. Chrome shuts a service worker down
// when a fetch() it started takes more than 30 seconds to answer, and a big
// workflow's render can queue for longer than that. And a content script's
// requests are held to the n8n page's CORS rules, so it cannot ask Pixtex at
// all. This page lives until the extension closes it, fetches from the
// extension's own origin, and turns the image into a blob: URL that the
// downloads API can save.
//
// It never waits on the service worker either: when the render finishes it
// SENDS a new message, which wakes the worker even if Chrome retired it in the
// meantime.

import { EXPORT_URL } from '../shared/config'
import { firstFieldPath, parseRetryAfter } from '../shared/api-errors'
import { isMsg, type OffscreenRenderMsg, type OffscreenResultMsg, type OffscreenRevokeMsg } from '../shared/protocol'

const TIMEOUT_MS = 120_000
/** A safety net: the worker revokes after the download completes. */
const REVOKE_AFTER_MS = 5 * 60_000

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isMsg<OffscreenRenderMsg>(message, 'offscreen:render') && message.target === 'offscreen') {
    void render(message)
  } else if (isMsg<OffscreenRevokeMsg>(message, 'offscreen:revoke') && message.target === 'offscreen') {
    URL.revokeObjectURL(message.blobUrl)
  }
  return false
})

async function render(msg: OffscreenRenderMsg): Promise<void> {
  const base = { v: 1, type: 'offscreen:result', reqId: msg.reqId, tabId: msg.tabId } as const
  let result: OffscreenResultMsg
  try {
    const res = await fetch(EXPORT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Counted by surface on the server — a name, never an identity.
        'X-Pixtex-Client': `extension/${msg.clientVersion}`,
        ...(msg.auth ? { Authorization: `Bearer ${msg.auth}` } : {}),
      },
      body: JSON.stringify(msg.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.ok) {
      const blobUrl = URL.createObjectURL(await res.blob())
      setTimeout(() => URL.revokeObjectURL(blobUrl), REVOKE_AFTER_MS)
      result = {
        ...base,
        ok: true,
        blobUrl,
        contentDisposition: res.headers.get('Content-Disposition'),
        tier: res.headers.get('X-Pixtex-Tier'),
        scale: res.headers.get('X-Pixtex-Scale'),
      }
    } else {
      let error: string | undefined
      let fieldPath: string | undefined
      try {
        const body = (await res.json()) as { error?: unknown; details?: unknown }
        error = typeof body.error === 'string' ? body.error : undefined
        fieldPath = firstFieldPath(body.details)
      } catch {
        /* a non-JSON error body says nothing more than its status */
      }
      result = { ...base, ok: false, status: res.status, error, fieldPath, retryAfterSec: parseRetryAfter(res.headers.get('Retry-After')) }
    }
  } catch (error) {
    const aborted = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
    result = { ...base, ok: false, aborted }
  }
  await chrome.runtime.sendMessage(result).catch(() => {
    /* the worker restarts on this message; nothing to do if it cannot */
  })
}
