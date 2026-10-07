import type { ModelEntry } from "./types";

export const QWEN_ASPECT = ["1:1", "2:3", "3:2", "3:4", "4:3", "7:9", "9:7", "9:16", "16:9", "21:9"] as const;

/** Text to image, or edit with one to three references. Thinking needs the
    prompt enhancement on, so it is dropped when enhancement is off. */
export const qwenImage3: ModelEntry = {
  id: "qwen-image-3",
  surface: "image",
  label: "Qwen Image 3",
  roles: { reference: 3 },
  settings: {
    aspectRatio: { type: "enum", values: QWEN_ASPECT, default: "1:1" },
    resolution: { type: "enum", values: ["1k", "2k"], default: "1k" },
    enhancePrompt: { type: "boolean", default: true },
    thinking: { type: "boolean", default: true },
  },
};
