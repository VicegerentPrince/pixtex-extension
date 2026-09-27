// The service worker: routes messages, owns every stored value, and drives
// renders through the offscreen document and the downloads API.
//
// It is the only context that ever holds the Pro key. Content scripts ask it
// for preferences and it answers with preferences — never with the key.

import { CAPABILITIES_URL, FLAVOUR, KEY_INFO_URL, WEB_BASE, WEB_ORIGIN } from '../shared/config'
import { describeFailure } from '../shared/api-errors'
import { filenameFromDisposition, slugFilename } from '../shared/filename'
import { NO_CAPABILITIES, parseCapabilities, type Capabilities } from '../shared/formats'
import {
  DEFAULT_PREFS, isClaim, isExportRequest, isHandoffRequest, isMsg, sanitizePrefs,
  type ExportDoneMsg, type ExportFailedMsg, type ExportProgressMsg, type ExportRequestMsg,
  type OffscreenRenderMsg, type OffscreenResultMsg, type OffscreenRevokeMsg, type PixtexPingMsg,
  type PrefsSetMsg, type Prefs,
} from '../shared/protocol'
import { lookPatch } from '../vendor/look-presets'
import type { ApiKeyInfo, ExportFormat } from '../vendor/pixtex-types'
import { HANDOFF_PREFIX, MAX_HANDOFF_BYTES, judgeClaim, newNonce, staleHandoffKeys, type HandoffRecord } from './handoff'

const VERSION = chrome.runtime.getManifest().version
const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html')
const POPUP_URL = chrome.runtime.getURL('popup.html')

const PREFS_KEY = 'pixtex_prefs_v1'
const PRO_KEY = 'pixtex_pro_key_v1'
const PENDING_PREFIX = 'pending:'
const KEY_PATTERN = /^pxt_[A-Za-z0-9_-]{32}$/

/** A local dev server's first compile of /open can take a while; production cannot. */
const HANDOFF_TTL_MS = FLAVOUR === 'store' ? 60_000 : 180_000

// Keep what content scripts can read to nothing: they talk to this worker.
// Wrapped because older Chrome builds only allow it on some storage areas.
void chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {})

// ── storage helpers ────────────────────────────────────────────────────────────

async function getPrefs(): Promise<Prefs> {
  const stored = await chrome.storage.local.get(PREFS_KEY)
  return sanitizePrefs(stored[PREFS_KEY])
}

async function getProKey(): Promise<string | null> {
  const stored = await chrome.storage.local.get(PRO_KEY)
  const key = stored[PRO_KEY]
  return typeof key === 'string' && KEY_PATTERN.test(key) ? key : null
}

// ── messages ───────────────────────────────────────────────────────────────────

type Sender = chrome.runtime.MessageSender
const fromPopup = (s: Sender) => !s.tab && s.url?.startsWith(POPUP_URL) === true
const fromOffscreen = (s: Sender) => !s.tab && s.url === OFFSCREEN_URL

chrome.runtime.onMessage.addListener((message: unknown, sender: Sender, sendResponse: (r?: unknown) => void) => {
  // content script (an n8n tab)
  if (sender.tab?.id !== undefined && sender.id === chrome.runtime.id) {
    const tabId = sender.tab.id
    if (isExportRequest(message)) { void startExport(message, tabId); return false }
    if (isHandoffRequest(message)) { void startHandoff(message, sender.tab).then(sendResponse); return true }
    if (isMsg(message, 'prefs:get')) { void getPrefs().then(sendResponse); return true }
    if (isMsg<PrefsSetMsg>(message, 'prefs:set')) { void savePrefs(message.prefs).then(sendResponse); return true }
    if (isMsg(message, 'capabilities:get')) { void getCapabilities().then(sendResponse); return true }
    return false
  }
  // offscreen document
  if (fromOffscreen(sender) && isMsg<OffscreenResultMsg>(message, 'offscreen:result')) {
    void finishExport(message)
    return false
  }
  // popup
  if (fromPopup(sender)) {
    void handlePopup(message).then(sendResponse)
    return true
  }
  return false
})

async function savePrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const next = sanitizePrefs({ ...(await getPrefs()), ...patch })
  await chrome.storage.local.set({ [PREFS_KEY]: next })
  return next
}

// ── export ────────────────────────────────────────────────────────────────────

let creatingOffscreen: Promise<void> | null = null

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [OFFSCREEN_URL],
  })
  if (existing.length) return
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.BLOBS],
      justification: 'Holds a rendered workflow image as a blob until the downloads API saves it, and keeps a long render request alive.',
    })
    .finally(() => { creatingOffscreen = null })
  await creatingOffscreen
}

