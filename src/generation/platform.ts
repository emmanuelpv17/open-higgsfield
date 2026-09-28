import { toAuthorizationHeader } from "./credentials";

export const DEFAULT_API_BASE_URL = "https://api.higgsfield.ai";

const MODEL_ID = /^[a-z0-9][a-z0-9._/-]*$/i;
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
/** A submit that has not answered by now is reported as unknown, never retried:
    the API takes no idempotency key, so a second POST could bill a second run. */
const SUBMIT_TIMEOUT_MS = 60_000;
const READ_TIMEOUT_MS = 30_000;

/** Upload content types the file-upload guide lists. */
export const UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/wav",
  "audio/x-wav",
  "video/mp4",
] as const;

/** What the studio does about a failure — not the wording, which is for people. */
export type ErrorCode =
  | "missing_key"
  | "invalid_key"
  | "credits"
  | "concurrency"
  | "not_found"
  | "unavailable"
  | "invalid_input"
  | "not_cancelable"
  | "ambiguous"
  | "server"
  | "network";

export class PlatformError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly correlationId?: string;

  constructor(status: number, code: ErrorCode, message: string, correlationId?: string) {
    super(message);
    this.name = "PlatformError";
    this.status = status;
    this.code = code;
    this.correlationId = correlationId;
  }

  /** Status reads are safe to repeat; everything else stops the watch. */
  get retryable(): boolean {
    return this.code === "server" || this.code === "network";
  }
}

export type QueuedGeneration = {
  status: string;
  requestId: string;
};

export type GenerationStatus = {
  status: string;
  requestId: string;
  images?: Array<{ url: string }>;
  video?: { url: string };
  error?: unknown;
};

/** One request's answer inside a batched status poll. A request that errors
    carries its reason alone, so it cannot lose the answers standing beside it. */
export type StatusResult =
  | { requestId: string; status: GenerationStatus }
  | { requestId: string; error: string; code: ErrorCode; retryable: boolean };

export type UploadTarget = {
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  publicUrl: string;
};

export type PlatformClientOptions = {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
};

export function isModelId(model: string): boolean {
  return MODEL_ID.test(model) && !model.includes("..");
}

export function isRequestId(requestId: unknown): requestId is string {
  return typeof requestId === "string" && REQUEST_ID.test(requestId);
}

export function createPlatformClient(options: PlatformClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetch ?? fetch;
  const auth = toAuthorizationHeader(options.apiKey);

  /* Logs name the call and its outcome only. Bodies can carry prompts and
     signed storage URLs, and the key never leaves the header. */
  async function send(
    method: "GET" | "POST",
    path: string,
    body: Record<string, unknown> | undefined,
    timeoutMs: number,
    ambiguousOnFailure = false,
  ): Promise<{ status: number; payload: unknown }> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: auth,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (caught) {
      console.warn("[platform] no response", { method, path, reason: errorName(caught) });
      if (ambiguousOnFailure) {
        throw new PlatformError(
          0,
          "ambiguous",
          "Higgsfield didn't answer, so this run may or may not have started. Check your runs on open.higgsfield.ai before generating it again.",
        );
      }
      throw new PlatformError(0, "network", "Couldn't reach Higgsfield. Check the connection and try again.");
    }

    const correlationId = response.headers.get("x-correlation-id") ?? undefined;
    const payload = await readJson(response);
    console.info("[platform]", { method, path, status: response.status, correlationId });
    if (!response.ok) throw errorFor(response.status, payload, correlationId);
    return { status: response.status, payload };
  }

  return {
    async submit(model: string, input: Record<string, unknown>): Promise<QueuedGeneration> {
      if (!isModelId(model)) throw new PlatformError(400, "invalid_input", "Unknown model");
      const { payload } = await send("POST", `/${model}`, input, SUBMIT_TIMEOUT_MS, true);
      return mapQueued(payload);
    },
    async status(requestId: string): Promise<GenerationStatus> {
      if (!isRequestId(requestId)) throw new PlatformError(400, "invalid_input", "Invalid request id");
      const { payload } = await send("GET", `/requests/${requestId}/status`, undefined, READ_TIMEOUT_MS);
      return mapStatus(payload, requestId);
    },
    /** 202 means canceled; a 400 means the platform already started the work. */
    async cancel(requestId: string): Promise<void> {
      if (!isRequestId(requestId)) throw new PlatformError(400, "invalid_input", "Invalid request id");
      try {
        await send("POST", `/requests/${requestId}/cancel`, undefined, READ_TIMEOUT_MS);
      } catch (caught) {
        if (caught instanceof PlatformError && caught.status === 400) {
          throw new PlatformError(
            400,
            "not_cancelable",
            "This run has already started, so it can't be canceled. It will finish on its own.",
            caught.correlationId,
          );
        }
        throw caught;
      }
    },
    async createUploadUrl(contentType: string): Promise<UploadTarget> {
      const { payload } = await send(
        "POST",
        "/files/generate-upload-url",
        { content_type: contentType },
        READ_TIMEOUT_MS,
      );
      return mapUploadTarget(payload);
    },
  };
}

