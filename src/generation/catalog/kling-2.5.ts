import type { ModelEntry } from "./types";

/* Kling 2.5 Turbo sells 5s and 10s clips only. */
const turboSettings = {
  duration: { type: "enum", values: ["5", "10"], default: "5" },
  cfgScale: { type: "range", min: 0, max: 1, default: 0.5, step: 0.01 },
} as const satisfies ModelEntry["settings"];

/** Standard is image-to-video only, at 720p. */
export const kling25: ModelEntry = {
  id: "kling-2.5",
  surface: "video",
  label: "Kling 2.5 Turbo",
  roles: { start: 1 },
  requires: ["start"],
  settings: turboSettings,
};

/** Pro renders 1080p, from a prompt alone or a start frame. */
export const kling25Pro: ModelEntry = {
  id: "kling-2.5-pro",
  surface: "video",
  label: "Kling 2.5 Turbo Pro",
  roles: { start: 1 },
  settings: turboSettings,
};
