import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MODELS, getModel, parseSettings, type GenerationPlane, type MediaRole, type ModelEntry } from "./catalog";
import { encodeTraits, selectionFor } from "./influencer";
import { keyWorks } from "./key-check";
import { checkMediaUrl, directMediaUrl } from "./media-links";
import { MCP_UPLOAD_HOURS, createUploadTicket } from "./mcp-upload";
import { PlatformError, createPlatformClient, type GenerationStatus } from "./platform";
import { presetId } from "./presets";
import { estimateCost, formatCost, pricedFromSource, scaleCost } from "./pricing";
import { effectiveSettings, toPlatform } from "./to-platform";

/* The studio's catalog and mappers, exposed to Claude as MCP tools. Every
   call runs on the deployment owner's key (OPEN_HIGGSFIELD_MCP_API_KEY), so
   the route in front of this is gated by its own secret. */

type Client = ReturnType<typeof createPlatformClient>;

const ROLES: readonly MediaRole[] = ["start", "end", "reference", "video", "audio"];
/* A generation call waits this long, counted from the start of the call (link
   checks and submit included), before handing back the request id; the
   function itself is capped at 60 seconds. */
const WAIT_MS = 38_000;
const POLL_MS = 3000;
/* Images up to this size are sent inline so the chat can show them. */
const INLINE_IMAGE_BYTES = 900_000;
const NOTHING_SPENT = "No se envió nada a Higgsfield (no se gastó saldo).";

