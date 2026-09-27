import { describe, expect, it } from 'vitest'
import { minimize, workflowFromClipboard } from '../../src/n8n/minimize'
import type { N8nWorkflow } from '../../src/vendor/pixtex-types'

/**
 * What leaves the n8n page. The editor's REST response carries sharing and
 * owner details and pinned execution data (usually real customer records);
 * none of it may reach a render. Markers are planted in every field that must
 * go, and the serialised result must contain none of them.
 */

const RAW = {
  id: 'vpUKtTUQ79vc2FJU',
  name: 'Invoice intake',
  description: 'Reads invoices from the shared inbox.',
  active: true,
  isArchived: false,
  checksum: 'MARKER-CHECKSUM',
  scopes: ['workflow:read', 'MARKER-SCOPE'],
  shared: [{ role: 'workflow:owner', project: { name: 'MARKER-OWNER <owner@example.com>' } }],
  homeProject: { name: 'MARKER-PROJECT' },
  staticData: { lastId: 'MARKER-STATIC' },
  activeVersion: { nodes: ['MARKER-ACTIVE-VERSION'] },
  meta: { instanceId: 'MARKER-INSTANCE' },
  tags: [{ name: 'MARKER-TAG' }],
  settings: { timezone: 'Europe/Berlin', errorWorkflow: 'wf-errors', callerPolicy: 'MARKER-POLICY', executionOrder: 'v1' },
  nodeGroups: [{ id: 'g1', name: 'Intake', nodeIds: ['n1'] }],
  nodes: [
    {
      id: 'n1', name: 'Gmail', type: 'n8n-nodes-base.gmail', typeVersion: 2, position: [0, 0], parameters: { operation: 'getAll' },
      credentials: { gmailOAuth2: { id: 'MARKER-CRED-ID', name: 'Acme inbox' } },
    },
  ],
  connections: {},
  pinData: { Gmail: [{ json: { subject: 'MARKER-PINNED-RECORD' } }] },
} as unknown as N8nWorkflow

describe('minimize', () => {
  const out = minimize(RAW)
  const text = JSON.stringify(out)

  it('drops everything a picture does not need', () => {
    for (const marker of ['MARKER-CHECKSUM', 'MARKER-SCOPE', 'MARKER-OWNER', 'MARKER-PROJECT', 'MARKER-STATIC',
      'MARKER-ACTIVE-VERSION', 'MARKER-INSTANCE', 'MARKER-TAG', 'MARKER-POLICY', 'MARKER-CRED-ID', 'MARKER-PINNED-RECORD']) {
      expect(text, marker).not.toContain(marker)
    }
    expect(Object.keys(out).sort()).toEqual(['connections', 'description', 'name', 'nodeGroups', 'nodes', 'pinData', 'settings'])
  })

  it('keeps a pinned node’s badge, but not its records', () => {
    expect(out.pinData).toEqual({ Gmail: [{}] })
  })

  it('keeps which credential type a node uses and its display name, never its id', () => {
    expect(out.nodes[0]!.credentials).toEqual({ gmailOAuth2: { name: 'Acme inbox' } })
  })

  it('keeps the structure a render and a handover document draw', () => {
    expect(out.name).toBe('Invoice intake')
    expect(out.description).toBe('Reads invoices from the shared inbox.')
    expect(out.nodeGroups).toEqual([{ id: 'g1', name: 'Intake', nodeIds: ['n1'] }])
    expect(out.settings).toEqual({ timezone: 'Europe/Berlin', errorWorkflow: 'wf-errors', executionOrder: 'v1' })
    expect(out.nodes[0]!.parameters).toEqual({ operation: 'getAll' })
  })

  it('omits optional fields that are empty rather than inventing them', () => {
    const bare = minimize({ nodes: [], connections: {} })
    expect(bare).toEqual({ name: undefined, nodes: [], connections: {} })
  })
})

describe('workflowFromClipboard', () => {
  // n8n's Ctrl+C gives {nodes, connections, pinData, meta} with no name.
  const clip = JSON.stringify({ nodes: RAW.nodes, connections: {}, pinData: RAW.pinData, meta: { instanceId: 'MARKER-INSTANCE' } })

  it('reads n8n’s copy format, names it from the page and minimises it', () => {
    const wf = workflowFromClipboard(clip, 'From the page')
    expect(wf?.name).toBe('From the page')
    expect(JSON.stringify(wf)).not.toContain('MARKER-')
  })

  it('refuses anything that is not a workflow', () => {
    expect(workflowFromClipboard('not json', 'x')).toBeNull()
    expect(workflowFromClipboard('"a string"', 'x')).toBeNull()
    expect(workflowFromClipboard('{"nodes": 1, "connections": {}}', 'x')).toBeNull()
    expect(workflowFromClipboard('{"nodes": [], "connections": null}', 'x')).toBeNull()
  })
})
