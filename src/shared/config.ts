// Build-time constants — scripts/build.mjs injects them per flavour, so the
// store build can only ever talk to api.pixtex.dev and pixtex.dev.

declare const __PIXTEX_API__: string
declare const __PIXTEX_WEB__: string
declare const __FLAVOUR__: 'store' | 'dev' | 'e2e'

/** Where renders are requested. */
export const API_BASE: string = __PIXTEX_API__
/** Where "Open in Pixtex" hands a workflow over. */
export const WEB_BASE: string = __PIXTEX_WEB__
export const WEB_ORIGIN: string = new URL(__PIXTEX_WEB__).origin
export const FLAVOUR = __FLAVOUR__

/** The render endpoint the editor itself uses — keyless free tier, key = Pro. */
export const EXPORT_URL = `${API_BASE}/export`
/** Says what a key is (tier, quota) — open to any origin, no rate limit. */
export const KEY_INFO_URL = `${API_BASE}/v1/keys/me`
/** A static feature switch pixtex.dev serves — data, never code. */
export const CAPABILITIES_URL = `${WEB_BASE}/extension-capabilities.json`
