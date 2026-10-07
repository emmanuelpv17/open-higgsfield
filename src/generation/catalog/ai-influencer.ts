import type { ModelEntry } from "./types";

/** API values for the nine character types, in the console's order. */
export const INFLUENCER_TIERS = [
  "normal", "freak", "total", "insects", "frogs", "cats", "dogs", "capybaras", "birds",
] as const;

/** One character reference sheet (close-up and full body, 2K, 16:9). Every
    input is optional: the prompt becomes the character brief, the start slot
    takes an identity photo and references take up to three clothing items. */
export const aiInfluencer: ModelEntry = {
  id: "ai-influencer",
  surface: "image",
  label: "AI Influencer",
  roles: { start: 1, reference: 3 },
  roleLabels: { start: "Identity photo", reference: "Item" },
  promptOptional: true,
  settings: {
    tier: { type: "enum", values: INFLUENCER_TIERS, default: "normal" },
    traits: { type: "traits", default: "" },
  },
};
