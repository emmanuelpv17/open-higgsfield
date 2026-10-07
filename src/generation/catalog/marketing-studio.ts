import type { ModelEntry } from "./types";

const aspectRatio = {
  type: "enum",
  values: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"],
  default: "auto",
} as const;

const shared = {
  aspectRatio,
  resolution: { type: "enum", values: ["1k", "2k", "4k"], default: "2k" },
  moderation: { type: "enum", values: ["auto", "low"], default: "auto" },
  /* Empty is direct mode: the prompt drives the image and attached images are
     edited (up to 16). A preset (Product shots, Graphic ads, Marketplace and the
     rest of the platform's list) takes the product photo first and an optional
     model reference second. */
  preset: { type: "preset", default: "" },
} as const satisfies ModelEntry["settings"];

export const marketingStudioImage: ModelEntry = {
  id: "marketing-studio-image",
  surface: "image",
  label: "Marketing Studio Image 2.0",
  roles: { reference: 16 },
  settings: {
    ...shared,
    quality: { type: "enum", values: ["low", "medium", "high"], default: "low" },
  },
};

const quality25 = {
  type: "enum",
  values: ["low", "medium", "high", "xhigh", "max"],
  default: "high",
} as const;

export const marketingStudioFlare: ModelEntry = {
  id: "marketing-studio-flare",
  surface: "image",
  label: "Marketing Studio 2.5 Flare",
  roles: { reference: 16 },
  settings: { ...shared, quality: quality25 },
};

export const marketingStudioSunburst: ModelEntry = {
  id: "marketing-studio-sunburst",
  surface: "image",
  label: "Marketing Studio 2.5 Sunburst",
  roles: { reference: 16 },
  settings: { ...shared, quality: quality25 },
};
