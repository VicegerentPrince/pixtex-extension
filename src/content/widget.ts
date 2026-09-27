// The Export button and its menu, in a closed shadow root so n8n's styles
// cannot reach in and n8n's scripts cannot read out. Built from plain DOM — no
// framework — so what ships is small and easy to audit.

import markUrl from '../../icons/32.png'
import { FORMAT_LABEL, MORE_FORMATS, PRIMARY_FORMATS, SCALES, type Capabilities } from '../shared/formats'

// Injected by scripts/build.mjs; referenced directly (not via shared/config)
// so the store build folds the shadow-root mode below to a literal.
declare const __FLAVOUR__: 'store' | 'dev' | 'e2e'
import type { Prefs } from '../shared/protocol'
import { LOOKS } from '../vendor/look-presets'
import type { ExportFormat, ExportScale, ExportStyle } from '../vendor/pixtex-types'
import type { LookId } from '../vendor/look-presets'

export interface WidgetHandlers {
  onExport(): void
  onPrefs(patch: Partial<Prefs>): void
  onOpenInPixtex(): void
  onHandover(): void
  onPaste(text: string): void
}

export type StatusKind = 'info' | 'ok' | 'error'

export interface Widget {
  setAnchor(rect: DOMRect | null): void
  setPrefs(prefs: Prefs): void
  setCaps(caps: Capabilities): void
  setBusy(busy: boolean, label?: string): void
  showStatus(kind: StatusKind, text: string, link?: { href: string; label: string }, sticky?: boolean): void
  showPaste(reason: string): void
  hidePaste(): void
  isOpen(): boolean
  destroy(): void
}

const CSS = `
:host { all: initial; }
.root { position: fixed; z-index: 2147483000; font: 13px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #F0EEE8; }
.root[hidden] { display: none; }
.bar { display: flex; border-radius: 10px; overflow: hidden; background: #0D0D0F;
  box-shadow: 0 6px 22px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.1); }
.bar:hover { box-shadow: 0 6px 22px rgba(0,0,0,.28), 0 0 0 1px rgba(255,69,0,.7); }
button { font: inherit; }
.main { display: flex; align-items: center; gap: 8px; padding: 8px 13px 8px 9px; border: 0; background: transparent;
  color: #F0EEE8; font-weight: 600; cursor: pointer; white-space: nowrap; }
.main:hover { background: rgba(255,255,255,.06); }
.main:disabled { cursor: default; opacity: .8; }
.caret { width: 30px; border: 0; border-left: 1px solid rgba(255,255,255,.12); background: transparent; color: #F0EEE8; cursor: pointer; font-size: 11px; }
.caret:hover { background: rgba(255,255,255,.06); }
.mark { width: 20px; height: 20px; display: block; image-rendering: auto; }
.panel { position: absolute; right: 0; bottom: calc(100% + 8px); width: 312px; box-sizing: border-box; padding: 12px;
  background: #0D0D0F; border: 1px solid rgba(255,255,255,.1); border-radius: 12px; box-shadow: 0 14px 40px rgba(0,0,0,.42); }
.panel[hidden] { display: none; }
.label { margin: 12px 0 6px; font: 10px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .12em;
  text-transform: uppercase; color: rgba(240,238,232,.45); }
.label:first-child { margin-top: 2px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { padding: 5px 9px; border: 1px solid rgba(255,255,255,.14); border-radius: 7px; background: transparent;
  color: rgba(240,238,232,.85); font-size: 12px; cursor: pointer; }
.chip:hover { border-color: rgba(255,255,255,.3); }
.chip[aria-pressed="true"] { border-color: #FF4500; background: rgba(255,69,0,.16); color: #fff; }
.pro { margin-left: 4px; font: 9px ui-monospace, Menlo, Consolas, monospace; color: #FF6B2E; }
.sep { height: 1px; margin: 12px 0 6px; background: rgba(255,255,255,.08); }
.action { display: block; width: 100%; padding: 8px 6px; border: 0; border-radius: 7px; background: transparent;
  color: #F0EEE8; text-align: left; cursor: pointer; font-size: 13px; }
.action:hover { background: rgba(255,255,255,.07); }
.action[hidden] { display: none; }
.foot { margin-top: 8px; font-size: 11px; color: rgba(240,238,232,.45); }
.foot a { color: rgba(240,238,232,.7); }
.status { position: absolute; right: 0; bottom: calc(100% + 8px); max-width: 320px; width: max-content; box-sizing: border-box;
  padding: 9px 12px; background: #0D0D0F; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; font-size: 12.5px;
  box-shadow: 0 10px 30px rgba(0,0,0,.35); white-space: pre-line; }
.status[hidden] { display: none; }
.status.ok { border-color: rgba(72,187,120,.55); }
.status.error { border-color: rgba(248,113,113,.6); }
.status a { display: inline-block; margin-top: 4px; color: #FF6B2E; }
.paste { position: absolute; right: 0; bottom: calc(100% + 8px); width: 300px; box-sizing: border-box; padding: 12px;
  background: #0D0D0F; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; box-shadow: 0 14px 40px rgba(0,0,0,.42); }
.paste[hidden] { display: none; }
.paste p { margin: 0 0 8px; font-size: 12.5px; color: rgba(240,238,232,.8); }
.paste kbd { font: 11px ui-monospace, Menlo, Consolas, monospace; padding: 1px 4px; border: 1px solid rgba(255,255,255,.2); border-radius: 4px; }
.paste textarea { width: 100%; height: 64px; box-sizing: border-box; resize: none; padding: 8px; border-radius: 8px;
  border: 1px dashed rgba(255,255,255,.25); background: rgba(255,255,255,.04); color: #F0EEE8; font: 12px ui-monospace, Menlo, Consolas, monospace; }
.paste textarea:focus { outline: none; border-color: #FF4500; }
`

