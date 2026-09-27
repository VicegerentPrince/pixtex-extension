# Chrome Web Store listing

Everything the Developer Dashboard asks for, ready to paste. The **Privacy
practices** tab has its own file, [`privacy-practices.md`](privacy-practices.md),
and the description is [`description.txt`](description.txt), verbatim — the
store shows plain text, so it has no markdown in it.

## Store listing tab

| Field | Value |
|---|---|
| Name | taken from the manifest: **Pixtex for n8n — Export workflow images** |
| Summary | taken from the manifest's `description` (at most 132 characters) |
| Description | [`description.txt`](description.txt) |
| Category | Workflow & Planning |
| Language | English |
| Store icon | [`icons/128.png`](../icons/128.png) |
| Screenshots | [`screenshots/`](screenshots/), in file-name order — 1280×800, no alpha |
| Small promo tile | [`promo/small-440x280.png`](promo/small-440x280.png) |
| Marquee promo tile | [`promo/marquee-1400x560.png`](promo/marquee-1400x560.png) |
| Official URL | https://pixtex.dev (offered only once pixtex.dev is verified in Google Search Console for the publishing account) |
| Homepage URL | https://pixtex.dev |
| Support URL | https://github.com/VicegerentPrince/pixtex-extension/issues |
| Mature content | No |

## Distribution tab

Visibility **Public**, all regions. The item is free; Pixtex Pro is sold on
pixtex.dev, not through the store.

## Test instructions (for the reviewer)

> The extension works inside an n8n workflow editor. Two ways to get one:
>
> 1. n8n Cloud: start a free trial at https://n8n.io, open any workflow (the
>    trial offers templates), and the Export button appears in the bottom-right
>    corner of the canvas.
> 2. Self-hosted, no account needed: with Node.js 24 installed, run
>    `npx n8n@latest`, open http://localhost:5678, create the owner account and a
>    workflow, then click the Pixtex toolbar button and choose "Just this time".
>
> Click Export: a PNG of the whole workflow is downloaded. The arrow beside it
> chooses format, look and size; "Open in Pixtex" opens the workflow in the
> pixtex.dev editor. No Pixtex account or key is needed — free exports carry a
> small watermark.

## Submitting, in order

The dashboard assigns the item's ID when the zip is first uploaded, and the ID
is what pixtex.dev and api.pixtex.dev allow in — so the upload comes first and
the public release comes last.

1. **pixtex.dev/privacy has its extension section live.** The reviewer reads
   it; it ships with the monorepo branch that adds `/open`.
2. **Tag the release.** `vX.Y.Z` matching `package.json` → the release workflow
   builds the zip, attests it and attaches it to a GitHub release. Upload that
   file, never a local build.
3. **Create the item** by uploading the zip. Note its **item ID** and, under
   Package, its **public key**.
4. **Fill in** the Store listing, Privacy practices and Distribution tabs from
   these files.
5. **Allow the ID in**, then deploy:
   - `STORE_IDS` in the monorepo's `apps/web/src/lib/extension.ts` — without it,
     Open in Pixtex has no extension to claim from;
   - `EXTENSION_ORIGINS=chrome-extension://<id>`, written literally in the api
     service's `environment:` block of `docker-compose.yml` — without it every
     export from the store build is refused by CORS.
6. **Submit for review with "Publish automatically" unticked**, so an approval
   stages the item instead of releasing it.
7. **QA the store build before it is public**: unzip the release zip, add the
   dashboard's public key as `"key"` in its `manifest.json`, and load it
   unpacked — it now runs under the store ID, against production.
8. **Publish.** Then set `CHROME_STORE_URL` in `apps/web/src/lib/extension.ts`,
   which turns on the links to the listing across pixtex.dev.

Edge Add-ons takes the same zip later; its ID joins both allow-lists the same
way.

## Regenerating the images

`screenshots/` and `promo/` are real captures of this extension on a local n8n
and a local Pixtex, composed into frames in pixtex.dev's own type and colours:

```bash
node scripts/store/capture.mjs   # needs what `npm run e2e` needs; see the script's header
node scripts/store/compose.mjs   # store/raw/ → store/screenshots/ + store/promo/
```

They are regenerated when the widget's look changes, never edited by hand.