export function createStudioMcpServer(client: Client, apiKey: string): McpServer {
  const server = new McpServer({ name: "open-higgsfield", version: "1.0.0" });

  server.registerTool(
    "list_models",
    {
      title: "List models",
      description:
        "Lists the image and video models available through the user's Higgsfield API key, with each model's accepted inputs, settings (allowed values and defaults) and an approximate price at default settings with nothing attached. What is attached can change the price and the duration sent (for example Kling O1 from a start frame renders 5 or 10 seconds, and a reference video caps Kling O1/O3 and Wan 2.6/2.7 at 10); generate reports the duration it sent. Call this before generate to pick a model and valid settings.",
      inputSchema: { surface: z.enum(["image", "video"]).optional().describe("Only image or only video models") },
      annotations: { readOnlyHint: true },
    },
    async ({ surface }) => {
      const rows = MODELS.filter((model) => !surface || model.surface === surface).map((model) => {
        const defaults = parseSettings(model, {});
        const cost = estimateCost(model.id, defaults, null);
        return {
          id: model.id,
          name: model.label,
          surface: model.surface,
          inputs: Object.fromEntries(
            Object.entries(model.roles).map(([role, max]) => [
              role,
              { max, label: model.roleLabels?.[role as MediaRole] ?? role, required: model.requires?.includes(role as MediaRole) ?? false },
            ]),
          ),
          promptOptional: model.promptOptional ?? false,
          settings: Object.fromEntries(
            Object.entries(model.settings).map(([key, field]) => [
              key,
              field.type === "enum"
                ? { values: field.values, default: field.default }
                : field.type === "range"
                  ? { min: field.min, max: field.max, step: field.step ?? 1, default: field.default }
                  : field.type === "boolean"
                    ? { type: "boolean", default: field.default }
                    : field.type === "preset"
                      ? { type: "id from list_options", source: field.source, default: "" }
                      : { type: "object of category -> option key or array of option keys, from list_options ai-influencer-appearance" },
            ]),
          ),
          approxPriceAtDefaults: pricedFromSource(model.id)
            ? cost
              ? `${formatCost(cost)} per second of the source video`
              : "billed per second of the source video"
            : cost
              ? formatCost(cost)
              : "unknown",
        };
      });
      return text(JSON.stringify(rows));
    },
  );

  server.registerTool(
    "list_options",
    {
      title: "List options",
      description:
        "Lists choices that come from the platform at run time: Marketing Studio styles (setting `preset`), Genjutsu Restyle styles (setting `preset`), the user's trained Soul ID characters (setting `character` on Soul models), or AI Influencer appearance options (setting `traits`).",
      inputSchema: {
        kind: z.enum(["marketing-studio-styles", "genjutsu-restyle-styles", "soul-ids", "ai-influencer-appearance"]),
        search: z.string().max(100).optional().describe("Filter styles by name"),
        tier: z.string().optional().describe("AI Influencer character type, to filter appearance categories (default normal)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ kind, search, tier }) => {
      if (kind === "soul-ids") {
        const page = (await client.get("/v1/custom-references/list?page=1&page_size=50")) as { items?: unknown[] } | null;
        const items = (page?.items ?? []).map((raw) => {
          const row = raw as Record<string, unknown>;
          return { id: row.id, name: row.name, status: row.status, trainedFor: row.model_version ?? null };
        });
        return text(JSON.stringify(items));
      }
      if (kind === "ai-influencer-appearance") {
        const wanted = tier || "normal";
        const payload = (await client.get("/models/higgsfield/ai-influencer/options")) as { categories?: unknown[] } | null;
        const categories = (payload?.categories ?? [])
          .map((raw) => raw as { key: string; label: string; tiers?: string[]; max?: number; options?: Array<Record<string, unknown>> })
          .filter((category) => category.tiers?.includes(wanted))
          .map((category) => ({
            key: category.key,
            label: category.label,
            max: category.max ?? 1,
            options: (category.options ?? [])
              .filter((option) => !Array.isArray(option.tiers) || (option.tiers as string[]).includes(wanted))
              .map((option) => `${option.key} (${option.label})${option.exclusive ? " [alone]" : ""}`),
          }));
        return text(JSON.stringify({ tier: wanted, categories }));
      }
      const path =
        kind === "marketing-studio-styles"
          ? "/marketing-studio/image/presets"
          : "/models/higgsfield/genjutsu/restyle/v1.0/presets";
      const query = new URLSearchParams({ size: "50" });
      if (search?.trim()) query.set("search", search.trim());
      const payload = (await client.get(`${path}?${query}`)) as unknown;
      const list = Array.isArray(payload) ? payload : ((payload as { items?: unknown[] } | null)?.items ?? []);
      return text(
        JSON.stringify(
          list.map((raw) => {
            const row = raw as Record<string, unknown>;
            return { id: row.id, name: row.name ?? row.title, group: row.type ?? null };
          }),
        ),
      );
    },
  );

  server.registerTool(
    "create_upload_url",
    {
      title: "Create upload URL",
      description:
        `Prepares a one-file upload into the connector owner's own storage, for a file the user attached in the chat (it lives in your sandbox, e.g. /mnt/user-data/uploads/...). Returns a curl command: run it once, replacing {FILE} with the file's local path; it PUTs the file and prints JSON with its url. Then pass the returned url in generate's media. The command is valid for 15 minutes and only for this file name, type and size; the file is deleted automatically after about ${MCP_UPLOAD_HOURS} hours (a daily cleanup, so up to a day more). Images up to 20 MB (jpg, png, webp, gif), video up to 100 MB (mp4, mov), audio up to 50 MB (wav, mp3). Nothing is spent on Higgsfield.`,
      inputSchema: {
        filename: z.string().min(1).max(200).describe("The file's name with its extension, e.g. photo.png"),
        size_bytes: z.coerce.number().int().positive().describe("Exact size of the file in bytes (e.g. from `stat -c %s <path>`)"),
        content_type: z.string().max(100).optional().describe("MIME type, e.g. image/png; inferred from the extension when omitted"),
      },
    },
    async ({ filename, size_bytes, content_type }) => {
      /* The public route takes any id:secret shape; the store is the owner's,
         so only a key the platform accepts gets a ticket. */
      let works: boolean;
      try {
        works = await keyWorks(apiKey);
      } catch (error) {
        throw new Error(error instanceof PlatformError ? error.message : "No se pudo verificar la clave API. Intenta de nuevo.");
      }
      if (!works) throw new Error("Clave API inválida o vencida.");
      const ticket = await createUploadTicket(filename, size_bytes, content_type);
      return text(
        JSON.stringify({
          url: ticket.url,
          command: ticket.command,
          content_type: ticket.contentType,
          max_bytes: ticket.maxBytes,
          expires_at: ticket.expiresAt,
          next: "Run command with {FILE} replaced by the local path. On success it prints JSON whose url equals the url above; then call generate with that url in media.",
        }),
      );
    },
  );

  server.registerTool(
    "generate",
    {
      title: "Generate image or video",
      description:
        "Generates with one model, spending from the user's Higgsfield API balance. Settings not given use the model's defaults. Media inputs must be public https URLs (for example results of earlier generations). For a file the user attached in the chat, call create_upload_url first and pass the url it returns; tmpfiles.org page links and Dropbox share links are converted to direct downloads automatically, and every link is checked before anything is spent. Waits up to ~40 seconds: if the result is ready it is returned, otherwise call check_generation with the request id (videos usually take a few minutes). Tell the user the approximate cost.",
      inputSchema: {
        model: z.string().describe("Model id from list_models"),
        prompt: z.string().max(10000).default("").describe("What to generate"),
        settings: z.record(z.string(), z.unknown()).optional().describe("Setting values from list_models"),
        media: z
          .object({
            start: z.string().url().optional().describe("Start frame / identity photo"),
            end: z.string().url().optional(),
            reference: z.array(z.string().url()).optional(),
            video: z.array(z.string().url()).optional(),
            audio: z.array(z.string().url()).optional(),
          })
          .optional(),
      },
    },
    async ({ model: modelId, prompt, settings, media }) => {
      const deadline = Date.now() + WAIT_MS;
      const model = getModel(modelId);
      if (!model.promptOptional && !prompt.trim()) throw new Error(`${model.label} needs a prompt`);
      const raw = checkSettings(model, settings ?? {});
      const parsed = parseSettings(model, raw, { strict: true });
      /* Picks that would all be dropped on the way out leave a random character. */
      if (raw.traits && !selectionFor(parsed.traits, String(parsed.tier))) {
        throw new Error(`${NOTHING_SPENT} Ninguna elección de traits se puede usar para el tipo '${parsed.tier}'; revisa list_options ai-influencer-appearance.`);
      }
      const items: GenerationPlane["media"] = {};
      for (const role of ROLES) {
        const value = media?.[role];
        const urls = Array.isArray(value) ? value : value ? [value] : [];
        const max = model.roles[role] ?? 0;
        if (urls.length > max) {
          const accepted = Object.entries(model.roles).map(([name, count]) => `${name} (máx. ${count})`).join(", ") || "ninguno";
          throw new Error(`${NOTHING_SPENT} ${model.label} acepta ${max} archivo(s) en '${role}'; roles aceptados: ${accepted}.`);
        }
        if (urls.length) {
          items[role] = urls.map((url, index) => ({ id: `${role}-${index}`, url: directMediaUrl(url), role }));
        }
      }
      /* Every link is opened before the run is paid for. */
      const problems = (
        await Promise.all(
          Object.entries(items).flatMap(([role, list]) => (list ?? []).map((item) => checkMediaUrl(item.url, role))),
        )
      ).filter((problem): problem is string => problem !== null);
      if (problems.length) throw new Error(`${NOTHING_SPENT} ${problems.join(" ")}`);
      const plane: GenerationPlane = { model: model.id, prompt: { text: prompt.trim() }, media: items, settings: parsed };
      const { path, body } = toPlatform(plane);
      const queued = await client.submit(path, body);
      /* What is attached can fit the duration to the endpoint; the cost and the
         reply follow the length sent. */
      const sent = effectiveSettings(plane);
      const fitted =
        sent.duration === parsed.duration
          ? ""
          : ` · duration sent ${sent.duration}s (asked ${parsed.duration}s; these inputs limit the lengths the endpoint takes)`;
      /* Prices are per result; Soul's batch size asks for several in one run. */
      const perResult = estimateCost(model.id, sent, null, items);
      const cost = perResult ? scaleCost(perResult, Math.max(1, Number(parsed.batchSize) || 1)) : null;
      const costText = pricedFromSource(model.id)
        ? "billed per second of the source video"
        : cost
          ? formatCost(cost)
          : "unknown";

      /* The run is paid for from here on, so nothing may keep its request id
         from reaching Claude: a failed status check ends the wait, and the
         last poll cannot run past the deadline. */
      let status: GenerationStatus | null = null;
      while (Date.now() + POLL_MS < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        try {
          status = await client.status(queued.requestId);
        } catch {
          break;
        }
        if (!["queued", "in_progress", "unknown"].includes(status.status)) break;
      }
      return report(queued.requestId, status, `${model.label} · approx. cost ${costText}${fitted}`);
    },
  );

  server.registerTool(
    "check_generation",
    {
      title: "Check generation",
      description: "Checks a generation started with generate and returns the result when it is ready.",
      inputSchema: { request_id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ request_id }) => report(request_id, await client.status(request_id), ""),
  );

  server.registerTool(
    "cancel_generation",
    {
      title: "Cancel generation",
      description: "Cancels a generation that is still queued. One that has started rendering finishes and is billed.",
      inputSchema: { request_id: z.string().min(1) },
    },
    async ({ request_id }) => {
      await client.cancel(request_id);
      return text(`Cancel requested for ${request_id}.`);
    },
  );

  return server;
}

type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/* Claude's settings, checked before anything is spent. The studio lets a
   stale stored value fall back to its default; here a value that would be
   ignored (unknown key, wrong type, a style name instead of its id) is
   refused instead. A number for an enum value ("10") or a numeric string for
   a range is converted, since both read the same to Claude. */
function checkSettings(model: ModelEntry, settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const refuse = (key: string, expected: string) =>
    new Error(`${NOTHING_SPENT} Valor no válido para '${key}' en ${model.label}: se esperaba ${expected}.`);
  for (const [key, value] of Object.entries(settings)) {
    const field = model.settings[key];
    if (!field) {
      const valid = Object.keys(model.settings).join(", ") || "ninguno";
      throw new Error(`${NOTHING_SPENT} ${model.label} no tiene el ajuste '${key}'; ajustes válidos: ${valid}.`);
    }
    if (value === undefined || value === null) continue;
    if (field.type === "enum") {
      const picked = typeof value === "number" ? String(value) : value;
      if (typeof picked !== "string" || !field.values.includes(picked)) throw refuse(key, `uno de ${field.values.join(", ")}`);
      out[key] = picked;
    } else if (field.type === "range") {
      const picked = typeof value === "string" && value.trim() ? Number(value) : value;
      if (typeof picked !== "number" || !(picked >= field.min && picked <= field.max)) {
        throw refuse(key, `un número entre ${field.min} y ${field.max}`);
      }
      out[key] = picked;
    } else if (field.type === "boolean") {
      if (typeof value !== "boolean") throw refuse(key, "true o false");
      out[key] = value;
    } else if (field.type === "preset") {
      if (typeof value !== "string" || (value && !presetId(value))) throw refuse(key, "el id que da list_options");
      out[key] = value;
    } else if (typeof value === "string") {
      out[key] = value;
    } else {
      /* AI Influencer traits: one option key or a list of them per category. */
      if (typeof value !== "object" || Array.isArray(value)) throw refuse(key, "un objeto categoría -> clave(s) de opción");
      const selection: Record<string, string[]> = {};
      for (const [category, picks] of Object.entries(value as Record<string, unknown>)) {
        const list = typeof picks === "string" ? [picks] : picks;
        if (!Array.isArray(list) || !list.every((pick) => typeof pick === "string")) {
          throw refuse(`${key}.${category}`, "una clave de opción o una lista de claves");
        }
        if (list.length) selection[category] = list;
      }
      out[key] = encodeTraits({ tier: typeof settings.tier === "string" ? settings.tier : "normal", selection });
    }
  }
  return out;
}

async function report(requestId: string, status: GenerationStatus | null, heading: string) {
  const state = status?.status ?? "queued";
  const lines = [heading, `request_id: ${requestId}`, `status: ${state}`].filter(Boolean);
  const content: Content[] = [];
  if (state === "completed") {
    const urls = [...(status?.images ?? []).map((image) => image.url), ...(status?.video ? [status.video.url] : [])];
    lines.push(...urls.map((url) => `result: ${url}`));
    const inline = await Promise.all((status?.images ?? []).slice(0, 4).map((image) => inlineImage(image.url)));
    content.push(...inline.filter((item): item is Content => item !== null));
    lines.push("Share the result links with the user; links from the platform expire after a while, so suggest downloading.");
  } else if (state === "queued" || state === "in_progress") {
    lines.push("Still rendering. Call check_generation with this request_id in a little while.");
  } else if (state === "nsfw") {
    lines.push("The platform blocked the result with its NSFW filter (not billed as a delivered result). Suggest adjusting the prompt or inputs.");
  } else {
    lines.push(`Not delivered: ${typeof status?.error === "string" ? status.error : JSON.stringify(status?.error ?? state)}`);
  }
  return { content: [{ type: "text" as const, text: lines.join("\n") }, ...content] };
}

/* Inlining is a nicety; it gets a few seconds so the reply with the request id
   still lands inside the function's time cap. */
async function inlineImage(url: string): Promise<Content | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > INLINE_IMAGE_BYTES) return null;
    return { type: "image", data: Buffer.from(bytes).toString("base64"), mimeType: type.split(";")[0]! };
  } catch {
    return null;
  }
}
