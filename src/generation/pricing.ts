/* Published Higgsfield API prices in USD, regular (undiscounted) rates, read
   from each model's page on console.higgsfield.ai. The platform's responses
   carry no price, so everything here is an estimate: a model or setting with
   no published price has no entry and shows none.

   Where a page lists two rates with no word on which applies (some Kling
   models, likely without and with audio), the estimate is the range. */

/** `upTo` marks a ceiling borrowed from the nearest published price, for
    settings the platform lists none for. */
export type Cost = { usd: number; max?: number; upTo?: boolean };

type Settings = Record<string, unknown>;

type Pricer = {
  /** Priced from the length of the attached source video. */
  source?: boolean;
  price: (settings: Settings, sourceSeconds: number | null) => Cost | null;
};

const flat = (usd: number | undefined): Cost | null => (usd === undefined ? null : { usd });

/** A per-result price looked up by a settings key, falling back to a ceiling
    where one is known for settings with no published price. */
const perResult = (
  table: Record<string, number>,
  key: (settings: Settings) => string,
  ceiling: (settings: Settings) => number | undefined = () => undefined,
): Pricer => ({
  price: (settings) => {
    const exact = table[key(settings)];
    if (exact !== undefined) return { usd: exact };
    const cap = ceiling(settings);
    return cap === undefined ? null : { usd: cap, upTo: true };
  },
});

/** Prices a cheaper variant by its full model's price, as a ceiling. */
const atMost = (pricer: Pricer): Pricer => ({
  source: pricer.source,
  price: (settings, sourceSeconds) => {
    const cost = pricer.price(settings, sourceSeconds);
    return cost && { ...cost, upTo: true };
  },
});
const resolutionOf = (settings: Settings) => String(settings.resolution);

/** Billed per started second of the requested duration. */
function perSecond(rates: (settings: Settings) => number | [number, number] | undefined): Pricer {
  return {
    price: (settings) => {
      const rate = rates(settings);
      const seconds = Number(settings.duration);
      if (rate === undefined || !Number.isFinite(seconds)) return null;
      return spread(rate, Math.ceil(seconds));
    },
  };
}

/** Billed per started second of the source video, times how many seconds of
    video that source makes the platform read and write. */
function perSourceSecond(
  rates: (settings: Settings) => number | [number, number] | undefined,
  billed: (sourceSeconds: number, settings: Settings) => number = (seconds) => seconds,
): Pricer {
  return {
    source: true,
    price: (settings, sourceSeconds) => {
      const rate = rates(settings);
      if (rate === undefined || sourceSeconds === null) return null;
      return spread(rate, billed(Math.ceil(sourceSeconds), settings));
    },
  };
}

function spread(rate: number | [number, number], seconds: number): Cost {
  return Array.isArray(rate)
    ? { usd: rate[0] * seconds, max: rate[1] * seconds }
    : { usd: rate * seconds };
}

const byResolution =
  (table: Record<string, number>) =>
  (settings: Settings): number | undefined =>
    table[String(settings.resolution)];

/* Seedance 2.0 is billed per 1,000 video tokens, seconds × width × height ×
   24 / 1024. Rates below are that per second at 16:9. */
const seedance2Rate = (width: number, height: number, per1k: number) =>
  ((width * height * 24) / 1024 / 1000) * per1k;

const seedance2 = perSecond(
  byResolution({
    "480p": seedance2Rate(854, 480, 0.014),
    "720p": seedance2Rate(1280, 720, 0.014),
    "1080p": seedance2Rate(1920, 1080, 0.014),
    "4k": seedance2Rate(3840, 2160, 0.008),
  }),
);

