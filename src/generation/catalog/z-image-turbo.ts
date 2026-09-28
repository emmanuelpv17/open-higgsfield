import { imageModel } from "./defaults";
import { ALIBABA_IMAGE_ASPECT } from "./tokens";

export const zImageTurbo = imageModel(
  "z-image-turbo",
  "Z-Image Turbo",
  { text: "z-image/turbo" },
  {
    roles: {},
    promptMax: 800,
    settings: {
      aspectRatio: { type: "enum", values: ALIBABA_IMAGE_ASPECT, default: "1:1" },
      resolution: { type: "enum", values: ["1k", "2k"], default: "1k" },
    },
  },
);
