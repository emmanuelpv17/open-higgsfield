import type { ModelEntry } from "./types";

export function parseSettings(
  model: ModelEntry,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(model.settings)) {
    const value = raw[key];
    if (field.type === "enum") {
      const picked = typeof value === "string" ? value : field.default;
      if (!field.values.includes(picked)) throw new Error(`Invalid ${key}`);
      out[key] = picked;
      continue;
    }
    if (field.type === "range") {
      const picked = typeof value === "number" ? value : field.default;
      if (picked < field.min || picked > field.max) throw new Error(`Invalid ${key}`);
      out[key] = picked;
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
