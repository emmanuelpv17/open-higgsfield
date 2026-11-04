import { createHmac, timingSafeEqual } from "node:crypto";

/* Claude desktop lets a result tile neither save a file nor ask the host
   to, but it does open links. A link to /api/download copies the result
   into the Blob store marked as an attachment and redirects there, so the
   app shows its "Save as". Links are signed with the connector's secret
   and expire, so the route copies nothing on a stranger's say-so. */

const LIFETIME_MS = 24 * 60 * 60 * 1000;
/* Where results live: the platform's CDN and this deployment's Blob store. */
const SOURCE_HOSTS = [/\.cloudfront\.net$/, /(^|\.)higgsfield\.ai$/, /\.blob\.vercel-storage\.com$/];

function key(): string | null {
  const secret = process.env.OPEN_HIGGSFIELD_MCP_SECRET;
  return secret && secret.length >= 24 ? secret : null;
}

function sign(source: string, expires: number, secret: string): string {
  return createHmac("sha256", secret).update(`download\n${source}\n${expires}`).digest("base64url");
}

export function isDownloadSource(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === "https:" && SOURCE_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

/** A signed /api/download link for a result, or null without a secret. */
export function downloadLink(origin: string, source: string, now = Date.now()): string | null {
  const secret = key();
  if (!secret || !isDownloadSource(source)) return null;
  const expires = now + LIFETIME_MS;
  const query = new URLSearchParams({ u: source, e: String(expires), s: sign(source, expires, secret) });
  return `${origin}/api/download?${query}`;
}

/** Whether a link's source, expiry and signature hold. */
export function verifyDownload(source: string, expires: string, signature: string, now = Date.now()): boolean {
  const secret = key();
  const when = Number(expires);
  if (!secret || !isDownloadSource(source) || !Number.isFinite(when) || when < now) return false;
  const expected = Buffer.from(sign(source, when, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A safe file name: letters, digits, dot, dash and underscore, with the
    source's extension. */
export function downloadName(requested: string | null, source: string): string {
  const ext = (new URL(source).pathname.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const base = (requested ?? "")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return `${base || "higgsfield"}.${ext}`;
}
