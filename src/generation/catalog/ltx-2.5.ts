import type { ModelEntry } from "./types";

const camera = {
  type: "enum",
  values: ["auto", "static", "dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "focus_shift"],
  default: "auto",
} as const;

/* LTX-2.5 sells 6, 8 and 10s clips at 16:9 or 9:16. A start frame (and an
   optional end frame) switches to image-to-video. */
export const ltx25Fast: ModelEntry = {
  id: "ltx-2.5-fast",
  surface: "video",
  label: "LTX 2.5 Fast",
  roles: { start: 1, end: 1 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "9:16"], default: "16:9" },
    resolution: { type: "enum", values: ["720p", "1080p", "2k", "4k"], default: "720p" },
    duration: { type: "enum", values: ["6", "8", "10"], default: "6" },
    generateAudio: { type: "boolean", default: true },
    cameraMovement: camera,
  },
};

export const ltx25Pro: ModelEntry = {
  id: "ltx-2.5-pro",
  surface: "video",
  label: "LTX 2.5 Pro",
  roles: { start: 1, end: 1 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "9:16"], default: "16:9" },
    resolution: { type: "enum", values: ["720p", "1080p"], default: "720p" },
    duration: { type: "enum", values: ["6", "8", "10"], default: "6" },
    generateAudio: { type: "boolean", default: true },
    cameraMovement: camera,
  },
};
