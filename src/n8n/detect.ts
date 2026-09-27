// Is this page an n8n editor, and where is its REST API?
//
// Self-hosted n8n lives on any domain and often under a sub-path (N8N_PATH),
// and the REST prefix is configurable (N8N_ENDPOINT_REST) — so neither can be
// assumed. Both are published in the page itself:
//
//   n8n 2.x  <meta name="n8n:config:rest-endpoint" content="<base64>">
//            <script src="<base>/static/base-path.js">
//   n8n 1.x  an inline script: window.BASE_PATH = '/'; window.REST_ENDPOINT = 'rest';
//
// Verified against 2.30.7 (a saved editor page is the unit-test fixture) and
// the 1.0 / 1.80 index.html sources.

export interface N8nPage {
  /** e.g. https://acme.app.n8n.cloud/rest or http://host:5678/n8n/rest */
  restUrl: string
  /** '' at the root, '/n8n' under a sub-path — never a trailing slash. */
  basePath: string
  /** Which markup identified it — the two majors publish their config differently. */
  generation: 'v2' | 'v1'
}

const trimSlashes = (s: string): string => s.replace(/^\/+|\/+$/g, '')

function joinBase(basePath: string): string {
  const b = trimSlashes(basePath)
  return b ? `/${b}` : ''
}

function decodeBase64(value: string): string | null {
  try {
    return atob(value)
  } catch {
    return null
  }
}

/**
 * A REST prefix is plain path segments. No segment may start with a dot — `..`
 * would walk the request out of the instance's path, and a `.`-segment is
 * never something n8n publishes.
 */
function isSafeEndpoint(endpoint: string): boolean {
  const segments = trimSlashes(endpoint).split('/')
  return segments.length > 0 && segments.every((s) => /^[A-Za-z0-9_~-][A-Za-z0-9._~-]*$/.test(s))
}

/**
 * Detects n8n from the document. Returns null for anything that is not
 * confidently an n8n editor — a false positive would put an Export button on
 * someone else's app.
 */
export function detectN8n(doc: Document, origin: string): N8nPage | null {
  if (!doc.getElementById('app')) return null

  // n8n 2.x
  const meta = doc.querySelector('meta[name="n8n:config:rest-endpoint"]')?.getAttribute('content')
  if (meta) {
    const endpoint = decodeBase64(meta)
    if (!endpoint || !isSafeEndpoint(endpoint)) return null
    const script = [...doc.querySelectorAll('script[src]')]
      .map((s) => s.getAttribute('src') ?? '')
      .find((src) => /\/static\/base-path\.js(?:\?|$)/.test(src))
    let basePath = ''
    if (script) {
      const path = script.startsWith('http') ? new URL(script).pathname : script
      basePath = joinBase(path.replace(/\/static\/base-path\.js.*$/, ''))
    }
    return { restUrl: `${origin}${basePath}/${trimSlashes(endpoint)}`, basePath, generation: 'v2' }
  }

  // n8n 1.x
  const inline = [...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent ?? '').join('\n')
  const endpoint = /window\.REST_ENDPOINT\s*=\s*['"]([^'"]+)['"]/.exec(inline)?.[1]
  if (endpoint !== undefined) {
    if (!isSafeEndpoint(endpoint)) return null
    const base = /window\.BASE_PATH\s*=\s*['"]([^'"]*)['"]/.exec(inline)?.[1] ?? '/'
    const basePath = joinBase(base)
    return { restUrl: `${origin}${basePath}/${trimSlashes(endpoint)}`, basePath, generation: 'v1' }
  }

  return null
}
