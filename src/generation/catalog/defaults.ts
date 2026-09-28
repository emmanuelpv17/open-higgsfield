import type { MediaRole, ModelEntry, PlatformPaths } from "./types";

const IMAGE_ASPECT = ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"] as const;
const VIDEO_ASPECT = ["16:9", "9:16", "1:1"] as const;

/** Text path plus its image-to-video sibling, which sits under the same prefix:
    ".../text-to-video" → ".../image-to-video", and
    ".../text-to-video/fast" → ".../image-to-video/fast". */
export function t2v(path: string, extra: Omit<PlatformPaths, "text" | "image"> = {}): PlatformPaths {
  if (!/\/text-to-video(\/|$)/.test(path)) return { text: path, ...extra };
  return { text: path, image: path.replace(/\/text-to-video(?=\/|$)/, "/image-to-video"), ...extra };
}

type Extra = Partial<Pick<ModelEntry, "roles" | "settings" | "required" | "promptMax" | "audioNeedsVisual">>;

export function imageModel(id: string, label: string, paths: PlatformPaths, extra: Extra = {}): ModelEntry {
  return {
    id,
    surface: "image",
    label,
    roles: { reference: 8 },
    settings: {
      aspectRatio: { type: "enum", values: IMAGE_ASPECT, default: "1:1" },
      resolution: { type: "enum", values: ["1k", "2k", "4k"], default: "1k" },
    },
    paths,
    ...extra,
  };
}

export function videoModel(
  id: string,
  label: string,
  roles: Partial<Record<MediaRole, number>>,
  paths: PlatformPaths,
  extra: Omit<Extra, "roles"> = {},
): ModelEntry {
  return {
    id,
    surface: "video",
    label,
    roles,
    settings: {
      aspectRatio: { type: "enum", values: VIDEO_ASPECT, default: "16:9" },
      resolution: { type: "enum", values: ["720p", "1080p"], default: "720p" },
      duration: { type: "range", min: 4, max: 10, default: 5 },
    },
    paths,
    ...extra,
  };
}
