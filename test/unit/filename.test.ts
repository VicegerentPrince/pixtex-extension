import { describe, expect, it } from 'vitest'
import { filenameFromDisposition, slugFilename } from '../../src/shared/filename'

describe('filenameFromDisposition', () => {
  it('reads the server’s filename', () => {
    expect(filenameFromDisposition('attachment; filename="invoice-intake.png"')).toBe('invoice-intake.png')
    expect(filenameFromDisposition("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf")).toBe('résumé.pdf')
  })

  it('refuses anything that could escape the downloads folder', () => {
    expect(filenameFromDisposition('attachment; filename="../../evil.png"')).toBeNull()
    expect(filenameFromDisposition('attachment; filename="a\\b.png"')).toBeNull()
    expect(filenameFromDisposition('attachment; filename=".bashrc"')).toBeNull()
  })

  it('is null without a header', () => {
    expect(filenameFromDisposition(null)).toBeNull()
    expect(filenameFromDisposition('inline')).toBeNull()
  })
})

describe('slugFilename', () => {
  // Same rule as the API's getFilename, so a fallback name matches what the
  // editor would have saved.
  it('slugs the workflow name the way the API does', () => {
    expect(slugFilename('png', 'Invoice Intake (v2)!')).toBe('invoice-intake-v2.png')
    expect(slugFilename('pdf', '')).toBe('workflow.pdf')
    expect(slugFilename('svg', undefined)).toBe('workflow.svg')
    expect(slugFilename('png', 'x'.repeat(100))).toBe(`${'x'.repeat(60)}.png`)
  })
})
