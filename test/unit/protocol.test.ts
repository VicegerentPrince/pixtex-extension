import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, isClaim, isExportRequest, isHandoffRequest, sanitizePrefs } from '../../src/shared/protocol'

const WF = { name: 'x', nodes: [], connections: {} }
const EXPORT = { v: 1, type: 'export', reqId: 'r1', workflow: WF, format: 'png', style: 'canvas', look: 'signature', scale: 2, geometry: 'v2' }

describe('message guards', () => {
  it('accepts a well-formed export request', () => {
    expect(isExportRequest(EXPORT)).toBe(true)
  })

  it('refuses anything off-contract rather than guessing', () => {
    expect(isExportRequest({ ...EXPORT, v: 2 })).toBe(false)
    expect(isExportRequest({ ...EXPORT, format: 'gif' })).toBe(false)
    expect(isExportRequest({ ...EXPORT, scale: 5 })).toBe(false)
    expect(isExportRequest({ ...EXPORT, look: 'neon' })).toBe(false)
    expect(isExportRequest({ ...EXPORT, geometry: 'v3' })).toBe(false)
    expect(isExportRequest({ ...EXPORT, workflow: { nodes: 'x', connections: {} } })).toBe(false)
    expect(isExportRequest({ ...EXPORT, reqId: 'x'.repeat(65) })).toBe(false)
    expect(isExportRequest(null)).toBe(false)
  })

  it('guards a handoff request, intent included', () => {
    expect(isHandoffRequest({ v: 1, type: 'handoff', workflow: WF })).toBe(true)
    expect(isHandoffRequest({ v: 1, type: 'handoff', workflow: WF, intent: 'handover', style: 'diagram' })).toBe(true)
    expect(isHandoffRequest({ v: 1, type: 'handoff', workflow: WF, intent: 'delete-everything' })).toBe(false)
  })

  it('only accepts a nonce shaped like one the worker makes', () => {
    expect(isClaim({ v: 1, type: 'pixtex:claim', nonce: 'AbC_dEf-1234567890xy' })).toBe(true)
    expect(isClaim({ v: 1, type: 'pixtex:claim', nonce: 'short' })).toBe(false)
    expect(isClaim({ v: 1, type: 'pixtex:claim', nonce: '../../etc' })).toBe(false)
    expect(isClaim({ v: 1, type: 'pixtex:claim' })).toBe(false)
  })
})

describe('sanitizePrefs', () => {
  it('fills defaults and drops anything malformed', () => {
    expect(sanitizePrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(sanitizePrefs({ format: 'pdf', scale: 8, look: 'docs', style: 'diagram', secretWarnings: false }))
      .toEqual({ format: 'pdf', scale: 8, look: 'docs', style: 'diagram', secretWarnings: false })
    expect(sanitizePrefs({ format: 'gif', scale: 7, look: 1, style: null, secretWarnings: 'yes' })).toEqual(DEFAULT_PREFS)
  })
})
