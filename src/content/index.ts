// The content script: finds the n8n editor, shows the Export button, and reads
// the workflow when — and only when — the user clicks.
//
// It holds no secrets and stores nothing. Preferences come from the service
// worker; the Pro key never comes here at all.

import { WEB_BASE } from '../shared/config'
import { NO_CAPABILITIES, type Capabilities } from '../shared/formats'
import {
  DEFAULT_PREFS, isMsg,
  type ExportDoneMsg, type ExportFailedMsg, type ExportProgressMsg, type ExportRequestMsg, type HandoffRequestMsg, type Prefs,
} from '../shared/protocol'
import { detectN8n, type N8nPage } from '../n8n/detect'
import { cardGeometryFor, fetchSettings, fetchWorkflow, type ExtractDeps, type N8nSettings } from '../n8n/extract'
import { minimize, workflowFromClipboard } from '../n8n/minimize'
import { parseEditorRoute } from '../n8n/route'
import { scanForSecrets } from '../vendor/sanitize-workflow'
import type { N8nWorkflow } from '../vendor/pixtex-types'
import { createWidget, type Widget } from './widget'

// A registered script and a one-off injection can both land on one page.
const g = globalThis as { __pixtexExtension?: boolean }
if (!g.__pixtexExtension) {
  g.__pixtexExtension = true
  const page = detectN8n(document, location.origin)
  if (page) start(page)
}

type Pending = 'export' | 'open' | 'handover'

