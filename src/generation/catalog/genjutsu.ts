import type { ModelEntry } from "./types";

/** One source video (4–30s) drives the run; the references are the new cast,
    outfit, product or look. Billed per second of the source video. */
const genjutsuSettings = {
  resolution: { type: "enum", values: ["480p", "720p"], default: "480p" },
} as const satisfies ModelEntry["settings"];

const genjutsuRates = { "480p": 0.318, "720p": 0.681 };

export const genjutsuMotion: ModelEntry = {
  id: "genjutsu-motion",
  surface: "video",
  label: "Genjutsu Motion Transfer",
  roles: { video: 1, reference: 8 },
  settings: genjutsuSettings,
  perSecondUsd: genjutsuRates,
};

export const genjutsuSwap: ModelEntry = {
  id: "genjutsu-swap",
  surface: "video",
  label: "Genjutsu Object Swap",
  roles: { video: 1, reference: 8 },
  settings: genjutsuSettings,
  perSecondUsd: genjutsuRates,
};
