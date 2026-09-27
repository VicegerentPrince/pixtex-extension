// Which workflow the editor is showing, read from its URL.
//
//   /workflow/:id(/…)          a saved workflow (sub-routes: executions, debug,
//                              evaluation, history — all still about :id)
//   /workflow/new              unsaved; 2.x redirects it to /workflow/<id>?new=true,
//                              an id that is NOT in the database until saved
//   /workflows/templates/*     a template preview — unsaved
//   /workflows/demo            the demo canvas — unsaved
//
// The editor URL is never project-scoped; project URLs are list pages.

export type EditorRoute =
  | { kind: 'saved'; id: string }
  | { kind: 'unsaved' }
  | { kind: 'other' }

const ID = /^[A-Za-z0-9_-]{1,64}$/

export function parseEditorRoute(url: URL, basePath: string): EditorRoute {
  let path = url.pathname
  if (basePath && path.startsWith(basePath)) path = path.slice(basePath.length) || '/'
  const segments = path.split('/').filter(Boolean)

  if (segments[0] === 'workflows' && (segments[1] === 'templates' || segments[1] === 'demo')) {
    return { kind: 'unsaved' }
  }
  if (segments[0] !== 'workflow' || !segments[1]) return { kind: 'other' }

  const id = segments[1]
  if (id === 'new' || url.searchParams.get('new') === 'true') return { kind: 'unsaved' }
  return ID.test(id) ? { kind: 'saved', id } : { kind: 'other' }
}
