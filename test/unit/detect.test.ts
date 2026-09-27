// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectN8n } from '../../src/n8n/detect'

/**
 * A false positive puts an Export button on someone else's app; a false
 * negative hides it from an n8n user on a sub-path or custom REST endpoint.
 * The 2.x case runs against a real n8n 2.30.7 editor page.
 */

// A path, not `new URL(…, import.meta.url)`: under happy-dom the global URL is
// happy-dom's, which Node's fs does not accept as a file URL.
const EDITOR_230 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../fixtures/n8n-2.30.7-editor.html'), 'utf8')

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

const v1Page = (base: string, rest: string) =>
  `<html><head><script>window.BASE_PATH = '${base}'; window.REST_ENDPOINT = '${rest}';</script></head><body><div id="app"></div></body></html>`

describe('detectN8n — n8n 2.x', () => {
  it('reads the REST endpoint and base path from a real 2.30.7 editor page', () => {
    expect(detectN8n(doc(EDITOR_230), 'http://localhost:5678')).toEqual({
      restUrl: 'http://localhost:5678/rest', basePath: '', generation: 'v2',
    })
  })

  it('honours a sub-path install (N8N_PATH)', () => {
    const html = EDITOR_230.replace('src="/static/base-path.js"', 'src="/automation/static/base-path.js"')
    expect(detectN8n(doc(html), 'https://acme.example')?.restUrl).toBe('https://acme.example/automation/rest')
  })

  it('honours a custom REST endpoint (N8N_ENDPOINT_REST)', () => {
    const html = EDITOR_230.replace('content="cmVzdA=="', `content="${btoa('api/v2')}"`)
    expect(detectN8n(doc(html), 'https://acme.example')?.restUrl).toBe('https://acme.example/api/v2')
  })

  it('refuses an endpoint that tries to walk out of the path', () => {
    const html = EDITOR_230.replace('content="cmVzdA=="', `content="${btoa('../../evil')}"`)
    expect(detectN8n(doc(html), 'https://acme.example')).toBeNull()
  })

  it('refuses a meta tag that is not base64', () => {
    const html = EDITOR_230.replace('content="cmVzdA=="', 'content="%%%"')
    expect(detectN8n(doc(html), 'https://acme.example')).toBeNull()
  })
})

describe('detectN8n — n8n 1.x', () => {
  it('reads window.REST_ENDPOINT and window.BASE_PATH', () => {
    expect(detectN8n(doc(v1Page('/', 'rest')), 'https://n8n.acme.example')).toEqual({
      restUrl: 'https://n8n.acme.example/rest', basePath: '', generation: 'v1',
    })
  })

  it('handles a base path with slashes on either side', () => {
    expect(detectN8n(doc(v1Page('/n8n/', 'rest')), 'https://acme.example')?.restUrl).toBe('https://acme.example/n8n/rest')
  })
})

describe('detectN8n — not n8n', () => {
  it('ignores an ordinary page', () => {
    expect(detectN8n(doc('<html><body><div id="app"></div></body></html>'), 'https://example.com')).toBeNull()
  })

  it('ignores a page that has the markers but no app root', () => {
    expect(detectN8n(doc(EDITOR_230.replace('id="app"', 'id="nope"')), 'https://example.com')).toBeNull()
  })
})
