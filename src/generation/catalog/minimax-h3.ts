import type { ModelEntry } from "./types";

/** MiniMax H3 renders at 2K only, for 5-15s. A start frame goes to
    image-to-video (with an optional end frame), references to
    reference-to-video (up to 9 images, 3 videos, 3 audio files). */
export const minimaxH3: ModelEntry = {
  id: "minimax-h3",
  surface: "video",
  label: "MiniMax H3",
  roles: { start: 1, end: 1, reference: 9, video: 3, audio: 3 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["auto", "adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
      default: "auto",
    },
    duration: { type: "range", min: 5, max: 15, default: 5 },
  },
};
