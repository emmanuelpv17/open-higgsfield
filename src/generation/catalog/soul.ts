import type { ModelEntry, PresetSource } from "./types";
import { SOUL_ASPECT } from "./tokens";

/* A Soul ID character (trained for that Soul version) and how strongly its
   likeness is held. */
function soulSettings(source: PresetSource, aspect = "1:1") {
  return {
    aspectRatio: { type: "enum", values: SOUL_ASPECT, default: aspect },
    resolution: { type: "enum", values: ["720p", "1080p"], default: "720p" },
    batchSize: { type: "enum", values: ["1", "4"], default: "1" },
    enhancePrompt: { type: "boolean", default: false },
    character: { type: "preset", default: "", source },
    likeness: { type: "range", min: 0, max: 1, step: 0.05, default: 1 },
  } as const satisfies ModelEntry["settings"];
}

export const soulCinema: ModelEntry = {
  id: "soul-cinema",
  surface: "image",
  label: "Soul Cinema",
  roles: {},
  settings: soulSettings("soul-id-cinema"),
};

/** A reference image switches Soul 2 to its image-to-image endpoint. */
export const soul2: ModelEntry = {
  id: "soul-2",
  surface: "image",
  label: "Soul 2",
  roles: { reference: 1 },
  settings: soulSettings("soul-id-v2"),
};

export const soulStandard: ModelEntry = {
  id: "soul-standard",
  surface: "image",
  label: "Soul Standard",
  roles: {},
  settings: soulSettings("soul-id-v1", "4:3"),
};
