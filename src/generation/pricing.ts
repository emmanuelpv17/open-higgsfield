import type { MediaRole } from "./catalog/types";
import { presetId } from "./presets";

/* Published Higgsfield API prices in USD, regular (undiscounted) rates, read
   from each model's page on console.higgsfield.ai. The platform's responses
   carry no price, so everything here is an estimate: a model or setting with
   no published price has no entry and shows none.

   Where a page lists two rates with no word on which applies (some Kling
   models, likely without and with audio), the estimate is the range.

   Every model shows a figure. Where the console publishes none, the figure
   is borrowed from the nearest published price and marked `approx`: a
   dearer combination of the same model, the full model for a lighter
   variant, or a comparable model where the console lists nothing at all.
   4K images the console never prices are taken as twice the 2K price. */

/** `approx` marks a figure borrowed from the nearest published price, for a
    model or settings the platform lists none for. */
export type Cost = { usd: number; max?: number; approx?: boolean };

type Settings = Record<string, unknown>;

/** The run's attachments by role. Some models send a run to another endpoint,
    at another rate or a capped duration, by what is attached. */
export type Attached = Partial<Record<MediaRole, readonly unknown[]>>;

type Pricer = {
  /** Priced from the length of the attached source video. */
  source?: boolean;
  price: (settings: Settings, sourceSeconds: number | null, media: Attached) => Cost | null;
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
    return cap === undefined ? null : { usd: cap, approx: true };
  },
});

/** Prices a model the console lists nothing for by a comparable one. */
const borrowed = (pricer: Pricer): Pricer => ({
  source: pricer.source,
  price: (settings, sourceSeconds, media) => {
    const cost = pricer.price(settings, sourceSeconds, media);
    return cost && { ...cost, approx: true };
  },
});

const resolutionOf = (settings: Settings) => String(settings.resolution);

const has = (media: Attached, role: MediaRole) => (media[role]?.length ?? 0) > 0;

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
  <Rate extends number | [number, number]>(table: Record<string, Rate>) =>
  (settings: Settings): Rate | undefined =>
    table[String(settings.resolution)];

/* Kling's O-series pages publish std and pro rates; 4K is priced as Kling 3.0 4K. */
const byMode =
  (table: Record<string, number>) =>
  (settings: Settings): number | undefined =>
    table[String(settings.mode)];

/* Priced on the endpoint mapKlingOmni picks: a start frame goes to first/last
   frame, which Omni sells as 5s or 10s clips; a video, to video reference,
   which renders std or pro for at most 10s and bills 0.126–0.168/s. */
const klingVideoReference = perSecond((settings) => (settings.mode === "std" ? 0.126 : 0.168));

function klingOmni(rates: Record<string, number>, framesFiveOrTen: boolean): Pricer {
  const base = perSecond(byMode(rates));
  return {
    price: (settings, sourceSeconds, media) => {
      const duration = Number(settings.duration);
      if (has(media, "start")) {
        const frames = framesFiveOrTen ? { ...settings, duration: duration <= 7 ? 5 : 10 } : settings;
        return base.price(frames, sourceSeconds, media);
      }
      if (has(media, "video")) {
        return klingVideoReference.price({ ...settings, duration: Math.min(duration, 10) }, sourceSeconds, media);
      }
      return base.price(settings, sourceSeconds, media);
    },
  };
}

/* A reference run, with no start frame, is sent for at most 10 seconds. */
function wan2(referenceRoles: readonly MediaRole[]): Pricer {
  const base = perSecond(byResolution({ "720p": 0.1, "1080p": 0.15 }));
  return {
    price: (settings, sourceSeconds, media) =>
      !has(media, "start") && referenceRoles.some((role) => has(media, role))
        ? base.price({ ...settings, duration: Math.min(Number(settings.duration), 10) }, sourceSeconds, media)
        : base.price(settings, sourceSeconds, media),
  };
}

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

