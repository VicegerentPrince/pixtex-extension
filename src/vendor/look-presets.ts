// VENDORED from the Pixtex monorepo: apps/web/src/lib/look-presets.ts — the
// four finished looks, as the option patches the editor applies. Every preset
// writes every key, so switching between two can never leave the first one's
// grid or padding behind. Re-copy when that file changes (npm run vendor:check).

import type { LookPatch } from './pixtex-types'

export type LookId = 'signature' | 'n8n' | 'docs' | 'slide'

export const LOOKS: ReadonlyArray<{ id: LookId; label: string; patch: LookPatch }> = [
  {
    id: 'signature',
    label: 'Signature',
    patch: {
      iconPack: 'custom', nodePalette: 'punch', background: 'dark',
      gridStyle: 'dots', gridOpacity: 0.65, padding: 'normal',
      showTitle: true, nodeDetail: 'standard',
      outlineOpacity: 0.15, nodeTint: 'stock', nodeGlow: 0,
    },
  },
  {
    id: 'n8n',
    label: 'Like n8n',
    patch: {
      iconPack: 'n8n', nodePalette: 'punch', background: 'midnight',
      gridStyle: 'dots', gridOpacity: 0.65, padding: 'normal',
      showTitle: false, nodeDetail: 'standard',
      outlineOpacity: 0.15, nodeTint: 'stock', nodeGlow: 0,
    },
  },
  {
    id: 'docs',
    label: 'Docs',
    patch: {
      iconPack: 'n8n', nodePalette: 'punch', background: 'paper',
      gridStyle: 'none', gridOpacity: 0.65, padding: 'roomy',
      showTitle: true, nodeDetail: 'standard',
      outlineOpacity: 0.4, nodeTint: 'stock', nodeGlow: 0,
    },
  },
  {
    id: 'slide',
    label: 'Slide',
    patch: {
      iconPack: 'custom', nodePalette: 'sunset', background: 'plum',
      gridStyle: 'none', gridOpacity: 0.65, padding: 'roomy',
      showTitle: true, nodeDetail: 'minimal',
      outlineOpacity: 0.15, nodeTint: 'stock', nodeGlow: 0,
    },
  },
]

export function lookPatch(id: LookId): LookPatch {
  return (LOOKS.find((l) => l.id === id) ?? LOOKS[0]!).patch
}
