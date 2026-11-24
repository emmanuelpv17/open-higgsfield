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

/* H3 Highspeed and H3 Lite: the same three endpoints as H3, at 480P or 768P
   for 4-15s, at a fraction of the price. */
function h3Fast(id: string, label: string): ModelEntry {
  return {
    id,
    surface: "video",
    label,
    roles: { start: 1, end: 1, reference: 9, video: 3, audio: 3 },
    settings: {
      aspectRatio: {
        type: "enum",
        values: ["auto", "adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        default: "16:9",
      },
      resolution: { type: "enum", values: ["480P", "768P"], default: "768P" },
      duration: { type: "range", min: 4, max: 15, default: 5 },
    },
  };
}

export const minimaxH3Highspeed = h3Fast("minimax-h3-highspeed", "MiniMax H3 Highspeed");
export const minimaxH3Lite = h3Fast("minimax-h3-lite", "MiniMax H3 Lite");
