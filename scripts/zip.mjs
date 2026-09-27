#!/usr/bin/env node
// Packs dist/ into pixtex-extension-<version>.zip — the file uploaded to the
// Chrome Web Store and Edge Add-ons. A small zip writer (deflate + CRC-32 from
// node:zlib) so packaging needs no platform tool and works the same on Windows
// and in CI. Entries are sorted and dated at a fixed time, so the same dist/
// always yields the same bytes.

import { deflateRawSync, crc32 } from 'node:zlib'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
const out = join(ROOT, `pixtex-extension-${version}.zip`)

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

// 1980-01-01 00:00 in DOS time — deterministic output.
const DOS_TIME = 0
const DOS_DATE = (0 << 9) | (1 << 5) | 1

const local = []
const central = []
let offset = 0
for (const file of walk(DIST).sort()) {
  const name = Buffer.from(relative(DIST, file).split('\\').join('/'), 'utf8')
  const data = readFileSync(file)
  const packed = deflateRawSync(data, { level: 9 })
  const crc = crc32(data)

  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)          // version needed
  header.writeUInt16LE(0x0800, 6)      // UTF-8 names
  header.writeUInt16LE(8, 8)           // deflate
  header.writeUInt16LE(DOS_TIME, 10)
  header.writeUInt16LE(DOS_DATE, 12)
  header.writeUInt32LE(crc, 14)
  header.writeUInt32LE(packed.length, 18)
  header.writeUInt32LE(data.length, 22)
  header.writeUInt16LE(name.length, 26)
  header.writeUInt16LE(0, 28)
  local.push(header, name, packed)

  const entry = Buffer.alloc(46)
  entry.writeUInt32LE(0x02014b50, 0)
  entry.writeUInt16LE(20, 4)
  entry.writeUInt16LE(20, 6)
  entry.writeUInt16LE(0x0800, 8)
  entry.writeUInt16LE(8, 10)
  entry.writeUInt16LE(DOS_TIME, 12)
  entry.writeUInt16LE(DOS_DATE, 14)
  entry.writeUInt32LE(crc, 16)
  entry.writeUInt32LE(packed.length, 20)
  entry.writeUInt32LE(data.length, 24)
  entry.writeUInt16LE(name.length, 28)
  entry.writeUInt32LE(offset, 42)
  central.push(entry, name)

  offset += header.length + name.length + packed.length
}

const centralBuf = Buffer.concat(central)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(central.length / 2, 8)
end.writeUInt16LE(central.length / 2, 10)
end.writeUInt32LE(centralBuf.length, 12)
end.writeUInt32LE(offset, 16)

writeFileSync(out, Buffer.concat([...local, centralBuf, end]))
console.log(`${relative(ROOT, out)} (${central.length / 2} files)`)