async function notifyTab(tabId: number, msg: ExportProgressMsg | ExportDoneMsg | ExportFailedMsg): Promise<void> {
  await chrome.tabs.sendMessage(tabId, msg).catch(() => {
    /* the tab navigated away — nothing is waiting for the answer any more */
  })
}

interface Pending { tabId: number; format: ExportFormat; name?: string }

async function startExport(msg: ExportRequestMsg, tabId: number): Promise<void> {
  const key = await getProKey()
  const body = {
    workflowJson: msg.workflow,
    // A patch, not full options: the API's own defaults fill everything else,
    // so this build never disagrees with the server about what a default is.
    options: {
      ...lookPatch(msg.look),
      format: msg.format,
      scale: msg.scale,
      cardGeometry: msg.geometry,
      // Asking costs nothing — the server decides from the key whether the
      // watermark may go, and forces it on for everyone else.
      ...(key ? { showWatermark: false } : {}),
    },
    style: msg.style,
  }
  const pending: Pending = { tabId, format: msg.format, name: msg.workflow.name }
  await chrome.storage.session.set({ [PENDING_PREFIX + msg.reqId]: pending })
  await notifyTab(tabId, { v: 1, type: 'export:progress', reqId: msg.reqId })
  try {
    await ensureOffscreen()
    const render: OffscreenRenderMsg = {
      v: 1, type: 'offscreen:render', target: 'offscreen',
      reqId: msg.reqId, tabId, body, auth: key ?? undefined, clientVersion: VERSION,
    }
    await chrome.runtime.sendMessage(render)
  } catch {
    await chrome.storage.session.remove(PENDING_PREFIX + msg.reqId)
    await notifyTab(tabId, { v: 1, type: 'export:failed', reqId: msg.reqId, code: 'server', message: 'Couldn’t start the render. Reload the n8n tab and try again.' })
  }
}

async function finishExport(result: OffscreenResultMsg): Promise<void> {
  const pendingKey = PENDING_PREFIX + result.reqId
  const stored = (await chrome.storage.session.get(pendingKey))[pendingKey] as Pending | undefined
  await chrome.storage.session.remove(pendingKey)
  const tabId = stored?.tabId ?? result.tabId

  if (!result.ok || !result.blobUrl) {
    const failure = describeFailure(result)
    await notifyTab(tabId, { v: 1, type: 'export:failed', reqId: result.reqId, ...failure })
    return
  }

  const format = stored?.format ?? 'png'
  const filename = filenameFromDisposition(result.contentDisposition) ?? slugFilename(format, stored?.name)
  try {
    const downloadId = await chrome.downloads.download({ url: result.blobUrl, filename, conflictAction: 'uniquify', saveAs: false })
    revokeWhenDone(downloadId, result.blobUrl)
    await notifyTab(tabId, {
      v: 1, type: 'export:done', reqId: result.reqId, filename,
      tier: result.tier === 'pro' ? 'pro' : 'free',
      scale: Number(result.scale) || 0,
    })
  } catch {
    await notifyTab(tabId, { v: 1, type: 'export:failed', reqId: result.reqId, code: 'download', message: 'The image rendered but couldn’t be saved. Check your browser’s download settings.' })
  }
}

function revokeWhenDone(downloadId: number, blobUrl: string): void {
  const listener = (delta: chrome.downloads.DownloadDelta) => {
    if (delta.id !== downloadId) return
    const state = delta.state?.current
    if (state === 'complete' || state === 'interrupted') {
      chrome.downloads.onChanged.removeListener(listener)
      const revoke: OffscreenRevokeMsg = { v: 1, type: 'offscreen:revoke', target: 'offscreen', blobUrl }
      void chrome.runtime.sendMessage(revoke).catch(() => {})
    }
  }
  chrome.downloads.onChanged.addListener(listener)
}

// ── Open in Pixtex ──────────────────────────────────────────────────────────────

/**
 * Clears handoffs nobody collected. Runs whenever the worker starts and with
 * every new handoff — not on a timer, which would not survive the worker being
 * put to sleep, and not on tabs.onRemoved, which would wake the worker every
 * time any tab in the browser closes.
 */
async function sweepHandoffs(): Promise<void> {
  const stale = staleHandoffKeys(await chrome.storage.session.get(null), Date.now(), HANDOFF_TTL_MS)
  if (stale.length > 0) await chrome.storage.session.remove(stale)
}
void sweepHandoffs().catch(() => {})

