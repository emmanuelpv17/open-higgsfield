import { imageModel } from "./defaults";
import { ALIBABA_IMAGE_ASPECT } from "./tokens";

/* Prompt alone goes to text-to-image; attached references go to edit, which
   takes one to three images. */
export const qwenImage3 = imageModel(
  "qwen-image-3",
  "Qwen Image 3",
  { text: "alibaba/qwen-image-3/text-to-image", reference: "alibaba/qwen-image-3/edit" },
  {
    roles: { reference: 3 },
    settings: {
      aspectRatio: { type: "enum", values: ALIBABA_IMAGE_ASPECT, default: "1:1" },
      resolution: { type: "enum", values: ["1k", "2k"], default: "1k" },
    },
  },
);
