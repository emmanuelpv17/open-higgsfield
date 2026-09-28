import { t2v, videoModel } from "./defaults";

/* H3 renders at 2K only, so resolution is not a choice. */
export const minimaxH3 = videoModel(
  "minimax-h3",
  "MiniMax H3",
  { start: 1 },
  t2v("minimax/h3/text-to-video", { aspectOnImage: true }),
  {
    settings: {
      aspectRatio: {
        type: "enum",
        values: ["auto", "adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
        default: "16:9",
      },
      duration: { type: "range", min: 5, max: 15, default: 5 },
    },
  },
);
