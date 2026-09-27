import { describe, expect, it, vi } from 'vitest'
import { cardGeometryFor, fetchSettings, fetchWorkflow, type ExtractDeps } from '../../src/n8n/extract'

/**
 * The logout hazard, pinned: n8n clears the session when a request arrives
 * without the right `browser-id` (confirmed on 2.30.7 — the next correctly
 * headed request was refused too). These tests are the reason it can't come
 * back quietly: the header is the page's own, never invented, and a refusal is
 * never retried.
 */

const WF = { name: 'Flow', nodes: [], connections: {} }

function deps(opts: { browserId?: string | null; status?: number; body?: unknown; throws?: boolean }): ExtractDeps & { fetch: ReturnType<typeof vi.fn> } {
  const fetch = vi.fn(async () => {
    if (opts.throws) throw new TypeError('network')
    return new Response(JSON.stringify(opts.body ?? { data: WF }), { status: opts.status ?? 200 })
  })
  return {
    fetch: fetch as unknown as typeof globalThis.fetch & ReturnType<typeof vi.fn>,
    storage: { getItem: (k: string) => (k === 'n8n-browserId' ? opts.browserId ?? null : null) },
  }
}

describe('fetchWorkflow', () => {
  it('sends the page’s own browser-id, same-origin, to {rest}/workflows/:id', async () => {
    const d = deps({ browserId: 'bid-123' })
    await fetchWorkflow('https://n8n.example/rest', 'abc', d)
    expect(d.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = d.fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://n8n.example/rest/workflows/abc')
    expect(init.credentials).toBe('same-origin')
    expect(init.headers).toEqual({ 'browser-id': 'bid-123', Accept: 'application/json' })
  })

  it('never invents a browser-id — an instance without one predates the binding', async () => {
    const d = deps({ browserId: null })
    await fetchWorkflow('https://n8n.example/rest', 'abc', d)
    const [, init] = d.fetch.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({ Accept: 'application/json' })
  })

  it('makes exactly one request, even when refused — a retry could log the user out', async () => {
    for (const status of [401, 403]) {
      const d = deps({ browserId: 'bid', status, body: { message: 'Unauthorized' } })
      expect(await fetchWorkflow('https://n8n.example/rest', 'abc', d)).toEqual({ ok: false, reason: 'auth', status })
      expect(d.fetch).toHaveBeenCalledTimes(1)
    }
  })

  it('reads a 404 as a workflow n8n has not saved yet', async () => {
    expect(await fetchWorkflow('https://n8n.example/rest', 'abc', deps({ status: 404, body: {} }))).toEqual({ ok: false, reason: 'unsaved', status: 404 })
  })

  it('accepts the { data } wrapper and a bare body', async () => {
    expect(await fetchWorkflow('r', 'a', deps({ body: { data: WF } }))).toEqual({ ok: true, workflow: WF })
    expect(await fetchWorkflow('r', 'a', deps({ body: WF }))).toEqual({ ok: true, workflow: WF })
  })

  it('refuses a body that is not a workflow', async () => {
    expect(await fetchWorkflow('r', 'a', deps({ body: { data: { nodes: 'x' } } }))).toMatchObject({ ok: false, reason: 'error' })
    expect(await fetchWorkflow('r', 'a', deps({ body: { data: { nodes: [], connections: [] } } }))).toMatchObject({ ok: false, reason: 'error' })
  })

  it('reports a network failure without throwing', async () => {
    expect(await fetchWorkflow('r', 'a', deps({ throws: true }))).toEqual({ ok: false, reason: 'error' })
  })

  it('encodes the id into the path', async () => {
    const d = deps({})
    await fetchWorkflow('r', 'a/b', d)
    expect((d.fetch.mock.calls[0] as [string])[0]).toBe('r/workflows/a%2Fb')
  })
})

describe('fetchSettings', () => {
  it('reads the version and the autosave switch, with the same header rule', async () => {
    const d = deps({ browserId: 'bid', body: { data: { versionCli: '2.30.7', workflowsAutosaveDisabled: false } } })
    expect(await fetchSettings('https://n8n.example/rest', d)).toEqual({ versionCli: '2.30.7', autosaveDisabled: false })
    const [url, init] = d.fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://n8n.example/rest/settings')
    expect(init.headers).toEqual({ 'browser-id': 'bid', Accept: 'application/json' })
  })

  it('is null when it cannot be read', async () => {
    expect(await fetchSettings('r', deps({ status: 401, body: {} }))).toBeNull()
    expect(await fetchSettings('r', deps({ throws: true }))).toBeNull()
  })
})

describe('cardGeometryFor', () => {
  it('draws n8n 1.x cards for a 1.x instance and 2.x cards otherwise', () => {
    expect(cardGeometryFor('1.123.82')).toBe('v1')
    expect(cardGeometryFor('2.30.7')).toBe('v2')
    expect(cardGeometryFor(undefined)).toBe('v2')
    expect(cardGeometryFor('nonsense')).toBe('v2')
  })
})
