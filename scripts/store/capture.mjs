#!/usr/bin/env node
// Raw material for the Chrome Web Store images: the real extension, in the
// real n8n editor, exporting Pixtex's demo workflow through a local Pixtex.
// compose.mjs frames these; nothing in the listing is mocked up.
//
//   store/raw/editor.png          n8n editor with the Export button
//   store/raw/editor-menu.png     the same, menu open
//   store/raw/editor-saved.png    the same, right after an export
//   store/raw/export-*.png        the extension's own downloads: four looks + the poster
//   store/raw/pixtex-editor.png   Open in Pixtex → the pixtex.dev editor
//
// Needs what `npm run e2e` needs — n8n on N8N_URL (default :5678), fresh or
// with its owner in E2E_N8N_EMAIL / E2E_N8N_PASSWORD (test/e2e/n8n-owner.mjs),
// Pixtex web on :3000 and api on :3001 with the dev build's id in
// EXTENSION_ORIGINS.
//
// Run: node scripts/store/capture.mjs && node scripts/store/compose.mjs

import { chromium } from 'playwright'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { signIn } from '../../test/e2e/n8n-owner.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const RAW = join(ROOT, 'store/raw')
const EXT = join(ROOT, 'dist-e2e')
const N8N = process.env.N8N_URL ?? 'http://localhost:5678'
const WEB = 'http://localhost:3000'
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const built = spawnSync(process.execPath, [join(ROOT, 'scripts/build.mjs'), '--flavour', 'e2e'], { encoding: 'utf8' })
if (built.status !== 0) throw new Error(`build failed: ${built.stderr || built.stdout}`)
mkdirSync(RAW, { recursive: true })

const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'pixtex-store-')), {
  channel: 'chromium', headless: true, acceptDownloads: true,
  // 1440×810 at 2× — compose.mjs scales these down, so text stays sharp
  viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
})
context.setDefaultNavigationTimeout(120_000)
context.setDefaultTimeout(60_000)
let [sw] = context.serviceWorkers()
sw ??= await context.waitForEvent('serviceworker')
const page = await context.newPage()

/** n8n's REST API the way its own editor calls it: same origin, its own browser-id. */
const rest = (path, method, body) => page.evaluate(async ({ path, method, body }) => {
  let bid = localStorage.getItem('n8n-browserId')
  if (!bid) { bid = crypto.randomUUID(); localStorage.setItem('n8n-browserId', bid) }
  const r = await fetch(`/rest${path}`, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'browser-id': bid },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not JSON */ }
  return { status: r.status, json, text: text.slice(0, 300) }
}, { path, method, body })

// ── signed in, dummy credentials (so n8n draws no warnings), the demo workflow ──
await signIn(page, N8N)

const cred = {}
for (const [type, name, data] of [
  ['gmailOAuth2', 'Gmail account', { clientId: 'demo', clientSecret: 'demo' }],
  ['openAiApi', 'OpenAI account', { apiKey: 'demo' }],
  ['slackApi', 'Slack account', { accessToken: 'demo' }],
  ['googleSheetsOAuth2Api', 'Google Sheets account', { clientId: 'demo', clientSecret: 'demo' }],
]) {
  const r = await rest('/credentials', 'POST', { name, type, data })
  if (r.status !== 200) throw new Error(`credential ${type}: ${r.status} ${r.text}`)
  cred[type] = { id: r.json.data.id, name }
}

