# OpenHiggsfield AI — Open-Source Alternative to Higgsfield AI

> **The free, open-source alternative to Higgsfield AI.** Generate images and
> videos with 38 models from one prompt bar — no closed ecosystem, no studio
> subscription.

## 🌐 Try it Online — No Install Required

**Hosted version:** [openhiggsfield.ai](https://openhiggsfield.ai)

Image and Video in one studio, in the browser — no Node.js, no setup. Add your
Higgsfield API key to start generating. The studio itself is free.

---

**Why OpenHiggsfield AI instead of Higgsfield AI?**

- **Free & open-source** — no studio subscription, no vendor lock-in
- **Self-hosted** — clone it, run it, change it
- **Your key** — generate with your own Higgsfield API key
- **38 models** — 8 image, 30 video, one catalog, one composer

---

Next.js 16 App Router on Vercel · React 19 · plain CSS · Zustand · pnpm

---

## Features

### Generate

- **One composer for Image and Video.** A single prompt bar drives both; the
  model you pick decides image or video. `⌘/Ctrl + Enter` submits.
- **38 models in the catalog** — 8 image, 30 video: Soul 2, Soul Cinema, Seedance
  2.5 (Edit / Extend), Seedance 2.0 (Fast / Mini), Kling 3 (Turbo / Std / Pro / 4K / Motion), Wan, Flux,
  Ideogram, Recraft, LTX, MiniMax, PixVerse, Grok, Qwen and more. Searchable
  picker.
- **Per-model settings.** Aspect ratio, resolution, duration, output format,
  audio, batch size, prompt enhancement — each model declares its own allow-list
  and the studio renders exactly that. No parallel hardcoded list.
- **Media inputs by role.** Start frame, end frame, references, video and audio,
  each with the per-role cap the model declares. Files upload to Higgsfield
  storage through a signed URL and become public URLs the generate request can
  carry. Inputs a model's schema would reject (a missing start frame, an end
  frame without a start, frames mixed with references on Seedance) are stopped
  in the composer and again on the server.
- **Asset picker.** Attach from your uploads library or from any finished run in
  history — two tabs over one library, filtered to the role's kind.
- **Batch.** Up to 4 results per press. Models with a native count setting use it;
  the rest are submitted once per result, each clearing its own tile.
- **Live run lifecycle.** Skeletons open in the grid on submit, the request is
  polled with backoff (2s growing to 10s, with jitter) until a terminal status
  (10-minute deadline), and each finished result blooms into place on its own
  clock.
- **Cancel.** A running tile carries Cancel, which asks the platform to cancel
  the request. Only queued runs can be canceled; once a run has started the
  tile says so and the run finishes on its own.
- **No accidental duplicates.** Generate holds while a press is being sent, and
  every request carries a submission id the server answers once. A submit that
  times out is reported as unknown and never retried automatically.

### Gallery

- **Four scopes** — Image, Video, Assets (every finished run) and Favorites —
  as an arrow-key-navigable tab rail.
- **Masonry grid** of real runs at their true aspect ratio, newest first, with a
  gradient placeholder while media loads.
- **Per-tile actions**: reuse, favorite, delete, select.
- **Reuse restores model, settings and prompt**, so the same run can be
  re-rendered, not just re-typed.
- **Viewer.** Full-size media with prompt (copy in one click), model, resolved
  settings, timestamp, download, favorite and Recreate.
- **Selection mode.** Click a tile's checkbox to enter; shift-click extends a
  range. Bulk download (sequential, with progress and a report of any files the
  CDN refused), bulk favorite/unfavorite, bulk delete. `Esc` exits.
- **Undo.** Deletion is reversible for 6 seconds via a bar with a draining
  hairline, in the strip the composer already reserves.
- **Empty states** that hand you a starter prompt instead of a blank grid.

### State and errors

- **History persists** in IndexedDB in this browser (60 records). Favorites are
  a deliberate keep and never age out of the cap. Result URLs belong to the
  generation platform, so old history can outlive its CDN lifetime and show gaps.
- **Failed, NSFW and canceled runs** are recorded as failed tiles carrying the
  reason and a retry that restores the prompt and model.
