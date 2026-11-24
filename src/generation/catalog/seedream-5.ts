import type { ModelEntry } from "./types";

/** Seedream 5.0 Pro: text to image, or edit with one to ten references. */
export const seedream5Pro: ModelEntry = {
  id: "seedream-5-pro",
  surface: "image",
  label: "Seedream 5.0 Pro",
  roles: { reference: 10 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"],
      default: "1:1",
    },
    resolution: { type: "enum", values: ["1k", "1.5k", "2k"], default: "2k" },
  },
};
