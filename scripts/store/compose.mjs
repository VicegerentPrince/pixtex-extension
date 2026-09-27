#!/usr/bin/env node
// Composes the Chrome Web Store images from real captures (scripts/store/
// capture.mjs): five 1280×800 screenshots and two promo tiles, in pixtex.dev's
// own type and colours. Every picture inside a frame is a capture of this
// extension or of what it exported — nothing is mocked up.
//
//   node scripts/store/compose.mjs [--raw store/raw]
//
// Writes store/screenshots/*.png and store/promo/*.png — 24-bit, no alpha, at
// exactly the sizes the store asks for (test/unit/store.test.ts checks).

import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const rawArg = process.argv.indexOf('--raw')
const RAW = resolve(ROOT, rawArg > -1 ? process.argv[rawArg + 1] : 'store/raw')

const dataUrl = (path, type) => `data:${type};base64,${readFileSync(path).toString('base64')}`
const raw = (name) => dataUrl(join(RAW, name), 'image/png')
const brand = (name) => dataUrl(join(ROOT, 'icons', name), 'image/svg+xml')

const BASE_CSS = `
  :root { --ink: #0D0D0F; --paper: #F0EEE8; --accent: #FF4500; --muted: rgba(240, 238, 232, 0.62); --rule: rgba(240, 238, 232, 0.12); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: var(--ink); overflow: hidden; }
  body {
    position: relative; color: var(--paper); font-family: 'DM Sans', sans-serif;
    background-image: radial-gradient(rgba(240, 238, 232, 0.07) 1px, transparent 1.3px);
    background-size: 22px 22px;
  }
  .kicker {
    display: flex; align-items: center; gap: 14px;
    font-family: 'Space Mono', monospace; font-size: 13px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--accent);
  }
  .kicker::before { content: ''; width: 32px; height: 1px; background: var(--accent); }
  h1 { margin-top: 16px; font-family: 'Unbounded', sans-serif; font-weight: 900; font-size: 44px; line-height: 1.04; text-transform: uppercase; letter-spacing: -0.01em; }
  h1 em { font-style: normal; color: var(--accent); }
  p { margin-top: 14px; font-size: 18px; line-height: 1.5; color: var(--muted); max-width: 1040px; }
  .shot { border-radius: 14px; border: 1px solid var(--rule); box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55); display: block; }
`

const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Space+Mono:wght@400;700&family=Unbounded:wght@700;900&display=block">'

const page = (w, h, css, body) => `<!doctype html><html><head><meta charset="utf-8">${FONTS}
<style>${BASE_CSS} html, body { width: ${w}px; height: ${h}px; } ${css}</style></head><body>${body}</body></html>`

const copy = (kicker, title, sub) => `<div class="kicker">${kicker}</div><h1>${title}</h1><p>${sub}</p>`

/** Copy on top, one capture below it — fitted whole, never cropped. */
const stacked = (kicker, title, sub, img) => page(1280, 800, `
  .copy { position: absolute; left: 64px; right: 64px; top: 50px; }
  .stage { position: absolute; left: 64px; right: 64px; top: 236px; bottom: 36px; display: flex; justify-content: center; align-items: flex-start; }
  .stage img { max-width: 100%; max-height: 100%; }
`, `<div class="copy">${copy(kicker, title, sub)}</div><div class="stage"><img class="shot" src="${img}"></div>`)

const SHOTS = [
  {
    file: '1-export-inside-n8n.png',
    html: () => stacked('Pixtex for n8n', 'Export it from <em>inside n8n.</em>',
      'One button in the n8n editor. The whole workflow as a PNG, PDF, SVG, JPEG or WebP image.',
      raw('editor-menu.png')),
  },
  {
    file: '2-rendered-not-screenshotted.png',
    html: () => stacked('Rendered, not screenshotted', 'Every node. <em>Crisp at any size.</em>',
      'Rendered from the workflow itself — however big it is, and however little of it fits on your screen.',
      raw('export-signature.png')),
  },
  {
    file: '3-diagram-poster.png',
    html: () => page(1280, 800, `
      .copy { position: absolute; left: 64px; width: 560px; top: 50%; transform: translateY(-50%); }
      .copy h1 { font-size: 46px; }
      .poster { position: absolute; right: 88px; top: 40px; bottom: 40px; }
      .poster img { height: 100%; }
    `, `<div class="copy">${copy('Diagram poster', 'A flowchart <em>anyone can read.</em>',
      'The same workflow as a one-page diagram, for a client, a README or a slide — by choosing Diagram poster in the menu.')}</div>
      <div class="poster"><img class="shot" src="${raw('export-poster.png')}"></div>`),
  },
  {
    file: '4-four-looks.png',
    html: () => page(1280, 800, `
      .copy { position: absolute; left: 64px; right: 64px; top: 50px; }
      .grid { position: absolute; left: 64px; right: 64px; top: 236px; bottom: 36px; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 18px; }
      .cell { min-height: 0; min-width: 0; }
      /* The looks differ in padding and title, so their aspect ratios do too.
         Uniform tiles, each export fitted whole on its OWN background colour
         (sampled below) — cropping would cut Slide's title card. */
      .frame { position: relative; width: 100%; height: 100%; overflow: hidden; }
      .frame img { width: 100%; height: 100%; object-fit: contain; border: 0; border-radius: 0; box-shadow: none; }
      .tag { position: absolute; left: 12px; bottom: 12px; padding: 4px 10px; border-radius: 999px; background: rgba(13, 13, 15, 0.82);
        border: 1px solid var(--rule); font-family: 'Space Mono', monospace; font-size: 12px; letter-spacing: 0.08em; color: var(--paper); }
    `, `<div class="copy">${copy('Four finished looks', 'Pick a look. <em>Export.</em>',
      'Signature, Like n8n, Docs and Slide — sharp at up to 4×, and at 6× or 8× with Pixtex Pro.')}</div>
      <div class="grid">${[['export-signature.png', 'Signature'], ['export-like-n8n.png', 'Like n8n'], ['export-docs.png', 'Docs'], ['export-slide.png', 'Slide']]
        .map(([f, label]) => `<div class="cell"><div class="frame shot"><img src="${raw(f)}"><span class="tag">${label}</span></div></div>`).join('')}</div>`),
  },
  {
    file: '5-open-in-pixtex.png',
    html: () => stacked('Open in Pixtex', 'Style it in <em>the full editor.</em>',
      'One click hands the workflow to pixtex.dev — inside your browser, never through a URL.',
      raw('pixtex-editor.png')),
  },
]