- **Your own API key.** **Connect API key** opens a dialog; paste the complete
  key copied from [open.higgsfield.ai](https://open.higgsfield.ai/api-keys),
  as-is. A server action stores it in an HTTP-only cookie; it is never returned
  to the page, put in browser storage, or logged. Once saved the top bar reads
  **API key saved** (saving does not check the key — the first run does), and
  **Manage API key** offers **Replace API key** and **Remove API key**. A
  missing or rejected key reopens the dialog with the reason.

---

## Architecture

Each generate is one object: `{ model, prompt, media, settings }`.

- **The UI builds that object** and hands it to a server action. The action
  resolves it against the catalog and maps it to the generation API's own
  fields (`image_urls`, `aspect_ratio`, …).
- **Server actions are the only caller.** The browser never talks to the
  generation API with the key. Submit is `POST /{model}`; status is
  `GET /requests/{id}/status`; cancel is `POST /requests/{id}/cancel`. Auth is
  `Authorization: Key <api-key>` with the complete copied key. Actions return
  their failures as values, so the studio can say what went wrong in a
  production build.
- **Request ownership** follows the key: every status and cancel call is made
  with the key of the visitor who submitted, and the API answers 404 for a
  request belonging to another account. There is no shared key, so there is no
  app-side tenant table to keep.
- **The catalog is the source of truth** (`src/generation/catalog/`). A new entry
  appears in the picker, brings its own settings rail and media roles, and needs
  no studio changes.
- **Five small Zustand stores** — shared image/video prompt, shared image/video
  media, `settings[modelId]`, and a tiny `active` store. No store per model.
- **Uploads**: a server action asks `POST /files/generate-upload-url` for a
  signed URL with the visitor's key; the browser then PUTs the file straight to
  that URL with the returned `upload_headers` and no credentials, and uses the
  returned `public_url` only after the PUT succeeds. Signed URLs are never
  logged. `blob:` URLs are preview-only.

---

## Getting started

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Open the studio, press **Connect API key**, and paste the key you copied from
[open.higgsfield.ai/api-keys](https://open.higgsfield.ai/api-keys) as-is.

### Environment

No variables are required. Optionally:

```bash
HF_API_BASE_URL=https://api.higgsfield.ai   # server only; this is the default
```

### Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm brand` | Rebuild the icons and OG card in `public/` |

---

## Model catalog and API verification

All 38 installed models stay in the picker (8 image, 30 video). Each model's
endpoint and request body were checked against its Input JSON Schema on
[docs.higgsfield.ai](https://docs.higgsfield.ai/docs/llms.txt): 33 models map
only to documented endpoints, and every body the studio can build for them
validates against the documented schema. Settings offer only documented values,
fields a schema does not take are no longer sent, and media combinations a
schema would reject are stopped before submit.

Five models call endpoints that the current documentation does not list. They
are kept as they were and are **unverified**:

| Model | Endpoint(s) |
| --- | --- |
| Seedance 2.0 Fast | `bytedance/seedance-2.0/fast/{text,image,reference}-to-video` |
| Seedance 2.0 Mini | `bytedance/seedance-2.0/mini/{text,image,reference}-to-video` |
| Flux 2 | `flux-2-pro` |
| Flux 3 | `blackforestlabs/flux-3/{text,image}-to-video` |
| DoP | `higgsfield-ai/dop/lite` |

Documentation describes availability, not what a given key can use: a model
unavailable to an account answers `404`, `423` or `503`, and the studio shows
that on the run's tile.

---

## Layout

```
src/
  app/          /  is the full-viewport studio and the only page
                base.css owns the document canvas
  generation/   generate requests, server actions, API mapping, catalog, stores
  openhiggsfield/
                the studio surface: composer, gallery, viewer, model picker,
                settings, asset picker, selection bar — and openhiggsfield.css
```

---

## Design principles

Dark studio ground, a single lime accent `#d1fe17`, Inter throughout. The chrome
stays neutral so the generated work is the only color on the surface.

1. **The tool disappears into the task** — expression never obscures state or
   affordance.
2. **Accent is state, not decoration** — selection, primary action, liveness only.
3. **Data is data** — settings, counts and durations read in tabular numerals.
   One typeface throughout; no monospace anywhere.
4. **Motion conveys state** — the generation lifecycle, the arrival of a run.
   Nothing loops decoratively.
5. **Every control ships all its states** — hover, focus, active, disabled,
   loading, error, empty.
6. **The catalog is the source of truth** — the studio renders what the model
   declares, never a parallel hardcoded list.

Built for people who work in long sessions, iterating on prompts, inputs and
settings.
