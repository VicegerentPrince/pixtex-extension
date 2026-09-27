#!/usr/bin/env node
// End to end: the real extension, in Chromium, against a local n8n and a local
// Pixtex. It checks the things no unit test can:
//
//   1. PNG and PDF exports land on disk as real files
//   2. an unsaved workflow is exported through the paste path
//   3. the user is STILL LOGGED IN to n8n afterwards (the browser-id hazard)
//   4. Open in Pixtex hands the workflow to the editor, and a replayed handoff
//      link is refused
//   5. a render slower than Chrome's 30s service-worker fetch limit still
//      completes (against a stand-in API that waits 35s)
//
// Needs, running locally:
//   n8n          N8N_URL (default http://localhost:5678) — a fresh one, or its
//                owner in E2E_N8N_EMAIL / E2E_N8N_PASSWORD (see n8n-owner.mjs)
//   Pixtex web   http://localhost:3000   (apps/web: pnpm dev)
//   Pixtex api   http://localhost:3001   with EXTENSION_ORIGINS=chrome-extension://pimgfpeogbapfnnebapamdfajflbinpj
//
// Run: npm run e2e

import { chromium } from 'playwright'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { signIn } from './n8n-owner.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const N8N = process.env.N8N_URL ?? 'http://localhost:5678'
const WEB = 'http://localhost:3000'
const EXT_ID = 'pimgfpeogbapfnnebapamdfajflbinpj'
const SLOW_PORT = 3999

const results = []
async function step(name, fn) {
  const started = Date.now()
  try {
    const note = await fn()
    results.push({ name, ok: true, note, ms: Date.now() - started })
    console.log(`  ✓ ${name}${note ? ` — ${note}` : ''}`)
  } catch (error) {
    results.push({ name, ok: false, note: String(error?.message ?? error).split('\n')[0], ms: Date.now() - started })
    console.log(`  ✗ ${name} — ${String(error?.message ?? error).split('\n')[0]}`)
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }

function build(args, env = {}) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/build.mjs'), ...args], { env: { ...process.env, ...env }, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`build failed: ${r.stderr || r.stdout}`)
}

const swLog = []

async function launch(extDir) {
  const profile = mkdtempSync(join(tmpdir(), 'pixtex-e2e-'))
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  })
  // A local n8n next to a compiling Next.js server and two Chromiums is slow;
  // navigation gets real headroom so a busy machine is not reported as a bug.
  context.setDefaultNavigationTimeout(120_000)
  context.setDefaultTimeout(60_000)
  let [sw] = context.serviceWorkers()
  sw ??= await context.waitForEvent('serviceworker', { timeout: 20_000 })
  sw.on('console', (m) => swLog.push(`[sw ${m.type()}] ${m.text()}`))
  return { context, sw }
}

const E2E_WORKFLOW = {
  name: 'E2E flow',
  active: false,
  settings: { timezone: 'Europe/Berlin' },
  nodes: [
    { id: 'a1', name: 'When clicking', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
    { id: 'b2', name: 'Fetch orders', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [260, 0], parameters: { url: 'https://example.com/orders' } },
    { id: 'c3', name: 'Slack', type: 'n8n-nodes-base.slack', typeVersion: 2.2, position: [520, 0], parameters: {} },
  ],
  connections: {
    'When clicking': { main: [[{ node: 'Fetch orders', type: 'main', index: 0 }]] },
    'Fetch orders': { main: [[{ node: 'Slack', type: 'main', index: 0 }]] },
  },
  pinData: { 'Fetch orders': [{ json: { secret: 'PINNED-RECORD-MUST-NOT-LEAVE' } }] },
}

async function createWorkflow(page) {
  return page.evaluate(async (wf) => {
    const bid = localStorage.getItem('n8n-browserId')
    const r = await fetch('/rest/workflows', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'browser-id': bid },
      body: JSON.stringify(wf),
    })
    const body = await r.json()
    return body?.data?.id ?? body?.id
  }, E2E_WORKFLOW)
}

const widget = (page, selector) => page.locator(`[data-pixtex-extension] ${selector}`)

async function latestDownload(sw) {
  return sw.evaluate(async () => {
    const [item] = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 })
    return item ? { id: item.id, path: item.filename, state: item.state, bytes: item.fileSize, mime: item.mime, error: item.error } : null
  })
}

const MIME = { png: 'image/png', pdf: 'application/pdf' }

/**
 * The newest download after `previousId`, once complete. Identified by id and
 * MIME type, never by file name: when Playwright accepts downloads it saves
 * them under random GUID names, whatever name the extension asked for — the
 * asked-for name is checked in the widget's own status line instead.
 */
