# Graph Report - open-higgsfield  (2026-10-06)

## Corpus Check
- Corpus is ~44,563 words - fits in a single context window. You may not need a graph.

## Summary
- 550 nodes · 1387 edges · 19 communities (17 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Asset Picker & Gallery UI
- Studio Page & Cost
- Media Upload & Assets
- Generation Actions & Architecture
- Video Model Defaults
- Package Dependencies
- Next.js App Shell
- TypeScript Config
- Kling & Grok Video Models
- Seedance & Soul Models
- Pricing Rules
- Blob Upload Route & Device ID
- Brand Asset Build Script
- Platform API Mapping
- Image Models
- Settings Controls
- Catalog Types & Genjutsu

## God Nodes (most connected - your core abstractions)
1. `OpenHiggsfieldApp()` - 36 edges
2. `Composer()` - 29 edges
3. `base()` - 29 edges
4. `Viewer()` - 20 edges
5. `videoModel()` - 19 edges
6. `CloseIcon()` - 18 edges
7. `compilerOptions` - 18 edges
8. `ModelEntry` - 17 edges
9. `AssetPicker()` - 16 edges
10. `react` - 14 edges

## Surprising Connections (you probably didn't know these)
- `OpenHiggsfieldPage()` --calls--> `OpenHiggsfieldApp()`  [EXTRACTED]
  src/app/page.tsx → src/openhiggsfield/openhiggsfield-app.tsx
- `onSubmit()` --calls--> `savePlatformCredentials()`  [EXTRACTED]
  src/openhiggsfield/key-modal.tsx → src/generation/actions.ts
- `OpenHiggsfieldApp()` --calls--> `hasPlatformCredentials()`  [EXTRACTED]
  src/openhiggsfield/openhiggsfield-app.tsx → src/generation/actions.ts
- `submitGeneration()` --calls--> `getModel()`  [EXTRACTED]
  src/generation/actions.ts → src/generation/catalog/index.ts
- `submitGeneration()` --calls--> `parseSettings()`  [EXTRACTED]
  src/generation/actions.ts → src/generation/catalog/parse-settings.ts

## Import Cycles
- None detected.

## Communities (19 total, 2 thin omitted)

### Community 0 - "Asset Picker & Gallery UI"
Cohesion: 0.07
Nodes (74): react, MODELS, asCost(), formatCost(), AssetPicker(), advanceOrClose(), commit(), pickRole() (+66 more)

### Community 1 - "Studio Page & Cost"
Cohesion: 0.06
Nodes (61): Five small Zustand stores, zustand, inter, metadata, OpenHiggsfieldPage(), getModel(), parseSettings(), GenerationPlane (+53 more)

### Community 2 - "Media Upload & Assets"
Cohesion: 0.05
Nodes (61): @vercel/blob, MediaItem, MediaRole, useImageMedia, useVideoMedia, uploadMedia(), Asset, AssetKind (+53 more)

### Community 3 - "Generation Actions & Architecture"
Cohesion: 0.06
Nodes (56): Uploads to Vercel Blob via /api/blob, Catalog is the source of truth, Design principles (dark ground, lime accent), Gallery: Image/Video/Assets/Favorites, Generate request {model, prompt, media, settings}, History persisted in IndexedDB (60 records), Platform key in httpOnly cookie, Run polling every 4s, 10-minute deadline (+48 more)

### Community 4 - "Video Model Defaults"
Cohesion: 0.11
Nodes (19): IMAGE_ASPECT, t2v(), VIDEO_ASPECT, videoModel(), dop, flux3, happyHorse11, happyHorse1 (+11 more)

### Community 5 - "Package Dependencies"
Cohesion: 0.07
Nodes (26): dependencies, next, react, react-dom, @tanstack/react-virtual, @vercel/blob, zustand, devDependencies (+18 more)

### Community 6 - "Next.js App Shell"
Cohesion: 0.13
Nodes (13): nextConfig, next, metadata, viewport, OG_IMAGE, openGraphFor(), SITE_DESCRIPTION, SITE_DESCRIPTOR (+5 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.10
Nodes (20): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+12 more)

### Community 8 - "Kling & Grok Video Models"
Cohesion: 0.16
Nodes (13): grokImagineVideo15, kling25, kling34k, kling3MotionPro, kling3MotionStd, kling3Pro, kling3Settings, kling3Std (+5 more)

### Community 9 - "Seedance & Soul Models"
Cohesion: 0.13
Nodes (14): seedance25, seedance25Edit, seedance25Extend, seedance25Settings, seedance2, seedance2Fast, seedance2Mini, seedanceRoles (+6 more)

### Community 10 - "Pricing Rules"
Cohesion: 0.12
Nodes (10): Cost, formatUsd(), perSecond(), perSourceSecond(), Pricer, PRICING, scaleCost(), seedance2 (+2 more)

### Community 11 - "Blob Upload Route & Device ID"
Cohesion: 0.25
Nodes (14): POST(), readDeviceId(), summarizeBlobEvent(), withDeviceCookie(), withDevicePath(), blobPathname(), DEVICE_COOKIE, DEVICE_COOKIE_OPTIONS (+6 more)

### Community 12 - "Brand Asset Build Script"
Cohesion: 0.15
Nodes (7): bleedPlate(), brackets(), CHROME, markSvg(), ROOT, roundedPlate(), WORK

### Community 13 - "Platform API Mapping"
Cohesion: 0.22
Nodes (14): MAP, mapByPaths(), mapGenjutsu(), mapKling3(), mapKlingMotion(), mapKlingTurbo(), mapMarketingStudio(), Mapped (+6 more)

### Community 14 - "Image Models"
Cohesion: 0.15
Nodes (7): imageModel(), flux2, grokImagine2, ideogram4, qwenImage3, recraft41, zImageTurbo

### Community 15 - "Settings Controls"
Cohesion: 0.37
Nodes (11): ratioBox(), settingLabel(), settingPillLabel(), settingPillValue(), settingValueLabel(), SettingPill(), SettingPopover(), Field() (+3 more)

### Community 16 - "Catalog Types & Genjutsu"
Cohesion: 0.21
Nodes (8): genjutsuMotion, genjutsuSettings, genjutsuSwap, marketingStudioImage, ModelEntry, SettingField, Surface, ActiveRun

## Knowledge Gaps
- **108 isolated node(s):** `nextConfig`, `name`, `private`, `type`, `dev` (+103 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 144 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Asset Picker & Gallery UI` to `Studio Page & Cost`, `Media Upload & Assets`, `Generation Actions & Architecture`, `Package Dependencies`, `Next.js App Shell`, `Settings Controls`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **What connects `nextConfig`, `name`, `private` to the rest of the system?**
  _108 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Asset Picker & Gallery UI` be split into smaller, more focused modules?**
  _Cohesion score 0.06670584778136938 - nodes in this community are weakly interconnected._
- **Why does `next` connect `Next.js App Shell` to `Generation Actions & Architecture`, `Studio Page & Cost`, `Blob Upload Route & Device ID`, `Package Dependencies`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Should `Studio Page & Cost` be split into smaller, more focused modules?**
  _Cohesion score 0.06322624743677376 - nodes in this community are weakly interconnected._
- **Why does `ModelEntry` connect `Catalog Types & Genjutsu` to `Asset Picker & Gallery UI`, `Studio Page & Cost`, `Media Upload & Assets`, `Video Model Defaults`, `Kling & Grok Video Models`, `Seedance & Soul Models`, `Settings Controls`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Should `Media Upload & Assets` be split into smaller, more focused modules?**
  _Cohesion score 0.05311871227364185 - nodes in this community are weakly interconnected._