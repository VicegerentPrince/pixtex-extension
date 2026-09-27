import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MORE_FORMATS, PRIMARY_FORMATS, SCALES } from '../../src/shared/formats'
import { FREE_MAX_SCALE } from '../../src/vendor/pixtex-types'

/**
 * The store listing is a set of claims about the package — what it asks for,
 * what it exports, how big — made in a place no compiler reads. A permission
 * added without a justification is a rejected review; a justification left
 * behind for a removed permission, or a format the widget stopped offering, is
 * a listing that says something untrue.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const manifest = JSON.parse(read('manifest.base.json')) as {
  name: string
  description: string
  permissions: string[]
  optional_host_permissions?: string[]
  host_permissions?: string[]
  content_scripts?: Array<{ matches: string[] }>
}

/** Width, height, bit depth and colour type from a PNG's IHDR chunk. */
function pngHeader(path: string) {
  const b = readFileSync(join(ROOT, path))
  expect(b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `${path} is not a PNG`).toBe(true)
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), depth: b[24], colourType: b[25] }
}
const RGB = 2 // PNG colour type 2: truecolour, no alpha — "24-bit PNG (no alpha)"

describe('manifest fields the store shows as-is', () => {
  it('fits the store: a name of at most 75 characters, a summary of at most 132', () => {
    expect(manifest.name.length).toBeLessThanOrEqual(75)
    expect(manifest.description.length).toBeLessThanOrEqual(132)
  })
})

describe('privacy practices', () => {
  const practices = read('store/privacy-practices.md')
  const section = practices.split('## Permission justifications')[1]!.split('\n## ')[0]!
  const justified = [...section.matchAll(/^### `([^`]+)`$/gm)].map((m) => m[1]!)

  it('justifies every permission, host match and optional host permission — and nothing else', () => {
    const requested = [
      ...manifest.permissions,
      ...(manifest.host_permissions ?? []),
      ...(manifest.content_scripts ?? []).flatMap((c) => c.matches),
      ...(manifest.optional_host_permissions ?? []),
    ]
    expect([...justified].sort()).toEqual([...new Set(requested)].sort())
    expect(new Set(justified).size).toBe(justified.length)
  })

  it('answers the single-purpose, remote-code and data-usage questions', () => {
    for (const heading of ['## Single purpose', '## Remote code', '## Data usage']) expect(practices).toContain(heading)
    expect(practices).toContain('https://pixtex.dev/privacy')
  })
})

describe('description', () => {
  const description = read('store/description.txt')

  it('fits the store and stays plain text', () => {
    expect(description.length).toBeLessThanOrEqual(16_000)
    expect(description).not.toMatch(/\*\*|^#+ |\]\(/m) // the store shows markdown as literal characters
  })

  it('names exactly the formats the widget offers', () => {
    for (const { label } of [...PRIMARY_FORMATS, ...MORE_FORMATS]) expect(description).toContain(label)
  })

  it('states the free and Pro sizes the widget offers', () => {
    const top = Math.max(...SCALES.map((s) => s.scale))
    expect(description).toContain(`up to ${FREE_MAX_SCALE}×`)
    expect(description).toContain(`${top}×`)
    for (const { scale } of SCALES.filter((s) => s.pro)) expect(description).toContain(`${scale}×`)
  })
})

describe('images', () => {
  it('has one to five screenshots, each 1280×800 or 640×400, 24-bit with no alpha', () => {
    const shots = readdirSync(join(ROOT, 'store/screenshots')).filter((f) => f.endsWith('.png'))
    expect(shots.length).toBeGreaterThanOrEqual(1)
    expect(shots.length).toBeLessThanOrEqual(5)
    for (const f of shots) {
      const h = pngHeader(`store/screenshots/${f}`)
      expect(['1280x800', '640x400'], f).toContain(`${h.width}x${h.height}`)
      expect({ f, depth: h.depth, colourType: h.colourType }).toEqual({ f, depth: 8, colourType: RGB })
    }
  })

  it('has promo tiles at the exact sizes the store asks for', () => {
    const small = pngHeader('store/promo/small-440x280.png')
    expect(small).toEqual({ width: 440, height: 280, depth: 8, colourType: RGB })
    if (existsSync(join(ROOT, 'store/promo/marquee-1400x560.png'))) {
      expect(pngHeader('store/promo/marquee-1400x560.png')).toEqual({ width: 1400, height: 560, depth: 8, colourType: RGB })
    }
  })

  it('uses a 128×128 store icon', () => {
    const icon = pngHeader('icons/128.png')
    expect([icon.width, icon.height]).toEqual([128, 128])
  })
})
