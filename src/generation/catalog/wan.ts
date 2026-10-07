import type { ModelEntry } from "./types";

/* Each Wan endpoint family has text-to-video, image-to-video and
   reference-to-video. The studio routes by attachment: a start frame goes to
   image-to-video, references to reference-to-video, a bare prompt to
   text-to-video. Settings follow each family's published schema. */

/** Wan 3.0 and 3.0 Prime share one schema across all three endpoints. */
const wan3Settings = {
  aspectRatio: {
    type: "enum",
    values: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"],
    default: "adaptive",
  },
  resolution: { type: "enum", values: ["480p", "720p", "1080p"], default: "1080p" },
  duration: { type: "range", min: 2, max: 30, default: 5 },
  generateAudio: { type: "boolean", default: true },
  thinking: { type: "boolean", default: false },
} as const satisfies ModelEntry["settings"];

const wan3Roles = { start: 1, end: 1, reference: 10, video: 5, audio: 5 } as const;

export const wan3: ModelEntry = {
  id: "wan-3",
  surface: "video",
  label: "Wan 3.0",
  roles: wan3Roles,
  settings: wan3Settings,
};

export const wan3Prime: ModelEntry = {
  id: "wan-3-prime",
  surface: "video",
  label: "Wan 3.0 Prime",
  roles: wan3Roles,
  settings: wan3Settings,
};

/** Wan 2.7: aspect ratio on text-to-video (and 16:9 or 9:16 on references);
    image-to-video follows the frame. References run 2-10s. */
export const wan27: ModelEntry = {
  id: "wan-2.7",
  surface: "video",
  label: "Wan 2.7",
  roles: { start: 1, end: 1, reference: 5, video: 3 },
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1", "4:3", "3:4"], default: "16:9" },
    resolution: { type: "enum", values: ["720p", "1080p"], default: "720p" },
    duration: { type: "range", min: 2, max: 15, default: 5 },
  },
};

/** Wan 2.6 sells 5, 10 and 15s clips (5 or 10 from a video reference, which
    takes 1-3 videos and no images). No aspect ratio is declared. */
export const wan26: ModelEntry = {
  id: "wan-2.6",
  surface: "video",
  label: "Wan 2.6",
  roles: { start: 1, video: 3 },
  settings: {
    resolution: { type: "enum", values: ["720p", "1080p"], default: "720p" },
    duration: { type: "enum", values: ["5", "10", "15"], default: "5" },
  },
};
