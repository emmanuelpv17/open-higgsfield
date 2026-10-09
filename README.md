# OpenHiggsfield AI — Open-Source Alternative to Higgsfield AI

> **The free, open-source alternative to Higgsfield AI.** Generate images and
> videos with 53 models from one prompt bar — no closed ecosystem, no studio
> subscription.

## 🌐 Try it Online — No Install Required

**Hosted version:** [openhiggsfield.ai](https://openhiggsfield.ai)

Image and Video in one studio, in the browser — no Node.js, no setup. Add your
platform key (`id:secret`) to start generating. The studio itself is free.

---

**Why OpenHiggsfield AI instead of Higgsfield AI?**

- **Free & open-source** — no studio subscription, no vendor lock-in
- **Self-hosted** — clone it, run it, change it
- **Your key** — generate with your own platform key
- **53 models** — 14 image, 39 video, one catalog, one composer

---

Next.js 16 App Router on Vercel · React 19 · plain CSS · Zustand · pnpm

---

## Features

### Generate

- **One composer for Image and Video.** A single prompt bar drives both; the
  model you pick decides image or video. `⌘/Ctrl + Enter` submits.
- **53 models in the catalog** — 14 image, 39 video: Soul 2 (with image-to-image), Soul Cinema, Soul Standard, Soul ID characters, AI Influencer, Marketing Studio (2.0 / Flare / Sunburst, with presets), Cinema Studio 4.0, Genjutsu (Motion Transfer / Object Swap / Restyle), Seedance
  2.5 (Edit / Extend), Seedance 2.0 (Fast / Mini), Kling 3 (Turbo / Std / Pro / 4K / Motion), Kling O3 / O1 (+ Edit), Kling 2.5, Wan, Flux,
  Happy Horse, Ideogram, Recraft, LTX, MiniMax, Hailuo, PixVerse, Grok, Qwen and more. Searchable
  picker.
- **Per-model settings.** Aspect ratio, resolution, duration, output format,
  audio, batch size, prompt enhancement — each model declares its own allow-list
  and the studio renders exactly that. No parallel hardcoded list.
- **Media inputs by role.** Start frame, end frame, references, video and audio,
  each with the per-role cap the model declares. Files upload to Vercel Blob and
  become public URLs the generate request can carry.
- **Asset picker.** Attach from your uploads library or from any finished run in
  history — two tabs over one library, filtered to the role's kind.
- **Batch.** Up to 4 results per press. Models with a native count setting use it;
  the rest are submitted once per result, each clearing its own tile.
- **Live run lifecycle.** Skeletons open in the grid on submit, the request is
  polled every 4s until a terminal status (10-minute deadline), and each finished
  result blooms into place on its own clock.

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
- **Your own platform key.** Entered in a modal, stored by a server action in an
  httpOnly cookie. A missing key opens the modal — it never fails silently. The
  topbar lamp states whether a key is held and whether a run is in flight.

---

## Use it from Claude (MCP connector)

The deployment is also a remote MCP server, so Claude can list models,
generate and check results from a chat. Tools: `list_models`, `list_options`,
`generate`, `check_generation`, `cancel_generation`. There are two endpoints:

### `/api/mcp` — each person brings their own key

Every request must carry the header `X-Higgsfield-Key: <id>:<secret>` (the
full Higgsfield API key from open.higgsfield.ai → API keys). Only that key is
used; the server's `OPEN_HIGGSFIELD_MCP_API_KEY` is never a fallback. The key
is not stored, and logs show it only masked (first four characters of the id).
A missing or malformed header gets a 400 with instructions in Spanish.

- **claude.ai**: Settings → Connectors → Add custom connector, URL
  `https://<your-deployment>/api/mcp`, then under **Advanced settings** add
  the header `X-Higgsfield-Key` with your key. At the time of writing the
  claude.ai form may offer only OAuth Client ID/Secret and no header field; if
  so, use one of the options below or the secret-path endpoint.
- **Claude Code**:
  ```bash
  claude mcp add --transport http higgsfield https://<your-deployment>/api/mcp \
    --header "X-Higgsfield-Key: <id>:<secret>"
  ```
- **Claude Desktop** (config file, via `mcp-remote`):
  ```json
  {
    "mcpServers": {
      "higgsfield": {
        "command": "npx",
        "args": ["mcp-remote", "https://<your-deployment>/api/mcp",
                 "--header", "X-Higgsfield-Key:${HF_KEY}"],
        "env": { "HF_KEY": "<id>:<secret>" }
      }
    }
  }
  ```

### `/api/mcp/<secret>` — the deployment owner's key

Uses the server's own key and needs no header, so it works with the plain
claude.ai connector form. It stays off (404) until both variables are set:

- `OPEN_HIGGSFIELD_MCP_API_KEY` — the Higgsfield key as `id:secret`
- `OPEN_HIGGSFIELD_MCP_SECRET` — a long random string (24+ letters, digits or `-`)

Connector URL: `https://<your-deployment>/api/mcp/<OPEN_HIGGSFIELD_MCP_SECRET>`.
Anyone with that URL spends from the owner's key, so keep it private and
rotate the secret if it leaks.

## Architecture

Each generate is one object: `{ model, prompt, media, settings }`.

- **The UI builds that object** and hands it to a server action. The action
  resolves it against the catalog and maps it to the generation API's own
  fields (`image_urls`, `aspect_ratio`, …).
- **Server actions are the only caller.** The browser never talks to the
  generation API. Submit is `POST /{model}`; status is
  `GET /requests/{id}/status`. Auth is `Authorization: Key <api_key>`.
- **The catalog is the source of truth** (`src/generation/catalog/`). A new entry
  appears in the picker, brings its own settings rail and media roles, and needs
  no studio changes.
- **Five small Zustand stores** — shared image/video prompt, shared image/video
  media, `settings[modelId]`, and a tiny `active` store. No store per model.
- **Uploads** go client-direct to Vercel Blob through `/api/blob`, which issues
  scoped tokens. `blob:` URLs are preview-only.

---

## Getting started

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Open the studio, press **Add key**, and paste your platform key as `id:secret`.

### Environment

```bash
HF_API_BASE_URL=                      # generation API origin, server only
OPEN_HIGGSFIELD_READ_WRITE_TOKEN=     # Vercel Blob read-write token
```

### Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm brand` | Rebuild the icons and OG card in `public/` |

---

## Layout

```
src/
  app/          /  is the full-viewport studio and the only page
                /api/blob issues upload tokens
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
