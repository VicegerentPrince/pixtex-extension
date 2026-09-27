// The downloaded file's name — the server's, when it sends one.
//
// The API names exports `<slug>.<ext>` from the workflow's name, the same rule
// the pixtex.dev editor's downloads follow. The fallback reproduces that rule
// for the rare response without a Content-Disposition.

import type { ExportFormat } from '../vendor/pixtex-types'

export function slugFilename(format: ExportFormat, workflowName?: string): string {
  const slug = (workflowName ?? 'workflow')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'workflow'
  return `${slug}.${format}`
}

/** `attachment; filename="a.png"` → `a.png`; anything unsafe or absent → null. */
export function filenameFromDisposition(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header)
  if (!match?.[1]) return null
  let name = match[1]
  try {
    name = decodeURIComponent(name)
  } catch {
    /* keep as-is */
  }
  // A download filename may not contain path separators or leading dots.
  if (/[\\/]/.test(name) || name.startsWith('.') || name.length > 120) return null
  return name
}
