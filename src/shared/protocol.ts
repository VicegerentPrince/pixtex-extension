// Every message the extension's parts exchange, typed and guarded.
//
// Each handler checks shape before acting and ignores an unknown `v` or `type`,
// so a newer page or an older extension build (store updates roll out over
// days) degrades to "no answer" rather than to a wrong action.

import type { ExportFormat, ExportScale, ExportStyle, CardGeometry, N8nWorkflow } from '../vendor/pixtex-types'
import type { LookId } from '../vendor/look-presets'

export const PROTOCOL_VERSION = 1 as const

export interface ExportOptionsChoice {
  format: ExportFormat
  style: ExportStyle
  look: LookId
  scale: ExportScale
  geometry: CardGeometry
}

// content script → service worker
export interface ExportRequestMsg extends ExportOptionsChoice {
  v: 1
  type: 'export'
  reqId: string
  workflow: N8nWorkflow
}
export interface HandoffRequestMsg {
  v: 1
  type: 'handoff'
  workflow: N8nWorkflow
  style?: ExportStyle
  /** 'handover' opens the web editor's client-handover mode (capability-gated). */
  intent?: 'edit' | 'handover'
}
export interface PrefsGetMsg { v: 1; type: 'prefs:get' }
export interface PrefsSetMsg { v: 1; type: 'prefs:set'; prefs: Partial<Prefs> }
export interface CapabilitiesGetMsg { v: 1; type: 'capabilities:get' }

// service worker → content script (tabs.sendMessage)
export interface ExportProgressMsg { v: 1; type: 'export:progress'; reqId: string }
export interface ExportDoneMsg {
  v: 1
  type: 'export:done'
  reqId: string
  filename: string
  tier: 'free' | 'pro'
  scale: number
}
export type ExportFailureCode =
  | 'burst-limit' | 'daily-limit' | 'too-large' | 'too-many-nodes' | 'invalid'
  | 'server' | 'network' | 'timeout' | 'download'
export interface ExportFailedMsg {
  v: 1
  type: 'export:failed'
  reqId: string
  code: ExportFailureCode
  message: string
  retryAfterSec?: number
}

// service worker ↔ offscreen document
export interface OffscreenRenderMsg {
  v: 1
  type: 'offscreen:render'
  target: 'offscreen'
  reqId: string
  tabId: number
  body: unknown
  auth?: string
  clientVersion: string
}
export interface OffscreenResultMsg {
  v: 1
  type: 'offscreen:result'
  reqId: string
  tabId: number
  ok: boolean
  blobUrl?: string
  contentDisposition?: string | null
  tier?: string | null
  scale?: string | null
  status?: number
  error?: string
  fieldPath?: string
  retryAfterSec?: number
  aborted?: boolean
}
export interface OffscreenRevokeMsg { v: 1; type: 'offscreen:revoke'; target: 'offscreen'; blobUrl: string }

// pixtex.dev /open page → service worker (externally_connectable)
export interface PixtexPingMsg { v: 1; type: 'pixtex:ping' }
export interface PixtexClaimMsg { v: 1; type: 'pixtex:claim'; nonce: string }
export type ClaimResponse =
  | { ok: true; v: 1; workflow: N8nWorkflow; style?: ExportStyle; intent?: 'edit' | 'handover' }
  | { ok: false; code: 'unknown' | 'expired' | 'wrong-tab' | 'wrong-origin' | 'invalid' }

/** User preferences — kept by the service worker, never by a content script. */
export interface Prefs extends Omit<ExportOptionsChoice, 'geometry'> {
  /** Last-used; the one-click button repeats it. */
  secretWarnings: boolean
}

export const DEFAULT_PREFS: Prefs = {
  format: 'png',
  style: 'canvas',
  look: 'signature',
  scale: 2,
  secretWarnings: true,
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function isMsg<T extends { v: 1; type: string }>(v: unknown, type: T['type']): v is T {
  return isObj(v) && v.v === PROTOCOL_VERSION && v.type === type
}

const FORMATS: readonly ExportFormat[] = ['png', 'jpeg', 'webp', 'svg', 'pdf']
const SCALES: readonly number[] = [1, 2, 3, 4, 6, 8]
const STYLES: readonly ExportStyle[] = ['canvas', 'diagram']
const LOOKS: readonly LookId[] = ['signature', 'n8n', 'docs', 'slide']

function isWorkflowShape(v: unknown): v is N8nWorkflow {
  return isObj(v) && Array.isArray(v.nodes) && isObj(v.connections)
}

export function isExportRequest(v: unknown): v is ExportRequestMsg {
  return isMsg<ExportRequestMsg>(v, 'export')
    && typeof v.reqId === 'string' && v.reqId.length <= 64
    && isWorkflowShape(v.workflow)
    && FORMATS.includes(v.format) && SCALES.includes(v.scale)
    && STYLES.includes(v.style) && LOOKS.includes(v.look)
    && (v.geometry === 'v1' || v.geometry === 'v2')
}

export function isHandoffRequest(v: unknown): v is HandoffRequestMsg {
  return isMsg<HandoffRequestMsg>(v, 'handoff')
    && isWorkflowShape(v.workflow)
    && (v.style === undefined || STYLES.includes(v.style))
    && (v.intent === undefined || v.intent === 'edit' || v.intent === 'handover')
}

export function isClaim(v: unknown): v is PixtexClaimMsg {
  return isMsg<PixtexClaimMsg>(v, 'pixtex:claim') && typeof v.nonce === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v.nonce)
}

/** Merges stored prefs over the defaults, dropping anything malformed. */
export function sanitizePrefs(stored: unknown): Prefs {
  const p = isObj(stored) ? stored : {}
  return {
    format: FORMATS.includes(p.format as ExportFormat) ? (p.format as ExportFormat) : DEFAULT_PREFS.format,
    style: STYLES.includes(p.style as ExportStyle) ? (p.style as ExportStyle) : DEFAULT_PREFS.style,
    look: LOOKS.includes(p.look as LookId) ? (p.look as LookId) : DEFAULT_PREFS.look,
    scale: SCALES.includes(p.scale as number) ? (p.scale as ExportScale) : DEFAULT_PREFS.scale,
    secretWarnings: typeof p.secretWarnings === 'boolean' ? p.secretWarnings : DEFAULT_PREFS.secretWarnings,
  }
}
