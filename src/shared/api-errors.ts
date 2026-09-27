// What a failed render means to the person who clicked Export.
//
// The server's own messages are written to be read (they name the size, the
// limit and the fix), so they are shown as they are wherever there is one. The
// two 429s are told apart by Retry-After rather than by parsing wording: the
// burst window is 10 minutes, so a wait longer than that can only be the daily
// allowance for keyless renders.

import type { ExportFailureCode } from './protocol'

export interface RenderFailure {
  code: ExportFailureCode
  message: string
  retryAfterSec?: number
}

const BURST_WINDOW_SEC = 600

export function describeFailure(input: {
  status?: number
  error?: string
  fieldPath?: string
  retryAfterSec?: number
  aborted?: boolean
}): RenderFailure {
  const { status, error, fieldPath, retryAfterSec, aborted } = input

  if (aborted) {
    return { code: 'timeout', message: 'Pixtex took too long to answer. Big workflows can take a while — try again, or pick a smaller scale.' }
  }
  if (status === undefined) {
    return { code: 'network', message: 'Couldn’t reach Pixtex. Check your connection and try again.' }
  }
  if (status === 429) {
    if ((retryAfterSec ?? 0) > BURST_WINDOW_SEC) {
      return {
        code: 'daily-limit',
        message: error ?? 'That’s today’s keyless allowance. A free Pixtex key gives you a monthly allowance of your own.',
        retryAfterSec,
      }
    }
    const minutes = Math.max(1, Math.ceil((retryAfterSec ?? 60) / 60))
    return {
      code: 'burst-limit',
      message: `Pixtex allows 30 exports per 10 minutes from one network — try again in ${minutes} min.`,
      retryAfterSec,
    }
  }
  if (status === 413) {
    return { code: 'too-large', message: error ?? 'This workflow is too large to render.' }
  }
  if (status === 400) {
    if (fieldPath?.startsWith('workflowJson.nodes')) {
      return { code: 'too-many-nodes', message: 'Pixtex renders workflows of up to 500 nodes.' }
    }
    return {
      code: 'invalid',
      message: `Pixtex couldn’t read this workflow${fieldPath ? ` (${fieldPath})` : ''}${error ? ` — ${error}` : '.'}`,
    }
  }
  return { code: 'server', message: 'Pixtex is having trouble right now. Try again in a moment.' }
}

/** Retry-After as seconds — the header may also be an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds)
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, Math.round((at - now) / 1000)) : undefined
}

/** The first field path in a Zod-shaped `details` object, e.g. "workflowJson.nodes". */
export function firstFieldPath(details: unknown): string | undefined {
  if (typeof details !== 'object' || details === null) return undefined
  const fieldErrors = (details as { fieldErrors?: Record<string, unknown> }).fieldErrors
  if (!fieldErrors || typeof fieldErrors !== 'object') return undefined
  return Object.keys(fieldErrors)[0]
}