async function startHandoff(
  msg: { workflow: HandoffRecord['workflow']; style?: HandoffRecord['style']; intent?: HandoffRecord['intent'] },
  opener: chrome.tabs.Tab,
): Promise<{ ok: boolean; reason?: 'too-large' | 'failed' }> {
  await sweepHandoffs().catch(() => {})
  const record: HandoffRecord = { workflow: msg.workflow, style: msg.style, intent: msg.intent, createdAt: Date.now(), tabId: -1 }
  if (JSON.stringify(record).length > MAX_HANDOFF_BYTES) return { ok: false, reason: 'too-large' }
  const nonce = newNonce()
  const key = HANDOFF_PREFIX + nonce
  try {
    await chrome.storage.session.set({ [key]: record })
    const tab = await chrome.tabs.create({ url: `${WEB_BASE}/open#n=${nonce}`, openerTabId: opener.id, index: (opener.index ?? 0) + 1 })
    if (tab.id === undefined) throw new Error('no tab id')
    await chrome.storage.session.set({ [key]: { ...record, tabId: tab.id } })
    return { ok: true }
  } catch {
    await chrome.storage.session.remove(key)
    return { ok: false, reason: 'failed' }
  }
}

chrome.runtime.onMessageExternal.addListener((message: unknown, sender: Sender, sendResponse: (r?: unknown) => void) => {
  if (sender.origin !== WEB_ORIGIN) { sendResponse({ ok: false, code: 'wrong-origin' }); return false }
  if (isMsg<PixtexPingMsg>(message, 'pixtex:ping')) { sendResponse({ ok: true, version: VERSION }); return false }
  if (isClaim(message)) { void claim(message.nonce, sender).then(sendResponse); return true }
  sendResponse({ ok: false, code: 'invalid' })
  return false
})

async function claim(nonce: string, sender: Sender): Promise<unknown> {
  const key = HANDOFF_PREFIX + nonce
  // tabs.create returns before the page can load, so the tab id is normally
  // recorded long before a claim arrives; a short wait covers the rare race.
  let record: HandoffRecord | undefined
  for (let attempt = 0; attempt < 5; attempt++) {
    record = (await chrome.storage.session.get(key))[key] as HandoffRecord | undefined
    if (!record || record.tabId >= 0) break
    await new Promise((r) => setTimeout(r, 200))
  }
  const verdict = judgeClaim({
    record, senderOrigin: sender.origin, senderTabId: sender.tab?.id,
    webOrigin: WEB_ORIGIN, now: Date.now(), ttlMs: HANDOFF_TTL_MS,
  })
  if (verdict !== 'accept') {
    // An expired or refused record is spent either way — single use.
    if (record) await chrome.storage.session.remove(key)
    return verdict
  }
  await chrome.storage.session.remove(key)
  return { ok: true, v: 1, workflow: record!.workflow, style: record!.style, intent: record!.intent }
}

// ── capabilities ──────────────────────────────────────────────────────────────

const CAPS_KEY = 'caps'
const CAPS_TTL_MS = 6 * 60 * 60 * 1000

async function getCapabilities(): Promise<Capabilities> {
  const cached = (await chrome.storage.session.get(CAPS_KEY))[CAPS_KEY] as { at: number; caps: Capabilities } | undefined
  if (cached && Date.now() - cached.at < CAPS_TTL_MS) return cached.caps
  let caps = NO_CAPABILITIES
  try {
    const res = await fetch(CAPABILITIES_URL, { signal: AbortSignal.timeout(5000), cache: 'no-cache' })
    if (res.ok) caps = parseCapabilities(await res.json())
  } catch {
    /* unreachable means nothing extra, and is worth asking again later */
    return NO_CAPABILITIES
  }
  await chrome.storage.session.set({ [CAPS_KEY]: { at: Date.now(), caps } })
  return caps
}

// ── self-hosted sites ────────────────────────────────────────────────────────────

const STATIC_MATCHES = new Set((chrome.runtime.getManifest().content_scripts ?? []).flatMap((c) => c.matches ?? []))
const siteScriptId = (origin: string) => `site:${origin}`
const originPattern = (origin: string) => `${origin}/*`

async function enableSite(origin: string): Promise<boolean> {
  const pattern = originPattern(origin)
  if (!(await chrome.permissions.contains({ origins: [pattern] }))) return false
  const id = siteScriptId(origin)
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] })
  if (!existing.length) {
    await chrome.scripting.registerContentScripts([{ id, matches: [pattern], js: ['content.js'], runAt: 'document_idle', persistAcrossSessions: true }])
  }
  return true
}

async function disableSite(origin: string): Promise<void> {
  await chrome.scripting.unregisterContentScripts({ ids: [siteScriptId(origin)] }).catch(() => {})
  await chrome.permissions.remove({ origins: [originPattern(origin)] }).catch(() => false)
}

async function enabledSites(): Promise<string[]> {
  const scripts = await chrome.scripting.getRegisteredContentScripts()
  return scripts.filter((s) => s.id.startsWith('site:')).map((s) => s.id.slice('site:'.length))
}

