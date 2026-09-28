import { t2v, videoModel } from "./defaults";

/* Hailuo 2.3 Standard takes neither ratio nor resolution; 6 or 10 seconds. */
export const minimaxHailuo23 = videoModel(
  "minimax-hailuo-2.3",
  "MiniMax Hailuo 2.3",
  { start: 1 },
  t2v("minimax/hailuo-2.3/standard/text-to-video"),
  { settings: { duration: { type: "range", min: 6, max: 10, step: 4, default: 6 } } },
);
