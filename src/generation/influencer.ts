/** AI Influencer's appearance choices, kept as one setting value: the
    character type they were picked for plus category → option keys. Picks made
    for another type are dropped rather than sent, since the platform rejects
    stale keys. */
export type InfluencerTraits = { tier: string; selection: Record<string, string[]> };

export type InfluencerOption = {
  key: string;
  label: string;
  img: string | null;
  color: string | null;
  tiers: string[] | null;
  slot: string | null;
  exclusive: boolean;
};

export type InfluencerCategory = {
  key: string;
  label: string;
  tiers: string[];
  max: number;
  options: InfluencerOption[];
};

export function decodeTraits(value: unknown): InfluencerTraits | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value) as { tier?: unknown; selection?: unknown };
    if (typeof parsed.tier !== "string" || !parsed.selection || typeof parsed.selection !== "object") return null;
    const selection: Record<string, string[]> = {};
    for (const [key, picks] of Object.entries(parsed.selection as Record<string, unknown>)) {
      if (!Array.isArray(picks)) continue;
      const keys = picks.filter((pick): pick is string => typeof pick === "string" && pick.length <= 64);
      if (keys.length) selection[key.slice(0, 64)] = keys.slice(0, 10);
    }
    return { tier: parsed.tier, selection };
  } catch {
    return null;
  }
}

export function encodeTraits(traits: InfluencerTraits): string {
  const selection = Object.fromEntries(Object.entries(traits.selection).filter(([, picks]) => picks.length));
  return Object.keys(selection).length ? JSON.stringify({ tier: traits.tier, selection }) : "";
}

/** The selection to send for this character type, or none. */
export function selectionFor(value: unknown, tier: string): Record<string, string[]> | null {
  const traits = decodeTraits(value);
  if (!traits || traits.tier !== tier || !Object.keys(traits.selection).length) return null;
  return traits.selection;
}

export function traitCount(value: unknown, tier: string): number {
  const selection = selectionFor(value, tier);
  return selection ? Object.values(selection).reduce((sum, picks) => sum + picks.length, 0) : 0;
}