async function waitForDownload(sw, ext, previousId) {
  let last
  for (let i = 0; i < 120; i++) {
    last = await latestDownload(sw)
    if (last && last.id !== previousId && last.state === 'complete' && last.mime === MIME[ext]) return last
    if (last?.state === 'interrupted') throw new Error(`download interrupted: ${last.error}`)
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`no completed ${ext} download (last: ${JSON.stringify(last)})`)
}

/** Clicks Export and reports whatever the widget says — success or the error text. */
async function exportAndWait(page, sw, ext) {
  const before = await latestDownload(sw)
  await widget(page, '.main').click()
  const status = widget(page, '.status')
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-pixtex-extension]')?.shadowRoot
    const label = root?.querySelector('.main span')?.textContent ?? ''
    const s = root?.querySelector('.status')
    return s && !s.hidden && !label.includes('…')
  }, null, { timeout: 180_000 })
  const cls = (await status.getAttribute('class')) ?? ''
  const text = ((await status.textContent()) ?? '').trim()
  if (!cls.includes('ok')) throw new Error(`widget said: ${text}`)
  assert(text.includes(`.${ext}`), `status names no .${ext} file: ${text}`)
  const d = await waitForDownload(sw, ext, before?.id)
  const head = readFileSync(d.path).subarray(0, 8)
  return { d, head, text }
}

// ─────────────────────────────────────────────────────────────────────────────

console.log('building the e2e extension…')
build(['--flavour', 'e2e'])
build(['--flavour', 'e2e', '--out', 'dist-e2e-slow'], { PIXTEX_API_URL: `http://localhost:${SLOW_PORT}` })

console.log('\nagainst local n8n + local Pixtex:')
const { context, sw } = await launch(join(ROOT, 'dist-e2e'))
const page = await context.newPage()
let workflowId

await step('the extension loads with its pinned dev id', async () => {
  const id = sw.url().split('/')[2]
  assert(id === EXT_ID, `extension id is ${id}`)
  return id
})

await step('logs in to n8n and creates a workflow', async () => {
  await signIn(page, N8N)
  workflowId = await createWorkflow(page)
  assert(workflowId, 'no workflow id')
  return workflowId
})

await step('shows the Export button in the editor (localhost:5678 matched by http://localhost/*)', async () => {
  await page.goto(`${N8N}/workflow/${workflowId}`, { waitUntil: 'domcontentloaded' })
  await widget(page, '.main').waitFor({ state: 'visible', timeout: 60_000 })
  const handoverHidden = await widget(page, '.action[hidden]').count()
  return `handover entry hidden: ${handoverHidden > 0}`
})

await step('exports a PNG that lands on disk', async () => {
  const { d, head, text } = await exportAndWait(page, sw, 'png')
  assert(head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'not a PNG')
  return `${text.split('\n')[0]} · ${d.bytes} bytes`
})

await step('exports a PDF', async () => {
  await widget(page, '.caret').click()
  await widget(page, '.chip:text-is("PDF")').click()
  await widget(page, '.caret').click()
  const { d, head, text } = await exportAndWait(page, sw, 'pdf')
  assert(head.subarray(0, 4).toString('latin1') === '%PDF', 'not a PDF')
  await widget(page, '.caret').click()
  await widget(page, '.chip:text-is("PNG")').click()
  await widget(page, '.caret').click()
  return `${text.split('\n')[0]} · ${d.bytes} bytes`
})

