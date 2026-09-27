import { describe, expect, it } from 'vitest'
import { parseEditorRoute } from '../../src/n8n/route'

const at = (path: string, base = '') => parseEditorRoute(new URL(`https://n8n.example${path}`), base)

describe('parseEditorRoute', () => {
  it('reads a saved workflow id, including from its sub-routes', () => {
    expect(at('/workflow/vpUKtTUQ79vc2FJU')).toEqual({ kind: 'saved', id: 'vpUKtTUQ79vc2FJU' })
    expect(at('/workflow/abc123/executions')).toEqual({ kind: 'saved', id: 'abc123' })
    expect(at('/workflow/abc123/node-id-here')).toEqual({ kind: 'saved', id: 'abc123' })
  })

  // 2.x redirects /workflow/new to a generated id + ?new=true — an id n8n has
  // not stored, so fetching it would 404.
  it('treats new, ?new=true, templates and the demo as unsaved', () => {
    expect(at('/workflow/new')).toEqual({ kind: 'unsaved' })
    expect(at('/workflow/Zx81kQ?new=true')).toEqual({ kind: 'unsaved' })
    expect(at('/workflows/templates/2465')).toEqual({ kind: 'unsaved' })
    expect(at('/workflows/demo')).toEqual({ kind: 'unsaved' })
  })

  it('strips a sub-path first', () => {
    expect(at('/automation/workflow/abc123', '/automation')).toEqual({ kind: 'saved', id: 'abc123' })
  })

  it('is other for everything that is not an editor', () => {
    expect(at('/home/workflows')).toEqual({ kind: 'other' })
    expect(at('/projects/p1/workflows')).toEqual({ kind: 'other' })
    expect(at('/signin')).toEqual({ kind: 'other' })
    expect(at('/workflow/')).toEqual({ kind: 'other' })
  })

  it('refuses an id that is not a plain identifier', () => {
    expect(at('/workflow/%2E%2E')).toEqual({ kind: 'other' })
  })
})
