import type { ModelEntry } from "./types";

/** Hailuo 2.3 Standard sells 6s and 10s clips; no resolution or aspect ratio
    is declared. A start frame switches to image-to-video. */
export const minimaxHailuo23: ModelEntry = {
  id: "minimax-hailuo-2.3",
  surface: "video",
  label: "MiniMax Hailuo 2.3",
  roles: { start: 1 },
  settings: {
    duration: { type: "enum", values: ["6", "10"], default: "6" },
    enhancePrompt: { type: "boolean", default: true },
  },
};
