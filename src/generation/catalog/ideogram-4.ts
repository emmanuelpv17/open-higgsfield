import type { ModelEntry } from "./types";

/** Text to image, or remix one input image; the image weight only applies then. */
export const ideogram4: ModelEntry = {
  id: "ideogram-4",
  surface: "image",
  label: "Ideogram 4.0",
  roles: { reference: 1 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: [
        "1:1", "4:5", "5:4", "3:4", "4:3", "2:3", "3:2", "9:16", "16:9", "1:2", "2:1",
        "5:8", "8:5", "3:8", "8:3", "5:12", "12:5", "1:3", "3:1", "9:22", "22:9", "9:23", "23:9",
      ],
      default: "1:1",
    },
    renderingSpeed: { type: "enum", values: ["turbo", "default", "quality"], default: "default" },
    imageWeight: { type: "range", min: 1, max: 100, default: 50 },
  },
};
