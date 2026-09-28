"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { getModel, parseSettings, planeProblem } from "./catalog";
import type { GenerationPlane, MediaItem, MediaRole } from "./catalog/types";
import {
  MISSING_KEY_MESSAGE,
  PLATFORM_KEY_COOKIE,
  PLATFORM_KEY_COOKIE_OPTIONS,
  decodeCredentials,
  encodeCredentials,
  parseCredentialInput,
} from "./credentials";
import {
  DEFAULT_API_BASE_URL,
  PlatformError,
  UPLOAD_CONTENT_TYPES,
  createPlatformClient,
  isRequestId,
  type ErrorCode,
  type StatusResult,
  type UploadTarget,
} from "./platform";
import { toPlatform } from "./to-platform";

/* Server actions return their failures rather than throw them: a production
   build replaces a thrown error's message with a generic digest, and the
   studio needs the reason — a rejected key, no credits — to say what to do. */
export type Failure = { ok: false; error: string; code: ErrorCode };
export type Result<T> = ({ ok: true } & T) | Failure;

export async function savePlatformCredentials(data: unknown): Promise<Result<object>> {
  try {
    const { apiKey } = parseCredentialInput(data);
    const jar = await cookies();
    jar.set(PLATFORM_KEY_COOKIE, encodeCredentials(apiKey), PLATFORM_KEY_COOKIE_OPTIONS);
    return { ok: true };
  } catch (caught) {
    return failure(caught, "invalid_key");
  }
}

export async function clearPlatformCredentials(): Promise<void> {
  const jar = await cookies();
  jar.set(PLATFORM_KEY_COOKIE, "", { ...PLATFORM_KEY_COOKIE_OPTIONS, maxAge: 0 });
}

export async function hasPlatformCredentials(): Promise<boolean> {
  return (await readStoredCredentials()) !== null;
}

/** One press slot, submitted once. The id comes from the composer; a second
    call carrying the same id — a double-fired action, a replay — gets the
    first call's answer instead of a second paid POST. */
export async function submitGeneration(data: unknown): Promise<Result<{ requestId: string }>> {
  try {
    const { plane, submissionId } = parseSubmission(data);
    const model = getModel(plane.model);
    const parsed: GenerationPlane = { ...plane, settings: parseSettings(model, plane.settings) };
    const problem = planeProblem(model, parsed);
    if (problem) return { ok: false, error: problem, code: "invalid_input" };
    const { path, body } = toPlatform(parsed);

    const credentials = await readCredentials();
    const key = `${fingerprint(credentials.apiKey)}:${submissionId}`;
    const existing = recentSubmissions.get(key);
    if (existing) return existing.result;

    const result = createPlatformClient(credentials)
      .submit(path, body)
      .then(
        (queued): Result<{ requestId: string }> => ({ ok: true, requestId: queued.requestId }),
        (caught: unknown) => failure(caught, "server"),
      );
    rememberSubmission(key, result);
    return result;
  } catch (caught) {
    return failure(caught, "invalid_input");
  }
}

/** Every request in flight, answered in one round trip. Next dispatches server
    actions one at a time per client, so a poll per run would queue ahead of the
    next submit — the fan-out belongs on this side of the call, where it is
    genuinely parallel. */
export async function getGenerationStatuses(data: unknown): Promise<Result<{ results: StatusResult[] }>> {
  try {
    const requestIds = parseRequestIds(data);
    const client = createPlatformClient(await readCredentials());
    const results = await Promise.all(
      requestIds.map(async (requestId): Promise<StatusResult> => {
        try {
          return { requestId, status: await client.status(requestId) };
        } catch (caught) {
          const { error, code } = failure(caught, "server");
          return { requestId, error, code, retryable: code === "server" || code === "network" };
        }
      }),
    );
    return { ok: true, results };
  } catch (caught) {
    return failure(caught, "invalid_input");
  }
}

/** Asks the platform to cancel. Only queued work can be; the status poll then
    reports `canceled`, which is what settles the tile. */
export async function cancelGeneration(data: unknown): Promise<Result<object>> {
  try {
    const requestId = asObject(data, "Invalid cancel payload").requestId;
    if (!isRequestId(requestId)) throw new Error("Invalid request id");
    await createPlatformClient(await readCredentials()).cancel(requestId);
    return { ok: true };
  } catch (caught) {
    return failure(caught, "invalid_input");
  }
}

/** A signed, single-use storage URL for one reference file. The browser PUTs
    the file itself; the API key never travels with it. */
