import { PlatformError, createPlatformClient } from "./platform";

/* A cookie or a header only shows a key's shape, so the key is tried once on a cheap
   read of its own Soul IDs. Only a 401 refuses it; a 403 (a plan without Soul
   IDs) or a 402 (no balance) still shows the platform knows the key, so it
   counts as a yes. One that works is remembered for a while, by its hash, so
   each upload does not pay a platform round trip. Any other answer, which says
   nothing about the key, or none within a few seconds, throws, and no token
   is issued. */
const KEY_CHECK_TTL_MS = 10 * 60 * 1000;
const KEY_CHECK_TIMEOUT_MS = 5_000;
const workingKeys = new Map<string, number>();

export async function keyWorks(apiKey: string): Promise<boolean> {
  const digest = await sha256(apiKey);
  if ((workingKeys.get(digest) ?? 0) > Date.now()) return true;
  const baseUrl = process.env.HF_API_BASE_URL;
  if (!baseUrl) throw new Error("Missing HF_API_BASE_URL");
  const timed: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS) });
  try {
    await createPlatformClient({ apiKey, baseUrl, fetch: timed }).get("/v1/custom-references/list?page=1&page_size=1");
  } catch (error) {
    if (error instanceof PlatformError && error.status === 401) return false;
    if (!(error instanceof PlatformError && (error.status === 403 || error.status === 402))) throw error;
  }
  if (workingKeys.size > 1000) workingKeys.clear();
  workingKeys.set(digest, Date.now() + KEY_CHECK_TTL_MS);
  return true;
}

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