/* Three combinations are published; 4K at high is the dearest, so it stands in
   for the rest. A preset costs 10% more than the same request without one, and
   is priced at high quality where the request forces it. */
function marketingStudio(approx: boolean, presetForcesHigh: boolean): Pricer {
  const base = perResult(
    { "1k/low": 0.0162, "2k/low": 0.0222, "4k/high": 0.7219 },
    (settings) =>
      `${settings.resolution}/${presetForcesHigh && presetId(settings.preset) ? "high" : settings.quality}`,
    () => 0.7219,
  );
  return {
    price: (settings, seconds, media) => {
      const cost = base.price(settings, seconds, media);
      if (!cost) return null;
      const usd = presetId(settings.preset) ? cost.usd * 1.1 : cost.usd;
      return { ...cost, usd, ...(approx ? { approx: true } : {}) };
    },
  };
}

/* 1080p is not priced on the console; 720p's rate stands in as a floor. */
const genjutsuLight = perSourceSecond(
  byResolution<[number, number]>({ "480p": [0.05, 0.1], "720p": [0.1, 0.2], "1080p": [0.2, 0.4] }),
  (seconds) => Math.min(seconds, 15),
);
/* Sources past 30 seconds are trimmed. */
const genjutsu = perSourceSecond(
  byResolution({ "480p": 0.318, "720p": 0.681, "1080p": 0.681 }),
  (seconds) => Math.min(seconds, 30),
);