const rl = (value, extra = {}) => ({ __rl: true, mode: 'list', value, ...extra })
/** Pixtex's demo workflow (the monorepo's lib/sample-workflow.ts), with the parameters n8n needs to draw it clean. */
const WORKFLOW = {
  name: 'AI Email Triage & Auto-Reply',
  settings: { executionOrder: 'v1' },
  nodes: [
    { id: randomUUID(), name: 'Sticky Note', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-80, 120], parameters: { content: '## 📬 Watch the inbox\nFires on every new email — no polling scripts, no cron.', width: 300, height: 400, color: 4 } },
    { id: randomUUID(), name: 'Sticky Note1', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [280, 120], parameters: { content: '## 🤖 AI triage\nThe agent reads the email, classifies urgency + intent, and drafts a reply in your tone.', width: 560, height: 640, color: 5 } },
    { id: randomUUID(), name: 'Sticky Note2', type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [900, 120], parameters: { content: '## 📣 Route & log\nUrgent → Slack ping. Everything else → polite auto-reply. All of it lands in the sheet.', width: 640, height: 400, color: 6 } },
    { id: randomUUID(), name: 'New Email', type: 'n8n-nodes-base.gmailTrigger', typeVersion: 1.2, position: [0, 300], credentials: { gmailOAuth2: cred.gmailOAuth2 }, parameters: { pollTimes: { item: [{ mode: 'everyMinute' }] }, simple: false, filters: { labelIds: ['INBOX'] }, options: {} } },
    { id: randomUUID(), name: 'Triage Agent', type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 1.9, position: [340, 300], parameters: { promptType: 'define', text: '=From: {{ $json.from.text }}\nSubject: {{ $json.subject }}\n\n{{ $json.text }}', hasOutputParser: true, options: { systemMessage: 'Classify the email as urgent or not, name its intent, and draft a short, friendly reply.' } } },
    { id: randomUUID(), name: 'GPT-4.1', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, position: [300, 560], credentials: { openAiApi: cred.openAiApi }, parameters: { model: rl('gpt-4.1', { cachedResultName: 'gpt-4.1' }), options: {} } },
    { id: randomUUID(), name: 'Memory', type: '@n8n/n8n-nodes-langchain.memoryBufferWindow', typeVersion: 1.3, position: [460, 560], parameters: { sessionIdType: 'customKey', sessionKey: '={{ $json.threadId }}', contextWindowLength: 10 } },
    { id: randomUUID(), name: 'Ticket Schema', type: '@n8n/n8n-nodes-langchain.outputParserStructured', typeVersion: 1.2, position: [620, 560], parameters: { jsonSchemaExample: '{\n  "urgent": true,\n  "intent": "refund",\n  "reply": "Thanks for reaching out — we are on it."\n}' } },
    { id: randomUUID(), name: 'Urgent?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [700, 300], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ id: randomUUID(), leftValue: '={{ $json.output.urgent }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } },
    { id: randomUUID(), name: 'Ping #support', type: 'n8n-nodes-base.slack', typeVersion: 2.3, position: [980, 200], credentials: { slackApi: cred.slackApi }, parameters: { select: 'channel', channelId: rl('C0SUPPORT', { cachedResultName: 'support' }), text: '=🚨 Urgent email from {{ $json.from }}: {{ $json.subject }}', otherOptions: {} } },
    { id: randomUUID(), name: 'Send Auto-Reply', type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: [980, 400], credentials: { gmailOAuth2: cred.gmailOAuth2 }, parameters: { sendTo: '={{ $json.from }}', subject: '=Re: {{ $json.subject }}', message: '={{ $json.output.reply }}', options: {} } },
    { id: randomUUID(), name: 'Log to Sheet', type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, position: [1280, 300], credentials: { googleSheetsOAuth2Api: cred.googleSheetsOAuth2Api }, parameters: { operation: 'append', documentId: rl('1PxtxDemoSheet', { cachedResultName: 'Support inbox log' }), sheetName: rl('gid=0', { cachedResultName: 'Emails' }), columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] }, options: {} } },
  ],
  connections: {
    'New Email': { main: [[{ node: 'Triage Agent', type: 'main', index: 0 }]] },
    'Triage Agent': { main: [[{ node: 'Urgent?', type: 'main', index: 0 }]] },
    'GPT-4.1': { ai_languageModel: [[{ node: 'Triage Agent', type: 'ai_languageModel', index: 0 }]] },
    'Memory': { ai_memory: [[{ node: 'Triage Agent', type: 'ai_memory', index: 0 }]] },
    'Ticket Schema': { ai_outputParser: [[{ node: 'Triage Agent', type: 'ai_outputParser', index: 0 }]] },
    'Urgent?': { main: [[{ node: 'Ping #support', type: 'main', index: 0 }], [{ node: 'Send Auto-Reply', type: 'main', index: 0 }]] },
    'Ping #support': { main: [[{ node: 'Log to Sheet', type: 'main', index: 0 }]] },
    'Send Auto-Reply': { main: [[{ node: 'Log to Sheet', type: 'main', index: 0 }]] },
  },
}
const created = await rest('/workflows', 'POST', WORKFLOW)
if (created.status !== 200) throw new Error(`workflow: ${created.status} ${created.text}`)
log('demo workflow created')

