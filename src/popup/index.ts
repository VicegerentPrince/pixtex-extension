// The toolbar popup: whether this tab is n8n, switching Pixtex on for a
// self-hosted instance, and the optional Pro key.
//
// Everything that is stored goes through the service worker; the popup keeps
// nothing itself.

const siteBox = document.getElementById('site') as HTMLElement
const proStatus = document.getElementById('pro-status') as HTMLElement
const proForm = document.getElementById('pro-form') as HTMLFormElement
const proInput = document.getElementById('pro-input') as HTMLInputElement
const proClear = document.getElementById('pro-clear') as HTMLButtonElement

const send = <T>(message: Record<string, unknown>): Promise<T> =>
  chrome.runtime.sendMessage({ v: 1, ...message }) as Promise<T>

const STATIC = new Set((chrome.runtime.getManifest().content_scripts ?? []).flatMap((c) => c.matches ?? []))

function matchesStatic(url: URL): boolean {
  for (const pattern of STATIC) {
    const m = /^(\*|https?):\/\/(\*\.)?([^/]+)\//.exec(pattern)
    if (!m) continue
    const [, scheme, wildcard, host] = m
    if (scheme !== '*' && `${scheme}:` !== url.protocol) continue
    if (host === url.hostname || (wildcard && url.hostname.endsWith(`.${host}`))) return true
  }
  return false
}

function text(node: HTMLElement, value: string, cls?: string): HTMLElement {
  const p = document.createElement('p')
  p.textContent = value
  if (cls) p.className = cls
  node.append(p)
  return p
}

function button(label: string, cls: string | null, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  if (cls) b.className = cls
  b.addEventListener('click', onClick)
  return b
}

/** Runs in the tab (activeTab): the same markers n8n/detect.ts reads, self-contained. */
function probeN8n(): boolean {
  if (!document.getElementById('app')) return false
  if (document.querySelector('meta[name="n8n:config:rest-endpoint"]')) return true
  return [...document.querySelectorAll('script:not([src])')].some((s) => /window\.REST_ENDPOINT\s*=/.test(s.textContent ?? ''))
}

async function renderSite(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  siteBox.replaceChildren()
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    text(siteBox, 'Open an n8n workflow, then click Export in the editor’s corner.', 'muted')
    return
  }
  const url = new URL(tab.url)
  let isN8n = false
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: probeN8n })
    isN8n = res?.result === true
  } catch {
    isN8n = false
  }
  if (!isN8n) {
    text(siteBox, 'This tab isn’t an n8n editor. Open a workflow in n8n and the Export button appears in the canvas corner.', 'muted')
    return
  }
  if (matchesStatic(url)) {
    text(siteBox, 'On for n8n Cloud — use the Export button in the canvas corner.', 'ok')
    return
  }

  const origin = url.origin
  const enabled = (await send<string[]>({ type: 'site:list' }).catch((): string[] => [])).includes(origin)
  if (enabled) {
    text(siteBox, `Always on for ${url.host}.`, 'ok')
    siteBox.append(button('Turn off for this site', 'link', async () => {
      await send({ type: 'site:disable', origin })
      await renderSite()
    }))
    return
  }

  text(siteBox, `${url.host} is a self-hosted n8n. Pixtex only runs where you switch it on.`, 'muted')
  const row = document.createElement('div')
  row.className = 'row'
  row.append(
    button(`Always on for ${url.host}`, 'primary', async () => {
      // Must be requested straight from the click — Chrome refuses otherwise.
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
      if (!granted) return
      await send({ type: 'site:enable', origin })
      await send({ type: 'tab:inject', tabId: tab.id })
      await renderSite()
    }),
    button('Just this time', null, async () => {
      const res = await send<{ ok: boolean }>({ type: 'tab:inject', tabId: tab.id })
      siteBox.replaceChildren()
      text(siteBox, res.ok ? 'Pixtex is on for this page — use the Export button in the canvas corner.' : 'Couldn’t start Pixtex on this page. Reload it and try again.', res.ok ? 'ok' : 'bad')
    }),
  )
  siteBox.append(row)
}

interface KeyInfo { tier: string; usage?: { renders: number }; limits?: { rendersPerMonth: number } }
type ProState =
  | { state: 'none' }
  | { state: 'pro'; info: KeyInfo; masked?: string }
  | { state: 'free'; info: KeyInfo; masked?: string }
  | { state: 'invalid' | 'revoked' | 'unreachable'; message: string; masked?: string }

function usedLine(info: KeyInfo): string {
  return info.usage && info.limits ? ` · ${info.usage.renders} / ${info.limits.rendersPerMonth} renders this month` : ''
}

function showPro(res: ProState): void {
  proClear.hidden = res.state === 'none'
  switch (res.state) {
    case 'none':
      proStatus.textContent = 'Optional — free renders carry a small watermark.'
      proStatus.className = 'muted'
      break
    case 'pro':
      proStatus.textContent = `Pro — exports come out without the watermark${usedLine(res.info)}.`
      proStatus.className = 'ok'
      break
    case 'free':
      proStatus.textContent = `A free key — renders still carry the watermark${usedLine(res.info)}.`
      proStatus.className = 'muted'
      break
    default:
      proStatus.textContent = res.message
      proStatus.className = 'bad'
  }
}

proForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const key = proInput.value.trim()
  if (!key) return
  proStatus.textContent = 'Checking…'
  proStatus.className = 'muted'
  const res = await send<ProState>({ type: 'pro:set', key })
  if (res.state === 'pro' || res.state === 'free') proInput.value = ''
  showPro(res)
})

proClear.addEventListener('click', async () => {
  showPro(await send<ProState>({ type: 'pro:clear' }))
})

void renderSite()
void send<ProState>({ type: 'pro:status' }).then(showPro).catch(() => {})
