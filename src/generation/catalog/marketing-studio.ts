import type { ModelEntry } from "./types";

/* Published USD per image for the combinations the platform lists; anything
   else has no known price and shows no estimate. Regular prices, not the
   launch discount. */
const PRICES: Record<string, number> = {
  "1k/low": 0.0162,
  "2k/low": 0.0222,
  "4k/high": 0.7219,
};

/** Direct mode only: the prompt drives the image, and any attached images are
    edited. The preset mode (enhance_prompt with a preset_id) is not wired. */
export const marketingStudioImage: ModelEntry = {
  id: "marketing-studio-image",
  surface: "image",
  label: "Marketing Studio Image",
  roles: { reference: 16 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"],
      default: "auto",
    },
    resolution: { type: "enum", values: ["1k", "2k", "4k"], default: "2k" },
    quality: { type: "enum", values: ["low", "medium", "high"], default: "low" },
    moderation: { type: "enum", values: ["auto", "low"], default: "auto" },
  },
  perResultUsd: (settings) => PRICES[`${settings.resolution}/${settings.quality}`] ?? null,
};
