import { QWEN_ASPECT } from "./qwen-image-3";
import type { ModelEntry } from "./types";

/** Text only; the prompt caps at 800 characters. */
export const zImageTurbo: ModelEntry = {
  id: "z-image-turbo",
  surface: "image",
  label: "Z-Image Turbo",
  roles: {},
  settings: {
    aspectRatio: { type: "enum", values: QWEN_ASPECT, default: "1:1" },
    resolution: { type: "enum", values: ["1k", "2k"], default: "1k" },
    enhancePrompt: { type: "boolean", default: false },
  },
};
