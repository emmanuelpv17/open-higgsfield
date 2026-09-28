import type { ModelEntry, SettingField } from "./types";

/** Strict: the server's check that every value is one the catalog allows. */
export function parseSettings(
  model: ModelEntry,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(model.settings)) {
    const value = raw[key];
    const picked = value === undefined ? field.default : value;
    if (!allows(field, picked)) throw new Error(`Invalid ${key}`);
    out[key] = picked;
  }
  return out;
}

/** Lenient: values remembered in this browser can predate a catalog change, so
    anything the model no longer allows falls back to its default instead of
    breaking the composer. */
export function coerceSettings(
  model: ModelEntry,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(model.settings)) {
    const value = raw[key];
    out[key] = value !== undefined && allows(field, value) ? value : field.default;
  }
  return out;
}

function allows(field: SettingField, value: unknown): boolean {
  if (field.type === "enum") return typeof value === "string" && field.values.includes(value);
  if (field.type === "boolean") return typeof value === "boolean";
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if (value < field.min || value > field.max) return false;
  const step = field.step ?? 1;
  const steps = (value - field.min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}
