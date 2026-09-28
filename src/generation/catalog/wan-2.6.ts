import { t2v, videoModel } from "./defaults";

/* Wan 2.6 takes no aspect ratio, and its durations are 5, 10 or 15 seconds. */
export const wan26 = videoModel("wan-2.6", "Wan 2.6", { start: 1 }, t2v("wan/v2.6/text-to-video"), {
  settings: {
    resolution: { type: "enum", values: ["720p", "1080p"], default: "720p" },
    duration: { type: "range", min: 5, max: 15, step: 5, default: 5 },
  },
});