await step('the user is still logged in to n8n afterwards', async () => {
  const status = await page.evaluate(async (id) => {
    const r = await fetch(`/rest/workflows/${id}`, { credentials: 'same-origin', headers: { 'browser-id': localStorage.getItem('n8n-browserId') } })
    return r.status
  }, workflowId)
  assert(status === 200, `n8n now answers ${status}`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await widget(page, '.main').waitFor({ state: 'visible', timeout: 60_000 })
  assert(!page.url().includes('/signin'), 'redirected to sign-in')
  return 'REST 200, no sign-in redirect'
})

await step('an unsaved workflow goes through the paste path', async () => {
  await page.goto(`${N8N}/workflow/new`, { waitUntil: 'domcontentloaded' })
  await widget(page, '.main').waitFor({ state: 'visible', timeout: 60_000 })
  await widget(page, '.main').click()
  await widget(page, '.paste').waitFor({ state: 'visible', timeout: 10_000 })
  const before = await latestDownload(sw)
  const clip = JSON.stringify({ nodes: E2E_WORKFLOW.nodes, connections: E2E_WORKFLOW.connections, pinData: E2E_WORKFLOW.pinData })
  await page.evaluate((text) => {
    const area = document.querySelector('[data-pixtex-extension]').shadowRoot.querySelector('textarea')
    const data = new DataTransfer()
    data.setData('text', text)
    area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, clip)
  await widget(page, '.status.ok').waitFor({ state: 'visible', timeout: 180_000 })
  const d = await waitForDownload(sw, 'png', before?.id)
  const head = readFileSync(d.path).subarray(0, 4)
  assert(head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), 'not a PNG')
  return `pasted workflow exported · ${d.bytes} bytes`
})

await step('Open in Pixtex hands the workflow to the editor — never through a URL', async () => {
  await page.goto(`${N8N}/workflow/${workflowId}`, { waitUntil: 'domcontentloaded' })
  await widget(page, '.main').waitFor({ state: 'visible', timeout: 60_000 })
  await widget(page, '.caret').click()
  const [pixtex] = await Promise.all([
    context.waitForEvent('page', { timeout: 20_000 }),
    widget(page, '.action:text("Open in Pixtex")').click(),
  ])
  const opened = pixtex.url()
  assert(/^http:\/\/localhost:3000\/open#n=[A-Za-z0-9_-]{22}$/.test(opened), `opened ${opened}`)
  await pixtex.waitForURL(`${WEB}/`, { timeout: 120_000 })
  await pixtex.locator('.react-flow').waitFor({ state: 'visible', timeout: 120_000 })
  const session = await pixtex.evaluate(() => {
    const snap = JSON.parse(sessionStorage.getItem('pixtex_session_v1') || 'null')
    return { name: snap?.workflow?.name, pinned: JSON.stringify(snap?.workflow?.pinData ?? {}) }
  })
  assert(session.name === 'E2E flow', `editor holds ${session.name}`)
  assert(!session.pinned.includes('PINNED-RECORD'), 'pinned records reached the editor')
  globalThis.__nonce = opened.split('#n=')[1]
  return `editor opened "${session.name}"; pinned records stayed behind`
})

await step('a replayed handoff link is refused', async () => {
  const replay = await context.newPage()
  await replay.goto(`${WEB}/open#n=${globalThis.__nonce}`, { waitUntil: 'domcontentloaded' })
  await replay.getByText('already been used').waitFor({ timeout: 60_000 })
  assert(!replay.url().includes('#n='), 'nonce left in the address bar')
  return 'refused, and the nonce was removed from the URL'
})

await context.close()

// ── the long render ──────────────────────────────────────────────────────────

console.log('\nagainst a stand-in API that takes 35s:')
const png = tinyPng()
const slow = createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': `chrome-extension://${EXT_ID}`,
    'Access-Control-Allow-Headers': 'content-type, authorization, x-pixtex-client',
    'Access-Control-Expose-Headers': 'Content-Disposition, X-Pixtex-Tier, X-Pixtex-Scale',
    Vary: 'Origin',
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return }
  req.resume()
  setTimeout(() => {
    res.writeHead(200, { ...cors, 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="slow-render.png"', 'X-Pixtex-Tier': 'free', 'X-Pixtex-Scale': '2' })
    res.end(png)
  }, 35_000)
})
await new Promise((r) => slow.listen(SLOW_PORT, r))

const slowRun = await launch(join(ROOT, 'dist-e2e-slow'))
const slowPage = await slowRun.context.newPage()
await step('a 35-second render still completes and downloads', async () => {
  await signIn(slowPage, N8N)
  await slowPage.goto(`${N8N}/workflow/${workflowId}`, { waitUntil: 'domcontentloaded' })
  await widget(slowPage, '.main').waitFor({ state: 'visible', timeout: 60_000 })
  const started = Date.now()
  const { text } = await exportAndWait(slowPage, slowRun.sw, 'png')
  const seconds = Math.round((Date.now() - started) / 1000)
  assert(seconds >= 34, `finished in ${seconds}s — the stand-in was not slow?`)
  return `${text.split('\n')[0]} after ${seconds}s`
})
await slowRun.context.close()
slow.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length && swLog.length) console.log(`\nservice worker console:\n${swLog.slice(-40).join('\n')}`)
process.exit(failed.length ? 1 : 0)

/** A valid 4×4 PNG, built by hand so the stand-in needs no image library. */
function tinyPng() {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, c])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(4, 0); ihdr.writeUInt32BE(4, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc(4 * (1 + 4 * 3), 0xff); for (let y = 0; y < 4; y++) raw[y * 13] = 0
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
