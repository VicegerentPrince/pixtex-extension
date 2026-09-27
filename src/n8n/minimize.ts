// What of a workflow ever leaves the n8n page.
//
// The editor's REST response carries far more than a picture needs — sharing
// and owner details, scopes, checksums, active-version records and, above all,
// pinned execution data, which is usually real customer records. None of that
// is sent anywhere. What is kept is what a render (or a client handover
// document) draws: names, nodes, wiring, groups, the description, and a small
// allow-list of settings.

import { stripPinnedRecords } from '../vendor/sanitize-workflow'
import type { N8nNode, N8nWorkflow } from '../vendor/pixtex-types'

/** Settings a render or a handover document reads — plain config, never secrets. */
const SETTINGS_KEPT = [
  'timezone', 'errorWorkflow', 'executionTimeout', 'saveDataErrorExecution',
  'saveDataSuccessExecution', 'executionOrder', 'timeSavedPerExecution',
] as const

function minimizeNode(node: N8nNode): N8nNode {
  const { credentials, ...rest } = node
  if (!credentials) return rest as N8nNode
  // Keep which credential TYPE a node uses and its display name — both are
  // what a handover document lists. The credential's internal id is dropped;
  // secrets themselves never live in a workflow's credential references.
  const refs: NonNullable<N8nNode['credentials']> = {}
  for (const [type, ref] of Object.entries(credentials)) {
    refs[type] = typeof ref?.name === 'string' ? { name: ref.name } : {}
  }
  return { ...rest, credentials: refs } as N8nNode
}

export function minimize(raw: N8nWorkflow): N8nWorkflow {
  const out: N8nWorkflow = {
    name: typeof raw.name === 'string' ? raw.name : undefined,
    nodes: raw.nodes.map(minimizeNode),
    connections: raw.connections,
  }
  if (typeof raw.description === 'string' && raw.description.trim()) out.description = raw.description
  if (Array.isArray(raw.nodeGroups) && raw.nodeGroups.length) out.nodeGroups = raw.nodeGroups
  if (raw.settings && typeof raw.settings === 'object') {
    const kept: Record<string, unknown> = {}
    for (const key of SETTINGS_KEPT) {
      if (raw.settings[key] !== undefined) kept[key] = raw.settings[key]
    }
    if (Object.keys(kept).length) out.settings = kept
  }
  if (raw.pinData) out.pinData = raw.pinData
  return stripPinnedRecords(out)
}

/** A pasted clipboard (Ctrl+A, Ctrl+C in n8n) — no name, the page supplies it. */
export function workflowFromClipboard(text: string, fallbackName: string | undefined): N8nWorkflow | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const v = parsed as Partial<N8nWorkflow>
  if (!Array.isArray(v.nodes) || typeof v.connections !== 'object' || v.connections === null) return null
  return minimize({ ...(v as N8nWorkflow), name: v.name ?? fallbackName })
}