function errorFor(status: number, payload: unknown, correlationId?: string): PlatformError {
  const detail = detailOf(payload);
  const make = (code: ErrorCode, message: string) => new PlatformError(status, code, message, correlationId);
  if (status === 401) {
    return make("invalid_key", "Higgsfield rejected the API key. Replace it with a key copied from open.higgsfield.ai.");
  }
  if (status === 403) return make("credits", "This account doesn't have enough credits for that run.");
  if (status === 404) return make("not_found", detail ?? "Not found for this account.");
  if (status === 422) return make("invalid_input", detail ?? "Higgsfield rejected the request's fields.");
  if (status === 423) return make("unavailable", "This model is temporarily blocked. Try again later.");
  if (status === 503) return make("unavailable", "This model is disabled or not ready. Try again later.");
  if (status === 400) {
    return /concurren/i.test(detail ?? "")
      ? make("concurrency", `${detail} Wait for a run to finish, then generate again.`)
      : make("invalid_input", detail ?? "Higgsfield rejected the request.");
  }
  if (status >= 500) return make("server", "Higgsfield had a server error. Try again in a moment.");
  return make("invalid_input", detail ?? `Request failed (${status}).`);
}

function mapQueued(payload: unknown): QueuedGeneration {
  const data = asRecord(payload);
  const requestId = stringField(data, "request_id");
  if (!requestId) {
    throw new PlatformError(
      502,
      "ambiguous",
      "Higgsfield answered without a request id, so this run may or may not have started. Check open.higgsfield.ai before generating it again.",
    );
  }
  return { status: stringField(data, "status") ?? "queued", requestId };
}

function mapStatus(payload: unknown, requestId: string): GenerationStatus {
  const data = asRecord(payload);
  const images = Array.isArray(data.images)
    ? data.images.flatMap((item) => {
        const url = asRecord(item).url;
        return typeof url === "string" ? [{ url }] : [];
      })
    : undefined;
  const videoUrl = asRecord(data.video).url;

  return {
    status: stringField(data, "status") ?? "unknown",
    requestId: stringField(data, "request_id") ?? requestId,
    ...(images?.length ? { images } : {}),
    ...(typeof videoUrl === "string" ? { video: { url: videoUrl } } : {}),
    ...(data.error !== undefined && data.error !== null ? { error: data.error } : {}),
  };
}

function mapUploadTarget(payload: unknown): UploadTarget {
  const data = asRecord(payload);
  const uploadUrl = stringField(data, "upload_url");
  const publicUrl = stringField(data, "public_url");
  if (!uploadUrl || !isHttps(uploadUrl) || !publicUrl || !isHttps(publicUrl)) {
    throw new PlatformError(502, "server", "Higgsfield didn't return a usable upload URL. Try again.");
  }
  const uploadHeaders: Record<string, string> = {};
  for (const [name, value] of Object.entries(asRecord(data.upload_headers))) {
    if (typeof value === "string") uploadHeaders[name] = value;
  }
  return { uploadUrl, uploadHeaders, publicUrl };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field ? field : undefined;
}

function isHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/* FastAPI answers with a string detail, or a list of validation errors. */
function detailOf(payload: unknown): string | undefined {
  const detail = asRecord(payload).detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const parts = detail.flatMap((entry) => {
      const record = asRecord(entry);
      const msg = typeof record.msg === "string" ? record.msg : null;
      if (!msg) return [];
      const loc = Array.isArray(record.loc) ? record.loc.filter((part) => part !== "body").join(".") : "";
      return [loc ? `${loc}: ${msg}` : msg];
    });
    if (parts.length) return parts.join("; ");
  }
  return undefined;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorName(caught: unknown): string {
  return caught instanceof Error ? caught.name : "unknown";
}
