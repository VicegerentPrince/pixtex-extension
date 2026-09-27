# Privacy practices — Chrome Web Store dashboard

What to paste into the **Privacy practices** tab. Every permission in
`manifest.base.json` has a justification below, and nothing else does —
`test/unit/store.test.ts` fails the build when the two disagree, because a
permission added without one is a rejected review, and one left behind after
a permission is removed is a claim about code that no longer exists.

## Single purpose

> Pixtex for n8n exports the n8n workflow open in the user's editor as an image
> or PDF file (PNG, PDF, SVG, JPEG or WebP). Everything in the extension serves
> that one purpose: the Export button in the n8n editor, its menu of formats,
> looks and sizes, the optional Pixtex Pro key that removes the watermark, and
> "Open in Pixtex", which hands the same workflow to the pixtex.dev editor to be
> styled before it is exported.

## Permission justifications

### `storage`

> Keeps the user's export choices (format, look, size) and, only if the user
> enters one, their Pixtex Pro key, on their device in chrome.storage.local.
> Only the extension's service worker reads the key; the script that runs on
> n8n pages never sees it. When the user clicks "Open in Pixtex", the workflow
> waits in chrome.storage.session (memory only, never written to disk) until
> the pixtex.dev tab the extension opened collects it, once. A workflow not
> collected within 60 seconds is refused, and cleared the next time the
> extension's service worker starts.

### `activeTab`

> On a self-hosted n8n, which can live on any domain, the user clicks the
> toolbar button to start Pixtex on the tab in front of them. activeTab gives
> access to that one tab, only after that click, so the extension never needs
> access to every site.

### `scripting`

> Used with activeTab to check whether the current tab is an n8n editor and to
> start the extension's own bundled content script there after the user clicks
> the toolbar button. For a self-hosted n8n the user has chosen "Always on" for,
> it registers the same bundled script for that one site. No code from outside
> the package is ever injected.

### `offscreen`

> The export request runs in an offscreen document (reason: BLOBS). Rendering a
> large workflow can take longer than 30 seconds, longer than a Manifest V3
> service worker's request is allowed to run, and the finished file is turned
> into a blob URL there so chrome.downloads can save it.

### `downloads`

> Saves the file the user asked for (PNG, PDF, SVG, JPEG or WebP) to their
> Downloads folder, with its proper name, when they click Export.

### `https://*.app.n8n.cloud/*`

> Content script match. Shows the Export button in n8n Cloud editors, and only
> on n8n Cloud's own domain. The script reads the open workflow only when the
> user clicks Export, through the same n8n endpoint the editor itself uses, with
> the user's existing n8n session. It removes credential references, pinned
> execution data and owner details before sending the workflow to
> api.pixtex.dev to be rendered.

### `https://*/*`

> Optional host permission, never requested at install. When the user runs a
> self-hosted n8n and chooses "Always on" for it in the toolbar popup, Chrome
> asks them to grant that one origin (for example https://n8n.example.com), so
> the Export button appears there without a toolbar click each time. The user
> can turn it off again from the same popup.

### `http://*/*`

> Optional host permission, never requested at install. The same "Always on"
> choice for a self-hosted n8n served over plain http, which is common on a
> home server or an internal network (for example http://192.168.1.20:5678).
> Granted per origin, by the user, at runtime.

## Remote code

**No, I am not using remote code.** All code ships in the package. At run time
the extension fetches data only: the rendered file from api.pixtex.dev, and a
small JSON file from pixtex.dev that says which export options to offer.
Neither is ever executed.

## Data usage

Tick exactly these two:

- **Website content** — "The n8n workflow open in the editor (its nodes,
  connections, parameters and sticky notes), read only when the user clicks
  Export and sent to api.pixtex.dev to render the file they asked for.
  Credential references, pinned execution data and owner details are removed
  before it leaves the page. It is rendered in memory and not stored."
- **Authentication information** — "The user's optional Pixtex Pro key, which
  they paste in themselves. It is kept on their device and sent only to
  api.pixtex.dev, to authorise their own exports."

Leave every other category unticked: personally identifiable information,
health, financial and payment, personal communications, location, web history
and user activity. The extension has no analytics and no tracking.

Tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved
  use cases.
- I do not use or transfer user data for purposes that are unrelated to my
  item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for
  lending purposes.

**Privacy policy URL:** https://pixtex.dev/privacy — its "The Pixtex browser
extension" section must be live before the item is submitted, because the
reviewer reads it.
