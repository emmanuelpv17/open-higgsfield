import { imageModel } from "./defaults";

export const recraft41 = imageModel(
  "recraft-4.1",
  "Recraft 4.1",
  { text: "recraft/v4.1/text-to-image" },
  {
    roles: {},
    promptMax: 10000,
    settings: {
      aspectRatio: {
        type: "enum",
        values: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "5:4", "4:5", "2:1", "1:2", "14:10", "10:14", "6:10"],
        default: "1:1",
      },
    },
  },
);
