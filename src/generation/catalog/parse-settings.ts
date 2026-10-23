import type { ModelEntry } from "./types";

/** A value the catalog no longer allows falls back to the default: browsers
    keep settings saved by older builds, and those must not break the studio.
    `strict` refuses it instead, for input that should already be valid. */
export function parseSettings(
  model: ModelEntry,
  raw: Record<string, unknown>,
  { strict = false }: { strict?: boolean } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(model.settings)) {
    const value = raw[key];
    if (field.type === "enum") {
      /* A setting that has since become an enum ("5", "10") was saved as a number. */
      const picked =
        typeof value === "string"
          ? value
          : typeof value === "number" && Number.isFinite(value)
            ? String(value)
            : field.default;
      if (field.values.includes(picked)) out[key] = picked;
      else if (strict) throw new Error(`Invalid ${key}`);
      else out[key] = field.default;
      continue;
    }
    if (field.type === "range") {
      const picked = typeof value === "number" ? value : field.default;
      if (picked >= field.min && picked <= field.max) out[key] = picked;
      else if (strict) throw new Error(`Invalid ${key}`);
      else out[key] = field.default;
      continue;
    }
    if (field.type === "preset") {
      out[key] = typeof value === "string" && value.length <= 300 ? value : field.default;
      continue;
    }
    if (field.type === "traits") {
      out[key] = typeof value === "string" && value.length <= 8000 ? value : field.default;
      continue;
    }
    out[key] = typeof value === "boolean" ? value : field.default;
  }
  return out;
}
