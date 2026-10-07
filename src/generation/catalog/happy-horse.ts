import type { ModelEntry } from "./types";

/* Happy Horse routes like Wan: a start frame to image-to-video, reference
   images to reference-to-video, a bare prompt to text-to-video. Only
   text-to-video takes an aspect ratio, and it starts at 3s rather than 2. */
const settings = (resolution: "720p" | "1080p") =>
  ({
    aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1", "4:3", "3:4"], default: "16:9" },
    resolution: { type: "enum", values: ["720p", "1080p"], default: resolution },
    duration: { type: "range", min: 3, max: 15, default: 5 },
  }) as const satisfies ModelEntry["settings"];

export const happyHorse1: ModelEntry = {
  id: "happy-horse-1",
  surface: "video",
  label: "Happy Horse 1.0",
  roles: { start: 1, reference: 9 },
  settings: settings("720p"),
};

export const happyHorse11: ModelEntry = {
  id: "happy-horse-1.1",
  surface: "video",
  label: "Happy Horse 1.1",
  roles: { start: 1, reference: 9 },
  settings: settings("1080p"),
};
