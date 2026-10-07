import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MODELS, getModel, parseSettings, type GenerationPlane, type MediaRole } from "./catalog";
import { encodeTraits } from "./influencer";
import { createPlatformClient, type GenerationStatus } from "./platform";
import { estimateCost, formatCost, pricedFromSource } from "./pricing";
import { toPlatform } from "./to-platform";

/* The studio's catalog and mappers, exposed to Claude as MCP tools. Every
   call runs on the deployment owner's key (OPEN_HIGGSFIELD_MCP_API_KEY), so
   the route in front of this is gated by its own secret. */

type Client = ReturnType<typeof createPlatformClient>;

const ROLES: readonly MediaRole[] = ["start", "end", "reference", "video", "audio"];
/* A generation call waits this long for the result before handing back the
   request id; the function itself is capped at 60 seconds. */
const WAIT_MS = 45_000;
/* Images up to this size are sent inline so the chat can show them. */
const INLINE_IMAGE_BYTES = 900_000;

export function createStudioMcpServer(client: Client): McpServer {
  const server = new McpServer({ name: "open-higgsfield", version: "1.0.0" });

  server.registerTool(
    "list_models",
    {
      title: "List models",
      description:
        "Lists the image and video models available through the user's Higgsfield API key, with each model's accepted inputs, settings (allowed values and defaults) and an approximate price at default settings. Call this before generate to pick a model and valid settings.",
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
                      : { type: "object of category -> option keys, from list_options ai-influencer-appearance" },
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
    "generate",
    {
      title: "Generate image or video",
      description:
        "Generates with one model, spending from the user's Higgsfield API balance. Settings not given use the model's defaults. Media inputs must be public URLs (for example results of earlier generations). Waits up to ~45 seconds: if the result is ready it is returned, otherwise call check_generation with the request id (videos usually take a few minutes). Tell the user the approximate cost.",
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
      const model = getModel(modelId);
      if (!model.promptOptional && !prompt.trim()) throw new Error(`${model.label} needs a prompt`);
      const raw: Record<string, unknown> = { ...(settings ?? {}) };
      if (raw.traits && typeof raw.traits === "object") {
        raw.traits = encodeTraits({
          tier: typeof raw.tier === "string" ? raw.tier : "normal",
          selection: raw.traits as Record<string, string[]>,
        });
      }
      const parsed = parseSettings(model, raw);
      const items: GenerationPlane["media"] = {};
      for (const role of ROLES) {
        const value = media?.[role];
        const urls = (Array.isArray(value) ? value : value ? [value] : []).slice(0, model.roles[role] ?? 0);
        if (urls.length) items[role] = urls.map((url, index) => ({ id: `${role}-${index}`, url, role }));
      }
      const { path, body } = toPlatform({ model: model.id, prompt: { text: prompt.trim() }, media: items, settings: parsed });
      const queued = await client.submit(path, body);
      const cost = estimateCost(model.id, parsed, null);
      const costText = pricedFromSource(model.id)
        ? "billed per second of the source video"
        : cost
          ? formatCost(cost)
          : "unknown";

      const deadline = Date.now() + WAIT_MS;
      let status: GenerationStatus | null = null;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        status = await client.status(queued.requestId);
        if (!["queued", "in_progress", "unknown"].includes(status.status)) break;
      }
      return report(queued.requestId, status, `${model.label} · approx. cost ${costText}`);
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

async function report(requestId: string, status: GenerationStatus | null, heading: string) {
  const state = status?.status ?? "queued";
  const lines = [heading, `request_id: ${requestId}`, `status: ${state}`].filter(Boolean);
  const content: Content[] = [];
  if (state === "completed") {
    const urls = [...(status?.images ?? []).map((image) => image.url), ...(status?.video ? [status.video.url] : [])];
    lines.push(...urls.map((url) => `result: ${url}`));
    for (const url of (status?.images ?? []).map((image) => image.url).slice(0, 4)) {
      const inline = await inlineImage(url);
      if (inline) content.push(inline);
    }
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

async function inlineImage(url: string): Promise<Content | null> {
  try {
    const response = await fetch(url);
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