type Attrs = Record<string, string | boolean | undefined>

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, children: Array<Node | string> = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (k === 'text') node.textContent = String(v)
    else node.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children) node.append(c)
  return node
}

export function createWidget(handlers: WidgetHandlers): Widget {
  const host = el('div', { 'data-pixtex-extension': '' })
  // Closed everywhere users are: n8n's scripts cannot reach in. Only the e2e
  // build opens it, because a closed root is closed to the test driver too
  // (scripts/check-bundle.mjs fails a store build that is not closed).
  const shadow = host.attachShadow({ mode: __FLAVOUR__ === 'e2e' ? 'open' : 'closed' })
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(CSS)
  shadow.adoptedStyleSheets = [sheet]

  const root = el('div', { class: 'root', hidden: true, role: 'region', 'aria-label': 'Pixtex export' })
  const main = el('button', { class: 'main', type: 'button' })
  // The real mark, inlined as a data URL at build time: the hand-traced icon is
  // never redrawn, and inlining needs no web_accessible_resources — which would
  // let any page probe for the extension.
  const mainLabel = el('span', { text: 'Export PNG' })
  main.append(el('img', { class: 'mark', src: markUrl, alt: '' }), mainLabel)
  const caret = el('button', { class: 'caret', type: 'button', 'aria-label': 'Export options', 'aria-expanded': 'false', text: '▾' })
  const bar = el('div', { class: 'bar' }, [main, caret])

  // ── menu ──
  const panel = el('div', { class: 'panel', hidden: true, role: 'dialog', 'aria-label': 'Export options' })
  const formatChips = el('div', { class: 'chips' })
  const styleChips = el('div', { class: 'chips' })
  const lookChips = el('div', { class: 'chips' })
  const scaleChips = el('div', { class: 'chips' })
  const openAction = el('button', { class: 'action', type: 'button', text: 'Open in Pixtex to style it ↗' })
  const handoverAction = el('button', { class: 'action', type: 'button', hidden: true, text: 'Client handover PDF… ↗' })
  const foot = el('div', { class: 'foot' })
  foot.innerHTML = 'Rendered by <a href="https://pixtex.dev" target="_blank" rel="noopener">pixtex.dev</a> · <a href="https://pixtex.dev/privacy" target="_blank" rel="noopener">privacy</a>'
  panel.append(
    el('div', { class: 'label', text: 'Format' }), formatChips,
    el('div', { class: 'label', text: 'Style' }), styleChips,
    el('div', { class: 'label', text: 'Look' }), lookChips,
    el('div', { class: 'label', text: 'Scale' }), scaleChips,
    el('div', { class: 'sep' }), openAction, handoverAction, foot,
  )

  // ── status + paste ──
  const status = el('div', { class: 'status', hidden: true, role: 'status', 'aria-live': 'polite' })
  const paste = el('div', { class: 'paste', hidden: true, role: 'dialog', 'aria-label': 'Paste workflow' })
  const pasteReason = el('p')
  const pasteArea = el('textarea', { 'aria-label': 'Paste the workflow here', placeholder: 'Paste here' })
  paste.append(pasteReason, el('p', {}, []), pasteArea)
  const pasteHow = paste.querySelectorAll('p')[1]!
  pasteHow.innerHTML = 'In n8n press <kbd>Ctrl</kbd>+<kbd>A</kbd>, then <kbd>Ctrl</kbd>+<kbd>C</kbd>, and paste it here.'

  root.append(panel, status, paste, bar)
  shadow.append(root)
  document.documentElement.append(host)

  let prefs: Prefs | null = null
  let statusTimer: ReturnType<typeof setTimeout> | undefined

  function chip(label: string, pressed: boolean, onClick: () => void, pro = false): HTMLButtonElement {
    const b = el('button', { class: 'chip', type: 'button', 'aria-pressed': String(pressed) }, [label])
    if (pro) b.append(el('span', { class: 'pro', text: 'PRO' }))
    b.addEventListener('click', onClick)
    return b
  }

  function renderMenu(): void {
    if (!prefs) return
    const p = prefs
    formatChips.replaceChildren(...[...PRIMARY_FORMATS, ...MORE_FORMATS].map(({ format, label }) =>
      chip(label, p.format === format, () => handlers.onPrefs({ format: format as ExportFormat }))))
    styleChips.replaceChildren(
      chip('Canvas', p.style === 'canvas', () => handlers.onPrefs({ style: 'canvas' as ExportStyle })),
      chip('Diagram poster', p.style === 'diagram', () => handlers.onPrefs({ style: 'diagram' as ExportStyle })),
    )
    lookChips.replaceChildren(...LOOKS.map(({ id, label }) => chip(label, p.look === id, () => handlers.onPrefs({ look: id as LookId }))))
    // 6x and 8x are Pro: offered, marked, and clamped by the server for a free
    // render — which the result line then says, rather than failing.
    scaleChips.replaceChildren(...SCALES.map(({ scale, pro }) =>
      chip(`${scale}×`, p.scale === scale, () => handlers.onPrefs({ scale: scale as ExportScale }), pro)))
    mainLabel.textContent = `Export ${FORMAT_LABEL[p.format]}`
  }

  function openPanel(open: boolean): void {
    panel.hidden = !open
    caret.setAttribute('aria-expanded', String(open))
    if (open) { status.hidden = true; paste.hidden = true }
  }

  main.addEventListener('click', () => { openPanel(false); handlers.onExport() })
  caret.addEventListener('click', () => openPanel(panel.hidden))
  openAction.addEventListener('click', () => { openPanel(false); handlers.onOpenInPixtex() })
  handoverAction.addEventListener('click', () => { openPanel(false); handlers.onHandover() })
  pasteArea.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') ?? ''
    e.preventDefault()
    if (text.trim()) handlers.onPaste(text)
  })

  // Close on Escape or a click anywhere outside the widget.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (!panel.hidden || !paste.hidden)) { openPanel(false); paste.hidden = true }
  }
  const onPointer = (e: PointerEvent) => {
    if (!e.composedPath().includes(host)) { openPanel(false) }
  }
  document.addEventListener('keydown', onKey, true)
  document.addEventListener('pointerdown', onPointer, true)

  return {
    setAnchor(rect) {
      if (!rect || rect.width < 160 || rect.height < 120) { root.hidden = true; openPanel(false); return }
      root.hidden = false
      root.style.right = `${Math.max(8, window.innerWidth - rect.right + 16)}px`
      root.style.bottom = `${Math.max(8, window.innerHeight - rect.bottom + 16)}px`
    },
    setPrefs(next) { prefs = next; renderMenu() },
    setCaps(caps) { handoverAction.hidden = !caps.handover },
    setBusy(busy, label) {
      main.disabled = busy
      caret.disabled = busy
      if (busy) mainLabel.textContent = label ?? 'Rendering…'
      else renderMenu()
    },
    showStatus(kind, text, link, sticky) {
      clearTimeout(statusTimer)
      status.className = `status ${kind}`
      status.replaceChildren(el('div', { text }))
      if (link) status.append(el('a', { href: link.href, target: '_blank', rel: 'noopener', text: link.label }))
      status.hidden = false
      panel.hidden = true
      if (!sticky) statusTimer = setTimeout(() => { status.hidden = true }, kind === 'error' ? 12_000 : 6_000)
    },
    showPaste(reason) {
      pasteReason.textContent = reason
      pasteArea.value = ''
      paste.hidden = false
      panel.hidden = true
      status.hidden = true
      pasteArea.focus()
    },
    hidePaste() { paste.hidden = true },
    isOpen() { return !panel.hidden || !paste.hidden },
    destroy() {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
      host.remove()
    },
  }
}
