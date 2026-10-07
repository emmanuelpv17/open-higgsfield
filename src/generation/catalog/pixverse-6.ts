import type { ModelEntry } from "./types";

/** PixVerse V6: 1-15s, 360p to 1080p, optional audio. Aspect ratio applies to
    text-to-video; a start frame (and optional end frame) sets it otherwise. */
export const pixverse6: ModelEntry = {
  id: "pixverse-6",
  surface: "video",
  label: "PixVerse 6",
  roles: { start: 1, end: 1 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "4:3", "1:1", "3:4", "9:16"], default: "16:9" },
    resolution: { type: "enum", values: ["360p", "540p", "720p", "1080p"], default: "720p" },
    duration: { type: "range", min: 1, max: 15, default: 5 },
    generateAudio: { type: "boolean", default: true },
  },
};
