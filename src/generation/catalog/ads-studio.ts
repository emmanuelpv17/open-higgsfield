import type { ModelEntry } from "./types";

/* A marketing brief (the prompt) and optional product photos become 1–8 ad
   concepts, each rendered as one image with GPT Image 2.5 Flare at 2k. */
export const adsStudio: ModelEntry = {
  id: "ads-studio",
  surface: "image",
  label: "Ads Studio",
  roles: { reference: 10 },
  roleLabels: { reference: "Fotos del producto" },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["1:1", "4:5", "5:4", "16:9", "9:16", "4:3", "3:4", "21:9", "3:2", "2:3", "2:1", "1:2", "3:1", "1:3"],
      default: "1:1",
    },
    batchSize: { type: "range", min: 1, max: 8, default: 1 },
    /* Free text on the platform; the common ones are offered, auto sends none. */
    language: { type: "enum", values: ["auto", "es", "en", "pt", "fr", "it", "de"], default: "auto" },
  },
};
