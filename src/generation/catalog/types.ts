export type Surface = "image" | "video";
export type MediaRole = "start" | "end" | "reference" | "video" | "audio";

export type MediaItem = {
  id: string;
  url: string;
  role: MediaRole;
};

export type SettingField =
  | { type: "enum"; values: readonly string[]; default: string }
  | { type: "range"; min: number; max: number; default: number; step?: number }
  | { type: "boolean"; default: boolean };

export type PlatformPaths = {
  text?: string;
  image?: string;
  firstLast?: string;
  reference?: string;
  /** The image path's schema also takes aspect_ratio. Most image-to-video
      schemas take the ratio from the frame and reject or ignore the field. */
  aspectOnImage?: boolean;
  /** Fields every request to this model carries, whatever the path. */
  fixed?: Record<string, unknown>;
};

export type ModelEntry = {
  id: string;
  surface: Surface;
  label: string;
  roles: Partial<Record<MediaRole, number>>;
  settings: Record<string, SettingField>;
  /** Submit paths when the shared mapper is enough. Soul, Kling 3, and Seedance keep custom maps. */
  paths?: PlatformPaths;
  /** Media roles a request cannot be made without. */
  required?: readonly MediaRole[];
  /** Audio rides along with an image or clip reference; the schema rejects it alone. */
  audioNeedsVisual?: boolean;
  /** Frames go to image-to-video and references to reference-to-video; the two
      cannot share one request. */
  framesExclusive?: boolean;
  /** The schema's maxLength for prompt, where it declares one. */
  promptMax?: number;
};

export type GenerationPlane = {
  model: string;
  prompt: { text: string };
  media: Partial<Record<MediaRole, MediaItem[]>>;
  settings: Record<string, unknown>;
};