const PRICING: Record<string, Pricer> = {
  /* ---------- video ---------- */
  "genjutsu-motion": genjutsu,
  "genjutsu-swap": genjutsu,
  /* Restyle publishes no price of its own; Genjutsu's rates stand in. */
  "genjutsu-restyle": borrowed(genjutsu),
  /* Published as $0.05/$0.10/$0.20 per billed second (source + output) at
     480p/720p/1080p, but listed at half that elsewhere; both bounds are shown.
     Only the first 15 seconds of the source are read. */
  "genjutsu-light-motion": genjutsuLight,
  "genjutsu-light-swap": genjutsuLight,
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
  "seedance-2-fast": borrowed(seedance2),
  "seedance-2-mini": borrowed(seedance2),
  "kling-3-turbo": perSecond(byResolution({ "720p": 0.112, "1080p": 0.14 })),
  /* Text-to-video lists 0.084; image-to-video lists 0.084 and 0.126. */
  "kling-3-std": perSecond(() => [0.084, 0.126]),
  "kling-3-pro": perSecond(() => [0.112, 0.168]),
  "kling-3-4k": perSecond(() => 0.42),
  /* The output runs as long as the motion video it copies. */
  "kling-3-motion-std": perSourceSecond(() => 0.126),
  "kling-3-motion-pro": perSourceSecond(() => 0.168),
  "kling-2.6": perSecond(() => [0.07, 0.14]),
  "kling-2.6-motion-std": perSourceSecond(() => 0.07),
  "kling-2.6-motion-pro": perSourceSecond(() => 0.112),
  /* Token-billed like Seedance at $0.0214 per 1,000 tokens (16:9 figures
     below); 0.6x that with a video reference, which this does not discount. */
  "cinema-studio-4": perSecond(byResolution({ "480p": 0.2056, "720p": 0.4622 })),
  "kling-2.5": perSecond(() => 0.042),
  "kling-2.5-pro": perSecond(() => 0.07),
  "kling-o3": klingOmni({ std: 0.084, pro: 0.112, "4k": 0.42 }, false),
  "kling-o1": klingOmni({ std: 0.084, pro: 0.112 }, true),
  "kling-o3-edit": perSourceSecond(() => 0.126),
  "kling-o1-edit": perSourceSecond(() => 0.126),
  "wan-3": perSecond(byResolution({ "480p": 0.05, "720p": 0.1, "1080p": 0.2 })),
  "wan-3-prime": perSecond(byResolution({ "480p": 0.068, "720p": 0.14, "1080p": 0.28 })),
  "wan-2.7": wan2(["reference", "video"]),
  "wan-2.6": wan2(["video"]),
  "happy-horse-1": perSecond(byResolution({ "720p": 0.14, "1080p": 0.28 })),
  "happy-horse-1.1": perSecond(byResolution({ "720p": 0.14, "1080p": 0.18 })),
  "minimax-h3": perSecond(() => 0.13),
  /* Sold as 6s and 10s clips. */
  "minimax-hailuo-2.3": {
    price: (settings) => flat(Number(settings.duration) <= 6 ? 0.28 : 0.56),
  },
  "ltx-2.5-fast": perSecond(byResolution({ "720p": 0.09, "1080p": 0.13, "2k": 0.19, "4k": 0.3 })),
  "ltx-2.5-pro": perSecond(byResolution({ "720p": 0.12, "1080p": 0.17 })),
  "grok-imagine-video-1.5": perSecond(byResolution({ "480p": 0.08, "720p": 0.14, "1080p": 0.25 })),
  /* Not on the console: priced like the nearest comparable models. */
  "flux-3": borrowed(perSecond(byResolution({ "720p": 0.1, "1080p": 0.15 }))), // as Wan 2.7
  "pixverse-6": borrowed(perSecond(byResolution({ "360p": 0.1, "540p": 0.1, "720p": 0.1, "1080p": 0.15 }))), // as Wan 2.6
  dop: borrowed(perSecond(() => 0.084)), // as Kling 3.0 Std

  /* ---------- image, per result ---------- */
  "soul-2": perResult({ "720p": 0.0032, "1080p": 0.0057 }, resolutionOf),
  "soul-standard": perResult({ "720p": 0.0938, "1080p": 0.1875 }, resolutionOf),
  /* Not on the console; Soul Standard's prices stand in. */
  "soul-cinema": borrowed(perResult({ "720p": 0.0938, "1080p": 0.1875 }, resolutionOf)),
  /* 2.0 renders every preset at high quality. */
  "marketing-studio-image": marketingStudio(false, true),
  /* The 2.5 versions publish only a range; 2.0's prices stand in. */
  "marketing-studio-flare": marketingStudio(true, false),
  "marketing-studio-sunburst": marketingStudio(true, false),
  /* Published as 1k at low quality and 2k at medium; the request sets no quality. */
  "grok-imagine-2": perResult({ "1k": 0.04, "2k": 0.08 }, resolutionOf),
  /* Not on the console: priced like Qwen Image 3. */
  "flux-2": borrowed(perResult({ "1k": 0.04, "2k": 0.075, "4k": 0.15 }, resolutionOf)),
  "ideogram-4": { price: () => flat(0.03) },
  "ai-influencer": { price: () => flat(0.05) },
  /* 1k on the base endpoint, 2k on its Pro sibling. */
  "recraft-4.1": perResult({ "1k": 0.035, "2k": 0.21 }, resolutionOf),
  "recraft-4.1-utility": perResult({ "1k": 0.035, "2k": 0.21 }, resolutionOf),
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
  media: Attached = {},
): Cost | null {
  return PRICING[modelId]?.price(settings, sourceSeconds, media) ?? null;
}

/** What each second of source video adds, for a model priced from its source.
    An extension's own duration is billed once on top, not per source second. */
export function costPerSourceSecond(modelId: string, settings: Settings, media: Attached = {}): Cost | null {
  const one = estimateCost(modelId, settings, 1, media);
  const two = estimateCost(modelId, settings, 2, media);
  if (!one || !two) return null;
  return {
    ...one,
    usd: two.usd - one.usd,
    ...(one.max === undefined || two.max === undefined ? {} : { max: two.max - one.max }),
  };
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

/** "≈ $0.42" or "≈ $0.56–$0.84". A borrowed figure reads the same. */
export function formatCost(cost: Cost): string {
  return cost.max === undefined || cost.max === cost.usd
    ? `≈ ${formatUsd(cost.usd)}`
    : `≈ ${formatUsd(cost.usd)}–${formatUsd(cost.max)}`;
}
