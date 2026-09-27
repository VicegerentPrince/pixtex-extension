#!/usr/bin/env node
// src/vendor/ holds code copied from the Pixtex monorepo. vendor.lock.json
// records a hash of each copied file, so an edit made HERE — which would make
// the extension quietly disagree with pixtex.dev about what counts as a secret
// or what a look is — fails CI until someone re-copies deliberately and runs:
//
//   npm run vendor:check -- --update

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VENDOR = join(ROOT, 'src', 'vendor')
const LOCK = join(ROOT, 'vendor.lock.json')

// Hash with normalised line endings so a Windows checkout agrees with CI.
const hash = (file) => createHash('sha256').update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex')
const current = Object.fromEntries(readdirSync(VENDOR).filter((f) => f.endsWith('.ts')).sort().map((f) => [f, hash(join(VENDOR, f))]))

if (process.argv.includes('--update')) {
  writeFileSync(LOCK, JSON.stringify(current, null, 2) + '\n')
  console.log(`vendor.lock.json updated (${Object.keys(current).length} files)`)
  process.exit(0)
}

if (!existsSync(LOCK)) {
  console.error('vendor.lock.json is missing — run `npm run vendor:check -- --update`')
  process.exit(1)
}
const locked = JSON.parse(readFileSync(LOCK, 'utf8'))
const changed = [...new Set([...Object.keys(locked), ...Object.keys(current)])].filter((f) => locked[f] !== current[f])
if (changed.length) {
  console.error(`vendored files changed without re-vendoring: ${changed.join(', ')}\n` +
    'Copy them from the monorepo again, then run `npm run vendor:check -- --update`.')
  process.exit(1)
}
console.log('vendor check passed')
