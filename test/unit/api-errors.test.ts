import { describe, expect, it } from 'vitest'
import { describeFailure, firstFieldPath, parseRetryAfter } from '../../src/shared/api-errors'

describe('describeFailure', () => {
  // The two 429s are told apart by how long the server says to wait — the
  // burst window is 10 minutes — never by parsing its wording.
  it('reads a long wait as the daily keyless allowance, and shows the server’s own words', () => {
    const f = describeFailure({ status: 429, retryAfterSec: 50_000, error: 'Daily limit for keyless renders reached.' })
    expect(f.code).toBe('daily-limit')
    expect(f.message).toBe('Daily limit for keyless renders reached.')
  })

  it('reads a short wait as the burst limit, in minutes', () => {
    const f = describeFailure({ status: 429, retryAfterSec: 125 })
    expect(f.code).toBe('burst-limit')
    expect(f.message).toContain('3 min')
  })

  it('passes a 413 through as the server wrote it', () => {
    expect(describeFailure({ status: 413, error: 'Workflow is 11.2 MB — the limit is 10.0 MB.' }))
      .toEqual({ code: 'too-large', message: 'Workflow is 11.2 MB — the limit is 10.0 MB.' })
  })

  it('names the node limit when the nodes array is what was refused', () => {
    expect(describeFailure({ status: 400, fieldPath: 'workflowJson.nodes' }).code).toBe('too-many-nodes')
  })

  it('names the field for any other 400', () => {
    const f = describeFailure({ status: 400, fieldPath: 'options.scale', error: 'Invalid request' })
    expect(f.code).toBe('invalid')
    expect(f.message).toContain('options.scale')
  })

  it('separates a timeout, an unreachable server and a server error', () => {
    expect(describeFailure({ aborted: true }).code).toBe('timeout')
    expect(describeFailure({}).code).toBe('network')
    expect(describeFailure({ status: 503 }).code).toBe('server')
  })
})

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates, and nothing else', () => {
    expect(parseRetryAfter('120')).toBe(120)
    expect(parseRetryAfter(new Date(Date.UTC(2030, 0, 1, 0, 1)).toUTCString(), Date.UTC(2030, 0, 1))).toBe(60)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })
})

describe('firstFieldPath', () => {
  it('finds the first field in a Zod error shape', () => {
    expect(firstFieldPath({ fieldErrors: { 'workflowJson.nodes': ['too many'] } })).toBe('workflowJson.nodes')
    expect(firstFieldPath({ formErrors: [] })).toBeUndefined()
    expect(firstFieldPath('nope')).toBeUndefined()
  })
})