export async function createUploadTarget(data: unknown): Promise<Result<{ target: UploadTarget }>> {
  try {
    const contentType = asObject(data, "Invalid upload payload").contentType;
    if (typeof contentType !== "string" || !(UPLOAD_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      return {
        ok: false,
        error: "That file type can't be uploaded. Use JPEG, PNG, WebP, GIF, MP4 or WAV.",
        code: "invalid_input",
      };
    }
    const target = await createPlatformClient(await readCredentials()).createUploadUrl(contentType);
    return { ok: true, target };
  } catch (caught) {
    return failure(caught, "server");
  }
}

/* ---------- internals ---------- */

class MissingKey extends Error {}

async function readStoredCredentials() {
  const jar = await cookies();
  return decodeCredentials(jar.get(PLATFORM_KEY_COOKIE)?.value);
}

async function readCredentials() {
  const stored = await readStoredCredentials();
  if (!stored) throw new MissingKey(MISSING_KEY_MESSAGE);
  const baseUrl = process.env.HF_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
  return { ...stored, baseUrl };
}

function failure(caught: unknown, fallback: ErrorCode): Failure {
  if (caught instanceof MissingKey) return { ok: false, error: caught.message, code: "missing_key" };
  if (caught instanceof PlatformError) {
    const ref = caught.correlationId ? ` (ref ${caught.correlationId})` : "";
    return { ok: false, error: `${caught.message}${caught.code === "server" ? ref : ""}`, code: caught.code };
  }
  return { ok: false, error: caught instanceof Error ? caught.message : String(caught), code: fallback };
}

/* Submissions answered in the last few minutes, per key. In-memory, so it
   covers a replay reaching the same server instance — the client's own
   one-shot slots are the first line. */
const SUBMISSION_TTL_MS = 10 * 60_000;
const MAX_SUBMISSIONS = 500;
const recentSubmissions = new Map<string, { at: number; result: Promise<Result<{ requestId: string }>> }>();

function rememberSubmission(key: string, result: Promise<Result<{ requestId: string }>>) {
  const now = Date.now();
  for (const [entry, value] of recentSubmissions) {
    if (now - value.at > SUBMISSION_TTL_MS || recentSubmissions.size >= MAX_SUBMISSIONS) {
      recentSubmissions.delete(entry);
    } else {
      break;
    }
  }
  recentSubmissions.set(key, { at: now, result });
}

function fingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 32);
}

const ROLES: readonly MediaRole[] = ["start", "end", "reference", "video", "audio"];
const SUBMISSION_ID = /^[A-Za-z0-9-]{8,64}$/;

/* The plane arrives from the browser, so every field is checked for shape here
   before the catalog checks it for meaning. */
function parseSubmission(data: unknown): { plane: GenerationPlane; submissionId: string } {
  const payload = asObject(data, "Invalid generation payload");
  const submissionId = payload.submissionId;
  if (typeof submissionId !== "string" || !SUBMISSION_ID.test(submissionId)) {
    throw new Error("Invalid submission id");
  }
  const raw = asObject(payload.plane, "Invalid generation payload");
  if (typeof raw.model !== "string") throw new Error("Invalid model");
  const prompt = asObject(raw.prompt, "Invalid prompt");
  if (typeof prompt.text !== "string") throw new Error("Invalid prompt");
  const settings = asObject(raw.settings ?? {}, "Invalid settings");
  const rawMedia = asObject(raw.media ?? {}, "Invalid media");
  const media: GenerationPlane["media"] = {};
  for (const [role, items] of Object.entries(rawMedia)) {
    if (!(ROLES as readonly string[]).includes(role)) throw new Error("Invalid media role");
    if (!Array.isArray(items)) throw new Error("Invalid media");
    media[role as MediaRole] = items.map((item): MediaItem => {
      const entry = asObject(item, "Invalid media");
      if (typeof entry.id !== "string" || typeof entry.url !== "string") throw new Error("Invalid media");
      return { id: entry.id, url: entry.url, role: role as MediaRole };
    });
  }
  return {
    plane: { model: raw.model, prompt: { text: prompt.text }, media, settings },
    submissionId,
  };
}

function parseRequestIds(data: unknown): string[] {
  const requestIds = asObject(data, "Invalid status payload").requestIds;
  if (!Array.isArray(requestIds) || requestIds.length === 0 || requestIds.length > 100) {
    throw new Error("Invalid request ids");
  }
  return requestIds.map((requestId) => {
    if (!isRequestId(requestId)) throw new Error("Invalid request id");
    return requestId;
  });
}

function asObject(data: unknown, message: string): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error(message);
  return data as Record<string, unknown>;
}