const PROMOS = [
  {
    file: 'small-440x280.png', w: 440, h: 280,
    html: () => page(440, 280, `
      body { background-size: 18px 18px; }
      .mark { position: absolute; left: 28px; top: 26px; display: flex; align-items: center; gap: 12px; }
      .mark .icon { width: 40px; height: 40px; }
      .mark .word { height: 15px; }
      .copy { position: absolute; left: 28px; right: 24px; bottom: 28px; }
      h1 { margin: 0; font-size: 29px; line-height: 1.06; }
      .kicker { margin-bottom: 12px; font-size: 11px; letter-spacing: 0.26em; }
      .kicker::before { width: 22px; }
    `, `<div class="mark"><img class="icon" src="${brand('pixtex-icon.svg')}"><img class="word" src="${brand('pixtex-wordmark-white.svg')}"></div>
      <div class="copy"><div class="kicker">For n8n</div><h1>Workflows,<br><em>rendered.</em></h1></div>`),
  },
  {
    file: 'marquee-1400x560.png', w: 1400, h: 560,
    html: () => page(1400, 560, `
      .mark { position: absolute; left: 72px; top: 64px; display: flex; align-items: center; gap: 16px; }
      .mark .icon { width: 56px; height: 56px; }
      .mark .word { height: 21px; }
      .copy { position: absolute; left: 72px; width: 520px; bottom: 72px; }
      h1 { font-size: 50px; }
      .art { position: absolute; left: 660px; top: 64px; bottom: 64px; right: -2px; display: flex; align-items: center; }
      .art img { height: 100%; border-top-right-radius: 0; border-bottom-right-radius: 0; border-right: 0; }
    `, `<div class="mark"><img class="icon" src="${brand('pixtex-icon.svg')}"><img class="word" src="${brand('pixtex-wordmark-white.svg')}"></div>
      <div class="copy">${copy('Pixtex for n8n', 'Workflows, <em>rendered.</em>', 'Export the n8n workflow you are editing as a crisp image — from inside the editor.')}</div>
      <div class="art"><img class="shot" src="${raw('export-signature.png')}"></div>`),
  },
]

const browser = await chromium.launch({ channel: 'chromium' })
async function render(html, w, h, out) {
  const tab = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await tab.setContent(html, { waitUntil: 'networkidle' })
  await tab.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})))
    // a tile takes its export's own background, so a fitted export shows no bars
    for (const img of document.querySelectorAll('.frame img')) {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      const g = c.getContext('2d')
      g.drawImage(img, 2, 2, 1, 1, 0, 0, 1, 1)
      const [r, gr, b] = g.getImageData(0, 0, 1, 1).data
      img.parentElement.style.background = `rgb(${r}, ${gr}, ${b})`
    }
  })
  // every piece of text must be in the face it asks for — a fallback is silent
  const fonts = await tab.evaluate(() => [...document.querySelectorAll('h1, p, .kicker, .tag')]
    .map((el) => getComputedStyle(el).font)
    .filter((font) => !document.fonts.check(font)))
  if (fonts.length) throw new Error(`${out}: fonts did not load: ${fonts.join(', ')}`)
  writeFileSync(out, await tab.screenshot({ type: 'png' }))
  await tab.close()
  console.log(out.replace(ROOT, '.'))
}

mkdirSync(join(ROOT, 'store/screenshots'), { recursive: true })
mkdirSync(join(ROOT, 'store/promo'), { recursive: true })
for (const s of SHOTS) await render(s.html(), 1280, 800, join(ROOT, 'store/screenshots', s.file))
for (const p of PROMOS) await render(p.html(), p.w, p.h, join(ROOT, 'store/promo', p.file))
await browser.close()
