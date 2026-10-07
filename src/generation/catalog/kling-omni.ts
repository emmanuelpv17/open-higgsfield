import type { ModelEntry } from "./types";

/* Kling O3 and Kling Omni (O1) share one request shape across four endpoints.
   The studio picks the endpoint from what is attached: a start frame goes to
   first-last-frame, a video to video-reference, anything else to
   image-reference (whose images are optional, so a bare prompt works too).
   Editing a video is its own entry, since it takes the same attachments as a
   video reference but rewrites the clip rather than borrowing from it. */
const omniSettings = {
  mode: { type: "enum", values: ["std", "pro", "4k"], default: "pro" },
  aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1"], default: "16:9" },
  duration: { type: "range", min: 3, max: 15, default: 5 },
  sound: { type: "boolean", default: false },
} as const satisfies ModelEntry["settings"];

const omniRoles = { start: 1, end: 1, reference: 4, video: 1 } as const;

export const klingO3: ModelEntry = {
  id: "kling-o3",
  surface: "video",
  label: "Kling O3",
  roles: omniRoles,
  settings: omniSettings,
};

/** Omni renders std or pro only, for 3–10 seconds, without native audio. */
export const klingO1: ModelEntry = {
  id: "kling-o1",
  surface: "video",
  label: "Kling O1 (Omni)",
  roles: omniRoles,
  settings: {
    mode: { type: "enum", values: ["std", "pro"], default: "pro" },
    aspectRatio: omniSettings.aspectRatio,
    duration: { type: "range", min: 3, max: 10, default: 5 },
  },
};

/** The output follows the 3–15.5s source clip; no duration is sent. */
const editSettings = {
  mode: { type: "enum", values: ["std", "pro", "4k"], default: "pro" },
} as const satisfies ModelEntry["settings"];

export const klingO3Edit: ModelEntry = {
  id: "kling-o3-edit",
  surface: "video",
  label: "Kling O3 Video Edit",
  roles: { video: 1, reference: 4 },
  requires: ["video"],
  settings: editSettings,
};

/** Omni edits a 3–10s clip at std or pro. */
export const klingO1Edit: ModelEntry = {
  id: "kling-o1-edit",
  surface: "video",
  label: "Kling O1 (Omni) Video Edit",
  roles: { video: 1, reference: 4 },
  requires: ["video"],
  settings: { mode: { type: "enum", values: ["std", "pro"], default: "pro" } },
};
