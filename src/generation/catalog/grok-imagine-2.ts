import { imageModel } from "./defaults";

export const grokImagine2 = imageModel(
  "grok-imagine-2",
  "Grok Imagine 2.0",
  { text: "xai/grok-imagine-image-2.0" },
  {
    settings: {
      aspectRatio: {
        type: "enum",
        values: ["auto", "1:1", "1:2", "2:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"],
        default: "1:1",
      },
      resolution: { type: "enum", values: ["1k", "2k"], default: "1k" },
    },
  },
);