const PRICING: Record<string, Pricer> = {
  /* ---------- video ---------- */
  "genjutsu-motion": perSourceSecond(byResolution({ "480p": 0.318, "720p": 0.681 })),
  "genjutsu-swap": perSourceSecond(byResolution({ "480p": 0.318, "720p": 0.681 })),
  /* Token-billed; the page's per-second figures are for 16:9 with no input video. */
  "seedance-2.5": perSecond(byResolution({ "480p": 0.2056, "720p": 0.4622 })),
  /* Billed on the input video plus the video generated: an edit writes as
     much as it reads, an extension writes the requested duration. */
  "seedance-2.5-edit": perSourceSecond(
    byResolution({ "480p": 0.1234, "720p": 0.2773 }),
    (seconds) => seconds * 2,
  ),
  "seedance-2.5-extend": perSourceSecond(
    byResolution({ "480p": 0.1234, "720p": 0.2773 }),
    (seconds, settings) => seconds + Math.ceil(Number(settings.duration) || 0),
  ),
  "seedance-2": seedance2,
  /* Unpriced on the console; the lighter variants cost no more than the full model. */
  "seedance-2-fast": atMost(seedance2),
  "seedance-2-mini": atMost(seedance2),
  "kling-3-turbo": perSecond(byResolution({ "720p": 0.112, "1080p": 0.14 })),
  "kling-3-std": perSecond(() => 0.084),
  "kling-3-pro": perSecond(() => [0.112, 0.168]),
  "kling-3-4k": perSecond(() => 0.42),
  /* The output runs as long as the motion video it copies. */
  "kling-3-motion-std": perSourceSecond(() => 0.126),
  "kling-3-motion-pro": perSourceSecond(() => 0.168),
  "kling-2.6": perSecond(() => [0.07, 0.14]),
  "kling-2.5": perSecond(() => 0.042),
  "kling-o3": perSecond(() => 0.084),
  "kling-o1": perSecond(() => [0.084, 0.112]),
  "wan-3": perSecond(byResolution({ "720p": 0.1, "1080p": 0.2 })),
  "wan-3-prime": perSecond(byResolution({ "720p": 0.14, "1080p": 0.28 })),
  "wan-2.7": perSecond(byResolution({ "720p": 0.1, "1080p": 0.15 })),
  "wan-2.6": perSecond(byResolution({ "720p": 0.1, "1080p": 0.15 })),
  "happy-horse-1": perSecond(byResolution({ "720p": 0.14, "1080p": 0.28 })),
  "happy-horse-1.1": perSecond(byResolution({ "720p": 0.14, "1080p": 0.18 })),
  "minimax-h3": perSecond(() => 0.13),
  /* Sold as 6s and 10s clips. */
  "minimax-hailuo-2.3": {
    price: (settings) => flat(Number(settings.duration) <= 6 ? 0.28 : 0.56),
  },
  "ltx-2.5-fast": perSecond(byResolution({ "720p": 0.09, "1080p": 0.13 })),
  "ltx-2.5-pro": perSecond(byResolution({ "720p": 0.12, "1080p": 0.17 })),
  "grok-imagine-video-1.5": perSecond(byResolution({ "720p": 0.14, "1080p": 0.25 })),

  /* ---------- image, per result ---------- */
  "soul-2": perResult({ "720p": 0.0032, "1080p": 0.0057 }, resolutionOf),
  /* Only three combinations are published; the preset mode costs 10% more but is not wired. */
  "marketing-studio-image": perResult(
    { "1k/low": 0.0162, "2k/low": 0.0222, "4k/high": 0.7219 },
    (settings) => `${settings.resolution}/${settings.quality}`,
    /* 4K at high quality is the dearest combination, so it caps the rest. */
    () => 0.7219,
  ),
  /* Published as 1k at low quality and 2k at medium; the request sets no quality. */
  "grok-imagine-2": perResult({ "1k": 0.04, "2k": 0.08 }, resolutionOf),
  "ideogram-4": { price: () => flat(0.03) },
  /* 2k is sold as Recraft 4.1 Pro, a separate model. */
  "recraft-4.1": perResult({ "1k": 0.035 }, resolutionOf, (settings) =>
    settings.resolution === "2k" ? 0.21 : undefined,
  ),
  "qwen-image-3": perResult({ "1k": 0.04, "2k": 0.075 }, resolutionOf),
  "z-image-turbo": perResult({ "1k": 0.015, "2k": 0.015 }, resolutionOf),
};

/** Whether this model is priced from the length of its source video. */
export function pricedFromSource(modelId: string): boolean {
  return PRICING[modelId]?.source === true;
}

/** Estimated USD for one result, or null when no price is published. */
export function estimateCost(
  modelId: string,
  settings: Settings,
  sourceSeconds: number | null,
): Cost | null {
  return PRICING[modelId]?.price(settings, sourceSeconds) ?? null;
}

/** Records written before ranges existed stored a bare number. */
export function asCost(stored: Cost | number | undefined): Cost | undefined {
  return typeof stored === "number" ? { usd: stored } : stored;
}

export function scaleCost(cost: Cost, by: number): Cost {
  return {
    ...cost,
    usd: cost.usd * by,
    ...(cost.max === undefined ? {} : { max: cost.max * by }),
  };
}

export function formatUsd(amount: number): string {
  /* Image prices sit well under a cent; two places would round them to $0.00. */
  return `$${amount.toFixed(amount < 0.1 ? 3 : 2)}`;
}

/** "≈ $0.42", "≈ $0.56–$0.84", or "≤ $0.72" for a ceiling. */
export function formatCost(cost: Cost): string {
  if (cost.upTo) return `≤ ${formatUsd(cost.max ?? cost.usd)}`;
  return cost.max === undefined || cost.max === cost.usd
    ? `≈ ${formatUsd(cost.usd)}`
    : `≈ ${formatUsd(cost.usd)}–${formatUsd(cost.max)}`;
}
