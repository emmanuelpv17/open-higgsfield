import { videoModel } from "./defaults";

export const klingO1 = videoModel(
  "kling-o1",
  "Kling O1 (Omni)",
  { start: 1, end: 1 },
  { firstLast: "kling-video/omni/first-last-frame" },
  {
    required: ["start"],
    settings: {
      aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1"], default: "16:9" },
      duration: { type: "range", min: 5, max: 10, step: 5, default: 5 },
    },
  },
);
