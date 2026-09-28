export const PLATFORM_KEY_COOKIE = "api_key";

export const PLATFORM_KEY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export const MISSING_KEY_MESSAGE = "Connect your API key to generate.";

export class MissingCredentialsError extends Error {
  constructor() {
    super(MISSING_KEY_MESSAGE);
    this.name = "MissingCredentialsError";
  }
}

export function encodeCredentials(apiKey: string): string {
  return JSON.stringify({ apiKey });
}

export function decodeCredentials(raw: string | undefined): { apiKey: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const apiKey = (parsed as { apiKey?: unknown }).apiKey;
    if (typeof apiKey !== "string") return null;
    return { apiKey: normalizeKey(apiKey) };
  } catch {
    return null;
  }
}

export function parseCredentialInput(data: unknown): { apiKey: string } {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Paste your API key");
  }
  const record = data as { apiKey?: unknown; api_key?: unknown };
  const apiKey = record.apiKey ?? record.api_key;
  if (typeof apiKey !== "string") throw new Error("Paste your API key");
  return { apiKey: normalizeKey(apiKey) };
}

/** The value goes out as `Authorization: Key <api-key>` — the complete
    credential copied from open.higgsfield.ai, sent exactly as copied. */
export function toAuthorizationHeader(apiKey: string): string {
  return `Key ${normalizeKey(apiKey)}`;
}

/* Only the surrounding whitespace a paste drags along is trimmed. The key is
   otherwise opaque: no shape is assumed beyond what an HTTP header can carry. */
function normalizeKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("Paste your API key");
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed) || !/^[\x20-\x7e]+$/.test(trimmed)) {
    throw new Error("That doesn't look like a complete API key — copy it again from open.higgsfield.ai and paste it as-is.");
  }
  if (trimmed.length > 1024) throw new Error("That key is longer than any API key — paste only the key.");
  return trimmed;
}
