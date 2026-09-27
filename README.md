# Pixtex for n8n

Export the n8n workflow you're editing as a crisp PNG or PDF — **rendered from
the workflow itself, not screenshotted**. One button, inside the n8n editor.

> **Status: in development.** Not yet on the Chrome Web Store. Watch this repo
> for the first release.

## What it does

- Adds an **Export** button to the n8n editor — n8n Cloud and self-hosted,
  n8n 1.x and 2.x.
- Renders the **whole** workflow no matter what fits on your screen: no UI
  chrome, no cropping, crisp at any scale.
- The same looks as the [pixtex.dev](https://pixtex.dev) editor, including the
  one-page **diagram poster**.
- **Open in Pixtex** hands the workflow to the full editor for styling.

## What it does with your workflow

Workflow JSON can contain secrets, so this is the part worth reading — and the
reason the source is public.

- It reads a workflow **only when you click**, through the same n8n endpoint
  your editor already uses, with your existing session.
- Before anything leaves the page it strips credential references, pinned
  execution data and owner/sharing details.
- The workflow travels to `api.pixtex.dev` **in the request body** to be
  rendered. It is never put in a URL, never logged and never stored — see the
  [Pixtex privacy policy](https://pixtex.dev/privacy).
- **Open in Pixtex** passes the workflow to pixtex.dev inside your browser, once,
  and never through a URL.
- An optional Pixtex Pro key is kept in the extension's local storage on your
  device, and sent only to `api.pixtex.dev`.
- The extension itself has no analytics and no tracking. Pixtex counts renders
  by which surface asked for them — a number, not who.

## Permissions

Requested as narrowly as the job allows, and explained here before release:

| Permission | Why |
|---|---|
| Access to `*.app.n8n.cloud` | Shows the Export button in n8n Cloud editors |
| `activeTab`, `scripting` | Works on a self-hosted n8n tab when you click the toolbar button |
| Optional site access, per site | "Always show on my n8n" — asked at runtime, for that one site |
| `offscreen` | Keeps a long render alive until the file is ready |
| `downloads` | Saves the file with its proper name |
| `storage` | Your preferences, and the optional Pro key |

## Develop

```bash
npm install
npm run typecheck && npm test      # unit tests: detection, the n8n REST rule, minimising, messaging
npm run build:dev                  # dist-dev/ — against a local Pixtex (web :3000, api :3001)
npm run build                      # dist/ — the store build
npm run check:bundle               # the store build keeps the promises above
```

Load `dist-dev/` from `chrome://extensions` (Developer mode → Load unpacked).

`npm run e2e` drives the real extension in Chromium against a local n8n and a
local Pixtex: PNG and PDF exports, an unsaved workflow via paste, **staying
logged in to n8n afterwards**, Open in Pixtex (and a replayed handoff being
refused), and a render slower than Chrome's 30-second service-worker limit. It
expects n8n on `http://localhost:5678` — a fresh one needs nothing (the owner
is created with a password that is never printed), an existing one its owner in
`E2E_N8N_EMAIL` / `E2E_N8N_PASSWORD` — the Pixtex web app on `:3000`, and the API on `:3001` with
`EXTENSION_ORIGINS=chrome-extension://pimgfpeogbapfnnebapamdfajflbinpj` — the
dev build's pinned id.

Releases are built by CI from a `vX.Y.Z` tag, with a provenance attestation on
the zip — never from a laptop.

The Chrome Web Store listing lives in [`store/`](store/listing.md): the text to
paste, the permission justifications (a test keeps them in step with the
manifest), and the images. The images are real captures, regenerated rather
than edited — `node scripts/store/capture.mjs` against the same local setup as
`npm run e2e`, then `node scripts/store/compose.mjs`.

## License

The code is MIT — see [LICENSE](LICENSE). The Pixtex name, mark and wordmark
(the files in `icons/`) and the store images in `store/` are the project's
brand and are not licensed for reuse.

Built by [Muhammad Muneeb](https://github.com/VicegerentPrince) ·
[pixtex.dev](https://pixtex.dev)
