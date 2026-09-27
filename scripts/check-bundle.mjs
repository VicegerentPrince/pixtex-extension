#!/usr/bin/env node
// Checks the STORE build (dist/) for the promises the README makes, so a
// regression fails CI instead of reaching a user:
//
//   - the content script never mentions the Pro key or an Authorization header
//     (it runs inside someone's n8n page; the key lives in the worker only)
//   - no dev key, no localhost, no eval / new Function anywhere
//   - permissions and externally_connectable are exactly what the README lists
//
// Run after `npm run build`.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const failures = []
const fail = (msg) => failures.push(msg)

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'))
if ('key' in manifest) fail('store manifest carries a `key` — that pins the dev id')
const expectPermissions = ['activeTab', 'downloads', 'offscreen', 'scripting', 'storage']
if (JSON.stringify([...manifest.permissions].sort()) !== JSON.stringify(expectPermissions)) {
  fail(`permissions changed: ${JSON.stringify(manifest.permissions)} (README promises ${JSON.stringify(expectPermissions)})`)
}
if (manifest.host_permissions?.length) fail(`unexpected host_permissions: ${JSON.stringify(manifest.host_permissions)}`)
if (JSON.stringify(manifest.externally_connectable) !== JSON.stringify({ matches: ['https://pixtex.dev/*'] })) {
  fail(`externally_connectable must be exactly pixtex.dev: ${JSON.stringify(manifest.externally_connectable)}`)
}
if (JSON.stringify(manifest.content_scripts.map((c) => c.matches)) !== JSON.stringify([['https://*.app.n8n.cloud/*']])) {
  fail(`static content scripts must be n8n Cloud only: ${JSON.stringify(manifest.content_scripts)}`)
}
if (manifest.web_accessible_resources) fail('web_accessible_resources would let any page probe for the extension')

const content = readFileSync(join(DIST, 'content.js'), 'utf8')
// Not the bare word "Bearer": the vendored secret scanner looks FOR bearer
// tokens in node parameters. What must never appear is code that could BUILD
// an auth header or read the stored key.
for (const needle of ['pixtex_pro_key', 'Authorization', 'Bearer ${', 'pro:set', 'pro:status']) {
  if (content.includes(needle)) fail(`content.js contains "${needle}" — the key must never reach a content script`)
}
// esbuild folds the flavour constant, so the store bundle must say "closed"
// outright — an open shadow root would let n8n's own scripts read the widget.
if (!/attachShadow\(\{\s*mode:\s*"closed"\s*\}\)/.test(content)) fail('content.js does not attach a CLOSED shadow root')
const background = readFileSync(join(DIST, 'background.js'), 'utf8')
if (!background.includes('pixtex_pro_key')) fail('background.js no longer holds the key — did it move somewhere less trusted?')

for (const file of readdirSync(DIST).filter((f) => f.endsWith('.js') || f.endsWith('.html') || f.endsWith('.json'))) {
  const text = readFileSync(join(DIST, file), 'utf8')
  if (/localhost|127\.0\.0\.1/.test(text)) fail(`${file} mentions localhost`)
  if (/\beval\s*\(|new\s+Function\s*\(/.test(text)) fail(`${file} uses eval or new Function`)
}

if (failures.length) {
  console.error(`store bundle check FAILED:\n  - ${failures.join('\n  - ')}`)
  process.exit(1)
}
console.log('store bundle check passed')
