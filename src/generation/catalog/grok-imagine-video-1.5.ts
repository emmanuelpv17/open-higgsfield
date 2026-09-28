import { videoModel } from "./defaults";

/* The reference-to-video schema takes up to seven images and no clips. */
export const grokImagineVideo15 = videoModel(
  "grok-imagine-video-1.5",
  "Grok Imagine Video 1.5",
  { reference: 7 },
  { reference: "xai/grok-imagine-video/v1.5/reference-to-video" },
);
