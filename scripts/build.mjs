#!/usr/bin/env node
// Builds the extension for one of three flavours:
//
//   store  dist/      what goes to the Chrome Web Store and Edge Add-ons —
//                     api.pixtex.dev / pixtex.dev, nothing else
//   dev    dist-dev/  against a local Pixtex (web :3000, api :3001), with a
//                     pinned public key so the extension id is stable and the
//                     local API / web handoff can allow-list it
//   e2e    dist-e2e/  dev, plus a static content script on http://localhost so
//                     the end-to-end run can drive a local n8n without a click
//                     granting site access
//
// Usage: node scripts/build.mjs [--flavour store|dev|e2e]
// Overrides (dev/e2e only): PIXTEX_API_URL, PIXTEX_WEB_URL

import { build } from 'esbuild'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flavour = argv.includes('--flavour') ? argv[argv.indexOf('--flavour') + 1] : 'store'
if (!['store', 'dev', 'e2e'].includes(flavour)) {
  console.error(`unknown flavour "${flavour}" — store, dev or e2e`)
  process.exit(1)
}

// The dev/e2e public key. Only the PUBLIC half exists anywhere: it fixes the
// extension id (pimgfpeogbapfnnebapamdfajflbinpj) so a local API can list it in
// EXTENSION_ORIGINS and the local web app can hand workflows to it. The store
// build never carries a key — the store assigns the real id.
const DEV_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAm2FOI4YD5rF70ACOL0B9aV3cqD2RW8/s+r6FQCrdeZRjDM7Nw4MWXv5DJd5RO++TUKvjbjQWLgBIhHBRzrMeSvR7RrvoGJjwtI2AuzsatOqAcongjnEkFWtMGTYWBc6D8KXcTSp1Vc0spCWACRSbrebPOQDKfs3Qy3QhF6rjyh21V9Y6dNKbS64S3MLLGuMNEKTC6HmIjInxySctFypO6hLLxJRCeLk6FrlFeWlxO93uLhd//k8V6qU14okm5wOIfwpf9nkzysZd7wyU9PcXpri9xOJoVmMw2LGB7Gcu+nXDz4WjAbDqUyFVTZa1JgpQ7PeFfa493gwwBP4rJ5UJiwIDAQAB'

const store = flavour === 'store'
const api = store ? 'https://api.pixtex.dev' : (process.env.PIXTEX_API_URL ?? 'http://localhost:3001')
const web = store ? 'https://pixtex.dev' : (process.env.PIXTEX_WEB_URL ?? 'http://localhost:3000')
// --out lets the e2e run build a second copy against a stand-in API.
const outArg = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null
if (store && outArg) {
  console.error('--out is for dev/e2e builds; the store build always goes to dist/')
  process.exit(1)
}
const outdir = outArg ? resolve(ROOT, outArg) : join(ROOT, store ? 'dist' : `dist-${flavour}`)

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.base.json'), 'utf8'))
manifest.version = pkg.version

if (!store) {
  manifest.key = DEV_KEY
  manifest.name = `${manifest.name} (${flavour})`
  // the handoff page of a LOCAL Pixtex must be able to reach this build
  manifest.externally_connectable.matches.push(`${new URL(web).origin}/*`)
}
if (flavour === 'e2e') {
  manifest.content_scripts[0].matches.push('http://localhost/*')
}

rmSync(outdir, { recursive: true, force: true })
mkdirSync(join(outdir, 'icons'), { recursive: true })

const common = {
  bundle: true,
  target: 'chrome116',
  // Readable on purpose: a store reviewer, or anyone auditing what this does
  // with their workflow, should be able to read the shipped code. Syntax-only
  // minification keeps names and layout but folds the flavour constants, so
  // the store build contains no dev or e2e branches at all.
  minifySyntax: true,
  legalComments: 'none',
  // The widget's mark is the real icon, inlined — no web_accessible_resources.
  loader: { '.png': 'dataurl' },
  define: {
    __PIXTEX_API__: JSON.stringify(api),
    __PIXTEX_WEB__: JSON.stringify(web),
    __FLAVOUR__: JSON.stringify(flavour),
  },
  logLevel: 'warning',
}

await Promise.all([
  build({ ...common, entryPoints: [join(ROOT, 'src/background/index.ts')], outfile: join(outdir, 'background.js'), format: 'esm' }),
  build({ ...common, entryPoints: [join(ROOT, 'src/content/index.ts')], outfile: join(outdir, 'content.js'), format: 'iife' }),
  build({ ...common, entryPoints: [join(ROOT, 'src/offscreen/index.ts')], outfile: join(outdir, 'offscreen.js'), format: 'iife' }),
  build({ ...common, entryPoints: [join(ROOT, 'src/popup/index.ts')], outfile: join(outdir, 'popup.js'), format: 'iife' }),
])

for (const f of ['src/offscreen/offscreen.html', 'src/popup/popup.html', 'src/popup/popup.css']) {
  copyFileSync(join(ROOT, f), join(outdir, f.split('/').pop()))
}
const iconDir = join(ROOT, 'icons')
if (!existsSync(iconDir)) {
  console.error('icons/ is missing — run `npm run icons` first')
  process.exit(1)
}
for (const f of readdirSync(iconDir).filter((f) => f.endsWith('.png'))) {
  copyFileSync(join(iconDir, f), join(outdir, 'icons', f))
}

writeFileSync(join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`built ${flavour} ${pkg.version} -> ${outdir.replace(ROOT, '.')}  (api ${api}, web ${web})`)
