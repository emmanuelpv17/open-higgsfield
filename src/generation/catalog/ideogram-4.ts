import { imageModel } from "./defaults";

export const ideogram4 = imageModel(
  "ideogram-4",
  "Ideogram 4.0",
  { text: "ideogram/v4.0" },
  {
    roles: {},
    promptMax: 2048,
    settings: {
      aspectRatio: {
        type: "enum",
        values: [
          "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "5:4", "4:5", "2:1", "1:2",
          "8:5", "5:8", "3:1", "1:3", "8:3", "3:8", "12:5", "5:12", "22:9", "9:22", "23:9", "9:23",
        ],
        default: "1:1",
      },
    },
  },
);
