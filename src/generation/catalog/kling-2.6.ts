import type { ModelEntry } from "./types";
import { t2v, videoModel } from "./defaults";

export const kling26 = videoModel(
  "kling-2.6",
  "Kling 2.6",
  { start: 1 },
  t2v("kling-video/v2.6/pro/text-to-video"),
);

const motionSettings = {
  keepOriginalSound: { type: "boolean", default: true },
  characterOrientation: { type: "enum", values: ["video", "image"], default: "video" },
} as const satisfies ModelEntry["settings"];

/** Output runs as long as the 3–30s motion video; no duration is sent. */
export const kling26MotionStd: ModelEntry = {
  id: "kling-2.6-motion-std",
  surface: "video",
  label: "Kling 2.6 Motion Control",
  roles: { start: 1, video: 1 },
  requires: ["start", "video"],
  settings: motionSettings,
};

export const kling26MotionPro: ModelEntry = {
  id: "kling-2.6-motion-pro",
  surface: "video",
  label: "Kling 2.6 Motion Control Pro",
  roles: { start: 1, video: 1 },
  requires: ["start", "video"],
  settings: motionSettings,
};
