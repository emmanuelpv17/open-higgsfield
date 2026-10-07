import { toAuthorizationHeader } from "./credentials";

const MODEL_ID = /^[a-z0-9][a-z0-9._/-]*$/i;

export class PlatformError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(messageFromBody(status, body));
    this.name = "PlatformError";
    this.status = status;
    this.body = body;
  }
}

export type QueuedGeneration = {
  status: string;
  requestId: string;
  statusUrl: string;
  cancelUrl: string;
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
  | { requestId: string; error: string };

export type PlatformClientOptions = {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
};

export function isModelId(model: string): boolean {
  return MODEL_ID.test(model) && !model.includes("..");
}

export function createPlatformClient(options: PlatformClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetch ?? fetch;
  const auth = toAuthorizationHeader(options.apiKey);

  /* The Soul ID endpoints document their own key headers; they ride along with
     the usual Authorization header on those paths only. */
  const colon = options.apiKey.indexOf(":");
  const referenceHeaders = {
    "hf-api-key": options.apiKey.slice(0, colon),
    "hf-secret": options.apiKey.slice(colon + 1),
  };

  async function send(method: "GET" | "POST" | "DELETE", path: string, body?: Record<string, unknown>) {
    const url = `${baseUrl}${path}`;
    console.info("[platform] request", { method, url, body: body ?? null });
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: auth,
        ...(path.startsWith("/v1/custom-references") ? referenceHeaders : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await readJson(response);
    console.info("[platform] response", { method, url, status: response.status, body: payload });
    if (!response.ok) throw new PlatformError(response.status, payload);
    return payload;
  }

  return {
    async submit(model: string, input: Record<string, unknown>): Promise<QueuedGeneration> {
      if (!isModelId(model)) throw new PlatformError(400, { detail: "Invalid model" });
      return mapQueued(await send("POST", `/${model}`, input));
    },
    async status(requestId: string): Promise<GenerationStatus> {
      if (!requestId) throw new PlatformError(400, { detail: "Missing request id" });
      return mapStatus(await send("GET", `/requests/${encodeURIComponent(requestId)}/status`));
    },
    async get(path: string): Promise<unknown> {
      return send("GET", path);
    },
    async post(path: string, body: Record<string, unknown>): Promise<unknown> {
      return send("POST", path, body);
    },
    async delete(path: string): Promise<void> {
      await send("DELETE", path);
    },
    /** Only a request still queued can be canceled; the platform refuses one
        that has started rendering. */
    async cancel(requestId: string): Promise<void> {
      if (!requestId) throw new PlatformError(400, { detail: "Missing request id" });
      await send("POST", `/requests/${encodeURIComponent(requestId)}/cancel`);
    },
  };
}

function mapQueued(payload: unknown): QueuedGeneration {
  const data = asRecord(payload);
  const requestId = stringField(data, "request_id");
  if (!requestId) throw new PlatformError(502, { detail: "Platform response missing request_id" });
  return {
    status: stringField(data, "status") ?? "queued",
    requestId,
    statusUrl: stringField(data, "status_url") ?? "",
    cancelUrl: stringField(data, "cancel_url") ?? "",
  };
}

function mapStatus(payload: unknown): GenerationStatus {
  const data = asRecord(payload);
  const requestId = stringField(data, "request_id") ?? "";
  const images = Array.isArray(data.images)
    ? data.images.flatMap((item) => {
        const url = asRecord(item).url;
        return typeof url === "string" ? [{ url }] : [];
      })
    : undefined;
  const videoUrl = asRecord(data.video).url;

  return {
    status: stringField(data, "status") ?? "unknown",
    requestId,
    ...(images?.length ? { images } : {}),
    ...(typeof videoUrl === "string" ? { video: { url: videoUrl } } : {}),
    ...(data.error !== undefined ? { error: data.error } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
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

/* The platform answers in English; the common refusals are said in Spanish,
   anything else keeps its own detail. */
const STATUS_MESSAGES: Record<number, string> = {
  401: "Clave API inválida o vencida",
  402: "Saldo insuficiente en tu cuenta de Higgsfield",
  403: "Tu clave API no tiene acceso a este modelo",
  429: "Demasiadas solicitudes seguidas; espera un momento",
};

function messageFromBody(status: number, body: unknown): string {
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status]!;
  const detail = asRecord(body).detail;
  if (typeof detail === "string" && detail) {
    if (/insufficient|not enough (credits|balance)/i.test(detail)) return "Saldo insuficiente en tu cuenta de Higgsfield";
    return detail;
  }
  return `Higgsfield rechazó la solicitud (${status})`;
}
