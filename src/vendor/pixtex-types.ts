// VENDORED from the Pixtex monorepo: packages/types/src/index.ts — only the
// public-contract subset this extension sends or reads. The extension posts a
// small options patch and lets the API's own defaults fill the rest, so drift
// here shows up as a 400 naming the field, never as a silently wrong image.
// Re-copy when the render contract changes (npm run vendor:check).

export interface N8nNodeCredentialRef {
  /** The id is dropped before a workflow leaves the page — see n8n/minimize.ts. */
  id?: string
  name?: string
}

export interface N8nNode {
  id: string
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters?: Record<string, unknown>
  credentials?: Record<string, N8nNodeCredentialRef>
  disabled?: boolean
  notes?: string
  notesInFlow?: boolean
  [key: string]: unknown
}

export interface N8nNodeGroup {
  id: string
  name: string
  nodeIds: string[]
  description?: string
}

export interface N8nWorkflow {
  name?: string
  description?: string
  nodes: N8nNode[]
  connections: Record<string, unknown>
  pinData?: Record<string, unknown[]>
  nodeGroups?: N8nNodeGroup[]
  settings?: Record<string, unknown>
}

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf'
export type ExportScale = 1 | 2 | 3 | 4 | 6 | 8
/** Highest scale a free render gets — the server clamps anything above it. */
export const FREE_MAX_SCALE = 4
export type ExportStyle = 'canvas' | 'diagram'
export type CardGeometry = 'v1' | 'v2'

/** What a look preset may set — the subset of CanvasOptions the presets own. */
export interface LookPatch {
  iconPack: 'n8n' | 'custom'
  nodePalette: string
  background: string
  gridStyle: string
  gridOpacity: number
  padding: string
  showTitle: boolean
  nodeDetail: 'minimal' | 'standard' | 'detailed'
  outlineOpacity: number
  nodeTint: string
  nodeGlow: number
}

export type ApiKeyTier = 'free' | 'pro'

/** GET /v1/keys/me — the fields the popup shows. */
export interface ApiKeyInfo {
  keyId: string
  tier: ApiKeyTier
  usage?: { month: string; renders: number }
  limits?: { rendersPerMonth: number }
}
