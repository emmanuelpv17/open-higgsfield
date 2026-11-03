import type { ModelEntry } from "./types";

/* Kling 4.0 has four endpoints. The studio picks one from what is attached:
   a start frame goes to image-to-video (references then ride along as middle
   keyframes, in order, up to 8), reference images or videos to
   reference-to-video, and a bare prompt to text-to-video.
   Editing a video is its own entry, since the clip is rewritten rather than
   borrowed from. */
const kling4Settings = {
  /* Adaptive needs a reference; text-to-video falls back to its 16:9 default,
     and image-to-video follows the start frame. */
  aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1", "21:9", "adaptive"], default: "16:9" },
  resolution: { type: "enum", values: ["720p", "1080p"], default: "720p" },
  duration: { type: "range", min: 3, max: 30, default: 5 },
} as const satisfies ModelEntry["settings"];

export const kling4: ModelEntry = {
  id: "kling-4",
  surface: "video",
  label: "Kling 4.0",
  roles: { start: 1, end: 1, reference: 10, video: 5 },
  settings: kling4Settings,
};

/** Rewrites one source clip, with optional reference images; the output runs
    for the requested duration, not the source's. */
export const kling4Edit: ModelEntry = {
  id: "kling-4-edit",
  surface: "video",
  label: "Kling 4.0 Video Edit",
  roles: { video: 1, reference: 10 },
  requires: ["video"],
  settings: { ...kling4Settings, aspectRatio: { ...kling4Settings.aspectRatio, default: "adaptive" } },
};
