// The export choices the widget offers, in the order it offers them.

import type { ExportFormat, ExportScale } from '../vendor/pixtex-types'
import { FREE_MAX_SCALE } from '../vendor/pixtex-types'

export const PRIMARY_FORMATS: ReadonlyArray<{ format: ExportFormat; label: string }> = [
  { format: 'png', label: 'PNG' },
  { format: 'pdf', label: 'PDF' },
]
export const MORE_FORMATS: ReadonlyArray<{ format: ExportFormat; label: string }> = [
  { format: 'svg', label: 'SVG' },
  { format: 'jpeg', label: 'JPEG' },
  { format: 'webp', label: 'WebP' },
]

export const SCALES: ReadonlyArray<{ scale: ExportScale; pro: boolean }> = [1, 2, 3, 4, 6, 8].map((s) => ({
  scale: s as ExportScale,
  pro: s > FREE_MAX_SCALE,
}))

export const FORMAT_LABEL: Record<ExportFormat, string> = {
  png: 'PNG', pdf: 'PDF', svg: 'SVG', jpeg: 'JPEG', webp: 'WebP',
}

/**
 * What pixtex.dev says the extension may offer beyond plain exports. Fetched
 * as DATA from a static JSON (never code), so a feature the web app ships
 * after this build was approved — the client handover PDF — can appear without
 * a second store review. Anything unreadable means "nothing extra".
 */
export interface Capabilities {
  handover: boolean
}

export const NO_CAPABILITIES: Capabilities = { handover: false }

export function parseCapabilities(body: unknown): Capabilities {
  if (typeof body !== 'object' || body === null) return NO_CAPABILITIES
  return { handover: (body as { handover?: unknown }).handover === true }
}
