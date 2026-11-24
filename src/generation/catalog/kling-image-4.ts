import type { ModelEntry } from "./types";

/** Kling Image 4.0: text to image, or edit with one to ten references, at
    2K, 4K or 8K. A count above one asks for a coordinated series (2-10
    images) from the series endpoints, billed per image. */
export const klingImage4: ModelEntry = {
  id: "kling-image-4",
  surface: "image",
  label: "Kling Image 4.0",
  roles: { reference: 10 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
      default: "auto",
    },
    resolution: { type: "enum", values: ["2k", "4k", "8k"], default: "2k" },
    batchSize: { type: "range", min: 1, max: 10, default: 1 },
  },
};