// ── the editor ─────────────────────────────────────────────────────────────────
const widget = (sel) => page.locator(`[data-pixtex-extension] ${sel}`)
await page.goto(`${N8N}/workflow/${created.json.data.id}`, { waitUntil: 'domcontentloaded' })
await widget('.main').waitFor({ state: 'visible', timeout: 120_000 })
await page.waitForTimeout(2500)
for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
await page.mouse.move(700, 120) // no hover state on any node
await page.waitForTimeout(800)
await page.screenshot({ path: join(RAW, 'editor.png') })
await widget('.caret').click()
await page.waitForTimeout(500)
await page.screenshot({ path: join(RAW, 'editor-menu.png') })
await widget('.caret').click()
log('editor')

// ── the extension's own downloads ───────────────────────────────────────────────
const latest = () => sw.evaluate(async () => {
  const [d] = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 })
  return d ? { id: d.id, path: d.filename, state: d.state } : null
})
async function choose(label) {
  await widget('.caret').click()
  await widget(`.chip:text-is("${label}")`).click()
  await widget('.caret').click()
}
async function exportTo(name) {
  const before = await latest()
  await widget('.main').click()
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-pixtex-extension]')?.shadowRoot
    const s = root?.querySelector('.status')
    return s && !s.hidden && !(root?.querySelector('.main span')?.textContent ?? '').includes('…')
  }, null, { timeout: 180_000 })
  const status = (await widget('.status').textContent())?.trim() ?? ''
  if (!(await widget('.status').getAttribute('class'))?.includes('ok')) throw new Error(`widget said: ${status}`)
  for (let i = 0; i < 120; i++) {
    const d = await latest()
    if (d && d.id !== before?.id && d.state === 'complete') { copyFileSync(d.path, join(RAW, name)); log(name); return }
    await page.waitForTimeout(500)
  }
  throw new Error(`no download for ${name}`)
}

await choose('PNG')
await choose('2×')
await choose('Canvas')
for (const [label, file] of [['Signature', 'export-signature.png'], ['Like n8n', 'export-like-n8n.png'], ['Docs', 'export-docs.png'], ['Slide', 'export-slide.png']]) {
  await choose(label)
  await exportTo(file)
  if (label === 'Signature') {
    await page.mouse.move(700, 120)
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(RAW, 'editor-saved.png') })
  }
}
await choose('Signature')
await choose('Diagram poster')
await exportTo('export-poster.png')
await choose('Canvas')

// ── Open in Pixtex ──────────────────────────────────────────────────────────────
await widget('.caret').click()
const [pixtex] = await Promise.all([
  context.waitForEvent('page', { timeout: 20_000 }),
  widget('.action:text("Open in Pixtex")').click(),
])
await pixtex.waitForURL(`${WEB}/`, { timeout: 120_000 })
await pixtex.locator('.react-flow').waitFor({ state: 'visible', timeout: 120_000 })
// A first visit gets the five-stop tour; skip it the way a person would — once
// it is actually on screen, since it waits for Pixel to land before appearing.
const tour = pixtex.locator('[role="dialog"][aria-modal="true"]')
const toured = await tour.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false)
if (toured) {
  await pixtex.keyboard.press('Escape')
  await tour.waitFor({ state: 'hidden', timeout: 10_000 })
}
await pixtex.waitForTimeout(2000) // Pixel's reply, and the scrim's fade
await pixtex.screenshot({ path: join(RAW, 'pixtex-editor.png') })
log('pixtex editor')

await context.close()
