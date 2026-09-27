// A signed-in n8n session for the browser-driven scripts (e2e, store capture).
//
// With E2E_N8N_EMAIL / E2E_N8N_PASSWORD set, those sign in — and on a FRESH
// n8n they become the owner first, so a throwaway instance or a CI job needs
// no secret at all. Without them the n8n must be fresh: the owner is created
// with a password generated in memory. Nothing here is ever printed.
//
// Signs in the way n8n's editor does: the page's own browser-id, sent as a
// header. A missing or different one makes n8n clear the session cookie.

import { randomBytes } from 'node:crypto'

const env = process.env.E2E_N8N_EMAIL && process.env.E2E_N8N_PASSWORD
  ? { email: process.env.E2E_N8N_EMAIL, password: process.env.E2E_N8N_PASSWORD }
  : null
let owner = env

/** Signs `page` in to the n8n at `n8nUrl`, creating the owner on a fresh instance. */
export async function signIn(page, n8nUrl) {
  await page.goto(`${n8nUrl}/signin`, { waitUntil: 'domcontentloaded' })
  if (await isFresh(page)) {
    owner ??= { email: 'e2e@example.com', password: `${randomBytes(12).toString('base64url')}Aa1` }
    const status = await post(page, '/rest/owner/setup', { email: owner.email, password: owner.password, firstName: 'Pixtex', lastName: 'Check' })
    if (status !== 200) throw new Error(`n8n owner setup answered ${status}`)
    return // setting up the owner signs the browser in
  }
  if (!owner) {
    throw new Error('This n8n already has an owner: set E2E_N8N_EMAIL and E2E_N8N_PASSWORD, or point N8N_URL at a fresh n8n.')
  }
  // 1.x named the field `email`, 2.x `emailOrLdapLoginId`; each ignores the other
  const status = await post(page, '/rest/login', { email: owner.email, emailOrLdapLoginId: owner.email, password: owner.password })
  if (status !== 200) throw new Error(`n8n login answered ${status}`)
}

/** n8n's public settings say whether the owner still has to be created. */
async function isFresh(page) {
  return page.evaluate(async () => {
    const r = await fetch('/rest/settings', { credentials: 'same-origin' })
    const body = await r.json().catch(() => null)
    return body?.data?.userManagement?.showSetupOnFirstLoad === true
  })
}

async function post(page, path, body) {
  return page.evaluate(async ({ path, body }) => {
    let bid = localStorage.getItem('n8n-browserId')
    if (!bid) { bid = crypto.randomUUID(); localStorage.setItem('n8n-browserId', bid) }
    const r = await fetch(path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'browser-id': bid },
      body: JSON.stringify(body),
    })
    return r.status
  }, { path, body })
}
