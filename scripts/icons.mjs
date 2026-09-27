#!/usr/bin/env node
// Rasterises the Pixtex mark (icons/pixtex-icon.svg — the INKED variant, which
// reads on any background) into the PNG sizes a Chrome extension declares.
//
// The mark's geometry is hand-traced and is only ever resized here, never
// redrawn. The 128px store icon follows the Chrome Web Store guideline of 96px
// of artwork inside 16px of transparent padding; the toolbar sizes use the full
// square, since the SVG's own viewBox already carries a margin.
//
// Uses Playwright's Chromium (already a dev dependency for the e2e run), so no
// native image library is needed. Run: npm run icons

import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(ROOT, 'icons', 'pixtex-icon.svg'))
const src = `data:image/svg+xml;base64,${svg.toString('base64')}`

const browser = await chromium.launch({ channel: 'chromium', headless: true })
try {
  for (const size of [16, 32, 48, 128]) {
    const pad = size === 128 ? 16 : 0
    const art = size - 2 * pad
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(
      `<html><body style="margin:0;background:transparent">` +
      `<img src="${src}" style="display:block;width:${art}px;height:${art}px;margin:${pad}px"></body></html>`,
    )
    await page.waitForFunction(() => document.images[0]?.complete)
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
    writeFileSync(join(ROOT, 'icons', `${size}.png`), png)
    await page.close()
    console.log(`icons/${size}.png`)
  }
} finally {
  await browser.close()
}
