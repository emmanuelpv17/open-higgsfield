import { t2v, videoModel } from "./defaults";

export const kling26 = videoModel(
  "kling-2.6",
  "Kling 2.6",
  { start: 1 },
  t2v("kling-video/v2.6/pro/text-to-video", { aspectOnImage: true }),
  {
    settings: {
      aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1"], default: "16:9" },
      duration: { type: "range", min: 5, max: 10, step: 5, default: 5 },
    },
  },
);
