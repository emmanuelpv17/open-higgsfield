import type { GenerationPlane, MediaRole, ModelEntry } from "./types";

const ROLE_NAMES: Record<MediaRole, string> = {
  start: "a start frame",
  end: "an end frame",
  reference: "a reference image",
  video: "a video clip",
  audio: "an audio track",
};

/** Why this plane cannot be sent to this model, or null when it can. Runs in
    the composer before a press and again in the server action, so a request
    the documented schema would reject never reaches the platform. */
export function planeProblem(model: ModelEntry, plane: GenerationPlane): string | null {
  const text = plane.prompt.text.trim();
  if (!text) return "Write a prompt first.";
  if (model.promptMax && text.length > model.promptMax) {
    return `${model.label} takes prompts up to ${model.promptMax} characters.`;
  }

  const count = (role: MediaRole) => plane.media[role]?.length ?? 0;
  for (const [role, items] of Object.entries(plane.media) as Array<[MediaRole, GenerationPlane["media"][MediaRole]]>) {
    if (!items?.length) continue;
    const max = model.roles[role] ?? 0;
    if (items.length > max) {
      return max === 0
        ? `${model.label} does not take ${ROLE_NAMES[role]}.`
        : `${model.label} takes at most ${max} × ${ROLE_NAMES[role].replace(/^an? /, "")}.`;
    }
    for (const item of items) {
      if (!isHttpsUrl(item.url)) return "Every attached file needs to finish uploading first.";
    }
  }

  for (const role of model.required ?? []) {
    if (count(role) === 0) return `${model.label} needs ${ROLE_NAMES[role]}.`;
  }
  if (count("end") > 0 && count("start") === 0) {
    return "An end frame needs a start frame to go with it.";
  }
  if (
    model.framesExclusive &&
    count("start") + count("end") > 0 &&
    count("reference") + count("video") + count("audio") > 0
  ) {
    return `${model.label} takes either start/end frames or references in one run, not both.`;
  }
  if (model.audioNeedsVisual && count("audio") > 0 && count("reference") === 0 && count("video") === 0) {
    return `${model.label} needs a reference image or clip alongside audio.`;
  }
  return null;
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
