import type { ModelEntry } from "./types";

/* Each Recraft 4.1 endpoint takes one resolution: 1k on the base variant, 2k
   on Pro. The resolution pill picks the endpoint. No image input exists. */
const recraftSettings = {
  aspectRatio: {
    type: "enum",
    values: ["1:1", "2:1", "1:2", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "6:10", "14:10", "10:14", "16:9", "9:16"],
    default: "1:1",
  },
  resolution: { type: "enum", values: ["1k", "2k"], default: "1k" },
  outputFormat: { type: "enum", values: ["jpg", "png", "webp"], default: "jpg" },
} as const satisfies ModelEntry["settings"];

export const recraft41: ModelEntry = {
  id: "recraft-4.1",
  surface: "image",
  label: "Recraft 4.1",
  roles: {},
  settings: recraftSettings,
};

export const recraft41Utility: ModelEntry = {
  id: "recraft-4.1-utility",
  surface: "image",
  label: "Recraft 4.1 Utility",
  roles: {},
  settings: recraftSettings,
};
