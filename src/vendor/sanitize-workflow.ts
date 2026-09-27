// VENDORED from the Pixtex monorepo: apps/web/src/lib/sanitize-workflow.ts —
// `scanForSecrets` and `stripPinnedRecords`, unchanged apart from the import.
// The same heuristics the editor uses, so the extension warns about exactly
// what pixtex.dev would. Re-copy when that file changes (npm run vendor:check).

import type { N8nWorkflow } from './pixtex-types'

export interface SecretWarning {
  nodeName: string
  /** Dot-path inside node.parameters where the suspicious value lives. */
  path: string
  reason: string
}

const SUSPICIOUS_KEY = /(api[-_]?key|apikey|token|secret|passwd|password|passphrase|authorization|auth[-_]?header|bearer|private[-_]?key|client[-_]?secret)/i

const VALUE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^Bearer\s+\S{8,}/i,                        reason: 'Bearer token' },
  { pattern: /^(sk|pk|rk|xoxb|xoxp|ghp|gho|glpat)[-_][A-Za-z0-9_-]{16,}/, reason: 'API key pattern' },
  { pattern: /^ey[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}/, reason: 'JWT' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,       reason: 'private key' },
]

function scanValue(nodeName: string, path: string, key: string, value: unknown, out: SecretWarning[]): void {
  if (typeof value === 'string') {
    if (value && SUSPICIOUS_KEY.test(key)) {
      out.push({ nodeName, path, reason: `field name looks like a credential ("${key}")` })
      return
    }
    for (const { pattern, reason } of VALUE_PATTERNS) {
      if (pattern.test(value)) {
        out.push({ nodeName, path, reason: `value looks like a ${reason}` })
        return
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scanValue(nodeName, `${path}[${i}]`, key, v, out))
  } else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      scanValue(nodeName, `${path}.${k}`, k, v, out)
    }
  }
}

/** Scan every node's parameters for values that look like secrets. */
export function scanForSecrets(workflow: N8nWorkflow): SecretWarning[] {
  const warnings: SecretWarning[] = []
  for (const node of workflow.nodes) {
    for (const [key, value] of Object.entries(node.parameters ?? {})) {
      scanValue(node.name, key, key, value, warnings)
    }
  }
  return warnings
}

/**
 * Pinned records reduced to their marks: the renderer only needs to know a
 * node HAS pinned data (to draw its pin badge), never what the data was —
 * and pinned data is usually real customer records.
 */
export function stripPinnedRecords(workflow: N8nWorkflow): N8nWorkflow {
  const pinData = workflow.pinData
  if (!pinData) return workflow
  const marks: Record<string, unknown[]> = {}
  for (const [name, records] of Object.entries(pinData)) {
    if ((records?.length ?? 0) > 0) marks[name] = [{}]
  }
  return { ...workflow, pinData: marks }
}
