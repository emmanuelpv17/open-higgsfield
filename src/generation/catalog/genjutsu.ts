import type { ModelEntry } from "./types";

/** Motion Transfer: the driving video's motion and camera, recast from the reference images. */
export const genjutsuMotionTransfer: ModelEntry = {
  id: "genjutsu-motion-transfer",
  surface: "video",
  label: "Genjutsu Motion Transfer",
  roles: { video: 1, reference: 30 },
  settings: {},
};
