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
  | { type: "boolean"; default: boolean }
  /** A value chosen from a list the platform serves at run time. */
  | { type: "preset"; default: ""; source: PresetSource }
  /** AI Influencer's appearance picks, from the catalog the platform serves. */
  | { type: "traits"; default: "" };

/** Where a preset setting's list comes from. */
export type PresetSource =
  | "marketing-studio"
  | "genjutsu-restyle"
  /** The visitor's own Soul ID characters, trained for one Soul version. */
  | "soul-id-v1"
  | "soul-id-v2"
  | "soul-id-cinema";

export type PlatformPaths = {
  text?: string;
  image?: string;
  firstLast?: string;
  reference?: string;
};

export type ModelEntry = {
  id: string;
  surface: Surface;
  label: string;
  roles: Partial<Record<MediaRole, number>>;
  settings: Record<string, SettingField>;
  /** Media the endpoint cannot run without; a run missing one is refused before it is sent. */
  requires?: readonly MediaRole[];
  /** Names a role carries on this model when the generic one would mislead. */
  roleLabels?: Partial<Record<MediaRole, string>>;
  /** The model runs without a prompt; the text, when given, is extra direction. */
  promptOptional?: boolean;
  /** Submit paths when the shared mapper is enough. Soul, Kling 3, and Seedance keep custom maps. */
  paths?: PlatformPaths;
};

export type GenerationPlane = {
  model: string;
  prompt: { text: string };
  media: Partial<Record<MediaRole, MediaItem[]>>;
  settings: Record<string, unknown>;
};
