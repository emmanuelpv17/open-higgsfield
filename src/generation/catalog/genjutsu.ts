import type { ModelEntry } from "./types";

/** One source video (4–30s, longer is trimmed) drives the run; the references
    are the new cast, outfit, product or look. Billed per second of the source. */
const resolution = { type: "enum", values: ["480p", "720p", "1080p"], default: "480p" } as const;

export const genjutsuMotion: ModelEntry = {
  id: "genjutsu-motion",
  surface: "video",
  label: "Genjutsu Motion Transfer",
  roles: { video: 1, reference: 8 },
  requires: ["video", "reference"],
  settings: { resolution },
};

export const genjutsuSwap: ModelEntry = {
  id: "genjutsu-swap",
  surface: "video",
  label: "Genjutsu Object Swap",
  roles: { video: 1, reference: 8 },
  requires: ["video", "reference"],
  settings: { resolution },
};

/** Restyle keeps the source's motion, framing and audio and repaints it in a
    style chosen from the platform's list; up to 5 character images guide how
    the subjects look. */
export const genjutsuRestyle: ModelEntry = {
  id: "genjutsu-restyle",
  surface: "video",
  label: "Genjutsu Restyle",
  roles: { video: 1, reference: 5 },
  requires: ["video"],
  settings: {
    preset: { type: "preset", default: "", source: "genjutsu-restyle" },
    resolution,
  },
};
