import type { ModelEntry } from "./types";

/** Grok Imagine Video 1.5 has one endpoint: an optional start frame, up to 7
    reference images and an optional audio track, 1-15s. */
export const grokImagineVideo15: ModelEntry = {
  id: "grok-imagine-video-1.5",
  surface: "video",
  label: "Grok Imagine Video 1.5",
  roles: { start: 1, reference: 7, audio: 1 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
      default: "auto",
    },
    resolution: { type: "enum", values: ["480p", "720p", "1080p"], default: "480p" },
    duration: { type: "range", min: 1, max: 15, default: 5 },
  },
};
