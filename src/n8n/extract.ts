// Reads the saved workflow from n8n's own editor REST API, as the editor does.
//
// THE RULE THIS FILE EXISTS FOR: n8n binds its login cookie to a `browser-id`
// header, and a request without the right one does not merely fail — n8n
// clears the session and the user is logged out. (Confirmed on 2.30.7: one GET
// without the header answered 401, and the next GET WITH the correct header
// answered 401 too.) So:
//
//   - send the page's own localStorage['n8n-browserId'], and never invent one;
//     an instance with no id stored predates the binding, so no header is right;
//   - one request per click, and never a retry on 401/403;
//   - nothing else from the extension ever calls this API.

import type { N8nWorkflow } from '../vendor/pixtex-types'

export type ExtractResult =
  | { ok: true; workflow: N8nWorkflow }
  | { ok: false; reason: 'unsaved' | 'auth' | 'error'; status?: number }

export interface ExtractDeps {
  fetch: typeof fetch
  /** The page's localStorage (a content script shares it with the page). */
  storage: Pick<Storage, 'getItem'>
}

const BROWSER_ID_KEY = 'n8n-browserId'

function headers(storage: Pick<Storage, 'getItem'>): Record<string, string> {
  const id = storage.getItem(BROWSER_ID_KEY)
  return id ? { 'browser-id': id, Accept: 'application/json' } : { Accept: 'application/json' }
}

function isWorkflow(value: unknown): value is N8nWorkflow {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.nodes) && typeof v.connections === 'object' && v.connections !== null && !Array.isArray(v.connections)
}

/** GET {rest}/workflows/:id — the `{ data }` wrapper and a bare body both accepted. */
export async function fetchWorkflow(restUrl: string, id: string, deps: ExtractDeps): Promise<ExtractResult> {
  let res: Response
  try {
    res = await deps.fetch(`${restUrl}/workflows/${encodeURIComponent(id)}`, {
      credentials: 'same-origin',
      headers: headers(deps.storage),
    })
  } catch {
    return { ok: false, reason: 'error' }
  }
  // A 404 is a workflow n8n has not saved yet (the id in a ?new=true URL).
  if (res.status === 404) return { ok: false, reason: 'unsaved', status: 404 }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth', status: res.status }
  if (!res.ok) return { ok: false, reason: 'error', status: res.status }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, reason: 'error', status: res.status }
  }
  const candidate = (body as { data?: unknown })?.data ?? body
  return isWorkflow(candidate) ? { ok: true, workflow: candidate } : { ok: false, reason: 'error', status: res.status }
}

export interface N8nSettings {
  /** e.g. "2.30.7" — picks n8n's 1.x or 2.x card geometry. */
  versionCli?: string
  /** 2.x autosaves unless this is on; 1.x never autosaves. */
  autosaveDisabled?: boolean
}

/**
 * GET {rest}/settings, same header rule. Called at most once per page load and
 * cached by the caller — it is the only other request the extension makes.
 */
export async function fetchSettings(restUrl: string, deps: ExtractDeps): Promise<N8nSettings | null> {
  try {
    const res = await deps.fetch(`${restUrl}/settings`, { credentials: 'same-origin', headers: headers(deps.storage) })
    if (!res.ok) return null
    const body = (await res.json()) as { data?: Record<string, unknown> }
    const data = body?.data ?? (body as Record<string, unknown>)
    return {
      versionCli: typeof data.versionCli === 'string' ? data.versionCli : undefined,
      autosaveDisabled: typeof data.workflowsAutosaveDisabled === 'boolean' ? data.workflowsAutosaveDisabled : undefined,
    }
  } catch {
    return null
  }
}

/** n8n 1.x draws the older 100px cards on a 20px grid; 2.x the 96px ones. */
export function cardGeometryFor(versionCli: string | undefined): 'v1' | 'v2' {
  const major = Number.parseInt(versionCli ?? '', 10)
  return major === 1 ? 'v1' : 'v2'
}
