#!/usr/bin/env node
// One export with everything visible: the widget's status, every download
// record, and the service worker's console. For diagnosing a failing e2e step.

import { chromium } from 'playwright'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { signIn } from './n8n-owner.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const N8N = process.env.N8N_URL ?? 'http://localhost:5678'
const ext = join(ROOT, process.argv[2] ?? 'dist-e2e')

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'pixtex-dbg-')), {
  channel: 'chromium', headless: true, acceptDownloads: true, viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
})
let [sw] = context.serviceWorkers()
sw ??= await context.waitForEvent('serviceworker')
sw.on('console', (m) => console.log(`[sw ${m.type()}] ${m.text()}`))

const page = await context.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log(`[page error] ${m.text().slice(0, 200)}`) })
page.setDefaultNavigationTimeout(120_000)
await signIn(page, N8N)
const id = await page.evaluate(async () => {
  const r = await fetch('/rest/workflows', { credentials: 'same-origin', headers: { 'browser-id': localStorage.getItem('n8n-browserId') } })
  return (await r.json()).data[0].id
})
await page.goto(`${N8N}/workflow/${id}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
const main = page.locator('[data-pixtex-extension] .main')
await main.waitFor({ state: 'visible', timeout: 120_000 })
const t0 = Date.now()
await main.click()
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 2000))
  const status = await page.evaluate(() => {
    const root = document.querySelector('[data-pixtex-extension]')?.shadowRoot
    const s = root?.querySelector('.status')
    return { label: root?.querySelector('.main span')?.textContent, status: s && !s.hidden ? `${s.className}: ${s.textContent}` : null }
  })
  const downloads = await sw.evaluate(async () => (await chrome.downloads.search({})).map((d) => ({ state: d.state, error: d.error, mime: d.mime, bytes: d.fileSize, name: d.filename.split(/[\\/]/).pop(), url: d.url.slice(0, 40) })))
  console.log(`t+${Math.round((Date.now() - t0) / 1000)}s label=${status.label} status=${status.status} downloads=${JSON.stringify(downloads)}`)
  if (status.status && !status.label?.includes('…')) break
}
await context.close()
