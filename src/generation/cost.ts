import type { ModelEntry } from "./catalog/types";

/** USD one result should cost: a flat per-result price, or the model's
    published per-second rate times the length of its source video. The platform's responses carry no price, so
    this is an estimate: null when the model has no known rate or there is no
    source to measure. */
export function estimateCost(
  model: ModelEntry,
  settings: Record<string, unknown>,
  sourceSeconds: number | null,
): number | null {
  if (model.perResultUsd) return model.perResultUsd(settings);
  if (!model.perSecondUsd || sourceSeconds === null) return null;
  const rate = model.perSecondUsd[String(settings.resolution)];
  if (rate === undefined) return null;
  /* Billed per started second. */
  return Math.ceil(sourceSeconds) * rate;
}

export function formatUsd(amount: number): string {
  /* Image prices sit well under a cent; two places would round them to $0.00. */
  return `$${amount.toFixed(amount < 0.1 ? 3 : 2)}`;
}

/** Reads a video's length from its metadata alone; null if it will not load
    in time, so a slow CDN never holds up a press. */
export function videoSeconds(url: string, timeoutMs = 4000): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;
    const timer = setTimeout(() => done(null), timeoutMs);
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}