/** Scripts and permissions agree after every start — a revoked site loses its script. */
async function reconcileSites(): Promise<void> {
  const granted = new Set(((await chrome.permissions.getAll()).origins ?? []).filter((p) => !STATIC_MATCHES.has(p)))
  for (const origin of await enabledSites()) {
    if (!granted.has(originPattern(origin))) await chrome.scripting.unregisterContentScripts({ ids: [siteScriptId(origin)] }).catch(() => {})
  }
  for (const pattern of granted) {
    const origin = pattern.replace(/\/\*$/, '')
    if (/^https?:\/\/[^*]+$/.test(origin)) await enableSite(origin).catch(() => false)
  }
}

// The popup asks for a site from the user's click, but Chrome's permission
// prompt can close the popup before its code resumes — so enabling happens
// here, on the grant itself, and any tab already open on that site gets the
// button straight away (the content script ignores a second injection).
chrome.permissions.onAdded.addListener(async (added) => {
  for (const pattern of added.origins ?? []) {
    if (STATIC_MATCHES.has(pattern)) continue
    const origin = pattern.replace(/\/\*$/, '')
    if (!/^https?:\/\/[^*]+$/.test(origin)) continue
    if (!(await enableSite(origin).catch(() => false))) continue
    const tabs = await chrome.tabs.query({ url: pattern }).catch(() => [] as chrome.tabs.Tab[])
    for (const t of tabs) {
      if (t.id !== undefined) await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }).catch(() => {})
    }
  }
})

chrome.permissions.onRemoved.addListener((removed) => {
  for (const pattern of removed.origins ?? []) {
    const origin = pattern.replace(/\/\*$/, '')
    void chrome.scripting.unregisterContentScripts({ ids: [siteScriptId(origin)] }).catch(() => {})
  }
})
chrome.runtime.onStartup.addListener(() => { void reconcileSites() })
chrome.runtime.onInstalled.addListener(() => { void reconcileSites() })

// ── popup requests ──────────────────────────────────────────────────────────────

type ProCheck =
  | { state: 'none' }
  | { state: 'pro' | 'free'; info: ApiKeyInfo }
  | { state: 'invalid' | 'revoked' | 'unreachable'; message: string }

async function checkKey(key: string): Promise<ProCheck> {
  if (!KEY_PATTERN.test(key)) return { state: 'invalid', message: 'That doesn’t look like a Pixtex key — they start with pxt_ and are 36 characters.' }
  try {
    const res = await fetch(KEY_INFO_URL, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) })
    if (res.status === 401) return { state: 'invalid', message: 'Pixtex doesn’t recognise that key. Check for a missing character.' }
    if (res.status === 403) return { state: 'revoked', message: 'That key has been revoked. If you re-issued it, use the newest one.' }
    if (!res.ok) return { state: 'unreachable', message: 'Couldn’t check the key right now. Try again in a moment.' }
    const info = (await res.json()) as ApiKeyInfo
    return { state: info.tier === 'pro' ? 'pro' : 'free', info }
  } catch {
    return { state: 'unreachable', message: 'Couldn’t reach Pixtex to check the key. Try again in a moment.' }
  }
}

async function handlePopup(message: unknown): Promise<unknown> {
  if (typeof message !== 'object' || message === null) return null
  const m = message as { v?: number; type?: string; key?: string; origin?: string; tabId?: number; prefs?: Partial<Prefs> }
  if (m.v !== 1) return null
  switch (m.type) {
    case 'prefs:get':
      return getPrefs()
    case 'prefs:set':
      return savePrefs(m.prefs ?? {})
    case 'pro:status': {
      const key = await getProKey()
      return key ? { ...(await checkKey(key)), masked: `${key.slice(0, 8)}…${key.slice(-4)}` } : { state: 'none' }
    }
    case 'pro:set': {
      const key = (m.key ?? '').trim()
      const verdict = await checkKey(key)
      if (verdict.state === 'pro' || verdict.state === 'free') await chrome.storage.local.set({ [PRO_KEY]: key })
      return verdict
    }
    case 'pro:clear':
      await chrome.storage.local.remove(PRO_KEY)
      return { state: 'none' }
    case 'site:enable':
      return typeof m.origin === 'string' ? { ok: await enableSite(m.origin) } : { ok: false }
    case 'site:disable':
      if (typeof m.origin === 'string') await disableSite(m.origin)
      return { ok: true }
    case 'site:list':
      return enabledSites()
    case 'tab:inject':
      if (typeof m.tabId !== 'number') return { ok: false }
      try {
        await chrome.scripting.executeScript({ target: { tabId: m.tabId }, files: ['content.js'] })
        return { ok: true }
      } catch {
        return { ok: false }
      }
    default:
      return null
  }
}

// First run: settle the defaults so every surface reads the same thing.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') await chrome.storage.local.set({ [PREFS_KEY]: DEFAULT_PREFS })
})
