/* A Marketing Studio preset is stored in settings as "<uuid>::<name>", so the
   pill can name it after a reload without asking the platform again. An empty
   value is direct mode. */

export type MarketingPreset = { id: string; type: string; name: string };

export function encodePreset(preset: MarketingPreset): string {
  return `${preset.id}::${preset.name}`;
}

export function presetId(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const id = value.split("::")[0]!;
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function presetName(value: unknown): string | null {
  if (!presetId(value)) return null;
  return String(value).split("::").slice(1).join("::") || "Preset";
}