function start(page: N8nPage): void {
  // The page's own fetch and storage: same origin, same session, same
  // browser-id — see n8n/extract.ts for why that is the whole point.
  const deps: ExtractDeps = { fetch: window.fetch.bind(window), storage: window.localStorage }
  let settings: Promise<N8nSettings | null> | null = null
  const getSettings = () => (settings ??= fetchSettings(page.restUrl, deps))

  let prefs: Prefs = DEFAULT_PREFS
  let caps: Capabilities = NO_CAPABILITIES
  let currentReq: string | null = null
  let pendingPaste: Pending | null = null
  // Carried into the result line so the render's own status cannot bury it.
  let pendingWarning: string | null = null

  const widget: Widget = createWidget({
    onExport: () => void run('export'),
    onOpenInPixtex: () => void run('open'),
    onHandover: () => void run('handover'),
    onPrefs: (patch) => {
      prefs = { ...prefs, ...patch }
      widget.setPrefs(prefs)
      void chrome.runtime.sendMessage({ v: 1, type: 'prefs:set', prefs: patch }).catch(() => {})
    },
    onPaste: (text) => {
      const wf = workflowFromClipboard(text, workflowNameFromPage())
      if (!wf) {
        widget.showStatus('error', 'That isn’t an n8n workflow. Select the nodes in n8n (Ctrl+A), copy (Ctrl+C) and paste again.')
        return
      }
      widget.hidePaste()
      const action = pendingPaste ?? 'export'
      pendingPaste = null
      void act(action, wf)
    },
  })

  void chrome.runtime.sendMessage({ v: 1, type: 'prefs:get' }).then((p: Prefs | undefined) => {
    if (p) prefs = p
    widget.setPrefs(prefs)
  }).catch(() => widget.setPrefs(prefs))
  void chrome.runtime.sendMessage({ v: 1, type: 'capabilities:get' }).then((c: Capabilities | undefined) => {
    caps = c ?? NO_CAPABILITIES
    widget.setCaps(caps)
  }).catch(() => {})

  // ── where the button sits ──
  // Over the canvas's free bottom-right corner (n8n keeps its own controls
  // bottom-left and bottom-centre), following the canvas as panels open and
  // close — and gone whenever there is no canvas, or a modal is up.
  let observed: Element | null = null
  const resize = new ResizeObserver(() => place())
  function canvas(): Element | null {
    return document.querySelector('[data-test-id="canvas-wrapper"]') ?? document.querySelector('.vue-flow') ?? document.querySelector('#node-view')
  }
  function modalOpen(): boolean {
    return Boolean(document.querySelector('[data-test-id="ndv"], .ndv-wrapper, .el-overlay:not([style*="display: none"])'))
  }
  function place(): void {
    const route = parseEditorRoute(new URL(location.href), page.basePath)
    const c = route.kind === 'other' ? null : canvas()
    if (c !== observed) {
      if (observed) resize.unobserve(observed)
      if (c) resize.observe(c)
      observed = c
    }
    widget.setAnchor(c && !modalOpen() ? c.getBoundingClientRect() : null)
  }
  // n8n is a single-page app: routes change without a load event, so a light
  // poll is the dependable signal across 1.x and 2.x.
  place()
  window.setInterval(place, 800)
  window.addEventListener('resize', place)

  // ── results from the service worker ──
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isMsg<ExportProgressMsg>(message, 'export:progress') && message.reqId === currentReq) {
      widget.setBusy(true, 'Rendering…')
    } else if (isMsg<ExportDoneMsg>(message, 'export:done') && message.reqId === currentReq) {
      currentReq = null
      widget.setBusy(false)
      const bits = [`Saved ${message.filename}`]
      if (message.scale) bits.push(`${message.scale}×`)
      if (message.tier === 'free') bits.push('free · with watermark')
      const clamped = message.tier === 'free' && message.scale > 0 && message.scale < prefs.scale
      let text = clamped ? `${bits.join(' · ')}. ${prefs.scale}× is a Pro size, so this one is ${message.scale}×.` : bits.join(' · ')
      if (pendingWarning) text += `\n⚠ ${pendingWarning}`
      pendingWarning = null
      widget.showStatus(
        'ok',
        text,
        message.tier === 'free' ? { href: 'https://pixtex.dev/pricing', label: 'Remove the watermark with Pro' } : undefined,
        Boolean(text.includes('⚠')),
      )
    } else if (isMsg<ExportFailedMsg>(message, 'export:failed') && message.reqId === currentReq) {
      currentReq = null
      pendingWarning = null
      widget.setBusy(false)
      const link = message.code === 'daily-limit'
        ? { href: 'https://pixtex.dev/developers#key', label: 'Get a free key' }
        : undefined
      widget.showStatus('error', message.message, link)
    }
    return false
  })

  function workflowNameFromPage(): string | undefined {
    const field = document.querySelector('[data-test-id="workflow-name-input"]')
    const value = field instanceof HTMLInputElement ? field.value : field?.textContent
    return value?.trim() || document.title.replace(/\s*[-–|]\s*n8n\s*$/i, '').trim() || undefined
  }

  /** Reads the open workflow, or explains why it has to be pasted instead. */
  async function run(action: Pending): Promise<void> {
    if (currentReq) return
    const route = parseEditorRoute(new URL(location.href), page.basePath)
    if (route.kind !== 'saved') {
      pendingPaste = action
      widget.showPaste('This workflow isn’t saved yet, so Pixtex can’t read it from n8n.')
      return
    }
    widget.setBusy(true, 'Reading…')
    const result = await fetchWorkflow(page.restUrl, route.id, deps)
    widget.setBusy(false)
    if (!result.ok) {
      pendingPaste = action
      widget.showPaste(result.reason === 'unsaved'
        ? 'This workflow isn’t saved yet, so Pixtex can’t read it from n8n.'
        : 'n8n didn’t let Pixtex read this workflow.')
      return
    }
    await act(action, minimize(result.workflow))
  }

  async function act(action: Pending, workflow: N8nWorkflow): Promise<void> {
    if (action === 'open' || action === 'handover') {
      const msg: HandoffRequestMsg = { v: 1, type: 'handoff', workflow, style: prefs.style, intent: action === 'handover' ? 'handover' : 'edit' }
      const res = (await chrome.runtime.sendMessage(msg).catch(() => null)) as { ok?: boolean; reason?: string } | null
      if (!res?.ok) {
        widget.showStatus('error', res?.reason === 'too-large'
          ? 'This workflow is too large to hand over. Download it from n8n and drop the file on pixtex.dev instead.'
          : 'Couldn’t open Pixtex. Try again, or drop the workflow file on pixtex.dev.', { href: WEB_BASE, label: 'Open pixtex.dev' })
      }
      return
    }

    // Non-blocking: nothing is stored anywhere, but a node's text can put a
    // value on the picture, and the person exporting should know that first.
    const warnings = prefs.secretWarnings ? scanForSecrets(workflow) : []
    const geometry = cardGeometryFor((await getSettings())?.versionCli)
    const reqId = crypto.randomUUID()
    currentReq = reqId
    widget.setBusy(true, 'Rendering…')
    const req: ExportRequestMsg = {
      v: 1, type: 'export', reqId, workflow,
      format: prefs.format, style: prefs.style, look: prefs.look, scale: prefs.scale, geometry,
    }
    if (warnings.length) {
      const first = warnings[0]!
      pendingWarning = `${warnings.length === 1 ? 'A value' : `${warnings.length} values`} in this workflow look like credentials (first: ${first.nodeName} · ${first.path}). Nothing is stored, but if a node shows it as text it will be in the image.`
    }
    await chrome.runtime.sendMessage(req).catch(() => {
      currentReq = null
      pendingWarning = null
      widget.setBusy(false)
      widget.showStatus('error', 'Pixtex was just updated — reload this tab to use it.')
    })
  }
}
