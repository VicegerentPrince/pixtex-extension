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

## License

MIT — see [LICENSE](LICENSE).

Built by [Muhammad Muneeb](https://github.com/VicegerentPrince) ·
[pixtex.dev](https://pixtex.dev)
