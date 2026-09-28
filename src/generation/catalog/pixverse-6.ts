import { t2v, videoModel } from "./defaults";

export const pixverse6 = videoModel("pixverse-6", "PixVerse 6", { start: 1 }, t2v("pixverse/v6/text-to-video"), {
  promptMax: 5000,
  settings: {
    aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1", "4:3", "3:4"], default: "16:9" },
    resolution: { type: "enum", values: ["360p", "540p", "720p", "1080p"], default: "720p" },
    duration: { type: "range", min: 1, max: 15, default: 5 },
  },
});
