import { videoModel } from "./defaults";

/* multi_shots is sent explicitly: the schema switches to requiring
   multi_prompt whenever the field is absent. */
export const klingO3 = videoModel(
  "kling-o3",
  "Kling O3",
  { start: 1, end: 1 },
  { firstLast: "kling-video/o3/first-last-frame", fixed: { multi_shots: false } },
  {
    required: ["start"],
    settings: {
      aspectRatio: { type: "enum", values: ["16:9", "9:16", "1:1"], default: "16:9" },
      duration: { type: "range", min: 3, max: 15, default: 5 },
    },
  },
);
