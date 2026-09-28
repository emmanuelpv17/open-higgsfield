import { videoModel } from "./defaults";

/* Image-to-video only: the frame sets the ratio, 5 or 10 seconds. */
export const kling25 = videoModel(
  "kling-2.5",
  "Kling 2.5",
  { start: 1 },
  { image: "kling-video/v2.5-turbo/standard/image-to-video" },
  {
    required: ["start"],
    settings: { duration: { type: "range", min: 5, max: 10, step: 5, default: 5 } },
  },
);
