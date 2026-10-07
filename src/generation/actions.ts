"use server";

import { cookies } from "next/headers";

import { getModel, parseSettings } from "./catalog";
import type { GenerationPlane } from "./catalog/types";
import {
  MissingCredentialsError,
  PLATFORM_KEY_COOKIE,
  PLATFORM_KEY_COOKIE_OPTIONS,
  decodeCredentials,
  encodeCredentials,
  parseCredentialInput,
} from "./credentials";
import { createPlatformClient } from "./platform";
import type { StatusResult } from "./platform";
import type { PresetSource } from "./catalog/types";
import type { MarketingPreset } from "./presets";
import type { InfluencerCategory } from "./influencer";
import { toPlatform } from "./to-platform";

/* Server actions answer failures as values: a thrown error reaches a production
   client as a bare "Minified React error #441" with its message stripped. */
export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function savePlatformCredentials(data: unknown): Promise<ActionResult<null>> {
  return settle(async () => {
    const { apiKey } = parseCredentialInput(data);
    const jar = await cookies();
    jar.set(PLATFORM_KEY_COOKIE, encodeCredentials(apiKey), PLATFORM_KEY_COOKIE_OPTIONS);
    return null;
  });
}

export async function clearPlatformCredentials() {
  const jar = await cookies();
  jar.set(PLATFORM_KEY_COOKIE, "", { ...PLATFORM_KEY_COOKIE_OPTIONS, maxAge: 0 });
}

export async function hasPlatformCredentials() {
  return (await readStoredCredentials()) !== null;
}

export async function submitGeneration(plane: GenerationPlane) {
  return settle(async () => {
    const model = getModel(plane.model);
    const parsed: GenerationPlane = {
      ...plane,
      settings: parseSettings(model, plane.settings),
    };
    const { path, body } = toPlatform(parsed);
    return createPlatformClient(await readCredentials()).submit(path, body);
  });
}

export type PresetPage = { items: MarketingPreset[]; cursor: number | null };

const PRESET_PATHS: Record<Extract<PresetSource, "marketing-studio" | "genjutsu-restyle">, string> = {
  "marketing-studio": "/marketing-studio/image/presets",
  "genjutsu-restyle": "/models/higgsfield/genjutsu/restyle/v1.0/presets",
};

/** One page of a model's presets, read with the visitor's own key. The
    platform answers either a page object or a bare list; both are accepted. */
export async function listPresets(data: unknown): Promise<ActionResult<PresetPage>> {
  return settle(async () => {
    const input = (data ?? {}) as { source?: unknown; search?: unknown; cursor?: unknown };
    const source = input.source === "genjutsu-restyle" ? "genjutsu-restyle" : "marketing-studio";
    const query = new URLSearchParams({ size: "50" });
    if (typeof input.search === "string" && input.search.trim()) query.set("search", input.search.trim().slice(0, 100));
    if (typeof input.cursor === "number" && input.cursor > 0) query.set("cursor", String(Math.floor(input.cursor)));
    const payload = (await createPlatformClient(await readCredentials()).get(
      `${PRESET_PATHS[source]}?${query}`,
    )) as unknown;
    const page = (Array.isArray(payload) ? { items: payload } : (payload ?? {})) as { items?: unknown; cursor?: unknown };
    const items = Array.isArray(page.items)
      ? page.items.flatMap((item) => {
          const row = item as Record<string, unknown>;
          const name = typeof row.name === "string" ? row.name : typeof row.title === "string" ? row.title : null;
          return typeof row.id === "string" && name
            ? [{ id: row.id, name, type: typeof row.type === "string" ? row.type : "" }]
            : [];
        })
      : [];
    return { items, cursor: typeof page.cursor === "number" ? page.cursor : null };
  });
}

/** AI Influencer's appearance catalog. The platform serves it publicly; it is
    read through the visitor's client like every other call. */
export async function listInfluencerOptions(): Promise<ActionResult<InfluencerCategory[]>> {
  return settle(async () => {
    const payload = (await createPlatformClient(await readCredentials()).get(
      "/models/higgsfield/ai-influencer/options",
    )) as { categories?: unknown };
    const text = (value: unknown) => (typeof value === "string" ? value : null);
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : null);
    return (Array.isArray(payload?.categories) ? payload.categories : []).flatMap((raw) => {
      const row = raw as Record<string, unknown>;
      const key = text(row.key);
      if (!key || !Array.isArray(row.options)) return [];
      return [{
        key,
        label: text(row.label) ?? key,
        tiers: list(row.tiers) ?? [],
        max: typeof row.max === "number" && row.max > 0 ? row.max : 1,
        options: row.options.flatMap((rawOption) => {
          const option = rawOption as Record<string, unknown>;
          const optionKey = text(option.key);
          return optionKey
            ? [{
                key: optionKey,
                label: text(option.label) ?? optionKey,
                img: text(option.img),
                color: text(option.color),
                tiers: list(option.tiers),
                slot: text(option.slot),
                exclusive: option.exclusive === true,
              }]
            : [];
        }),
      }];
    });
  });
}

export type SoulCharacter = { id: string; name: string; status: string; thumbnail: string | null };

const SOUL_VERSIONS = new Set(["v1", "v2", "cinema"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toCharacter(raw: unknown): SoulCharacter | null {
  const row = (raw ?? {}) as Record<string, unknown>;
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : "Sin nombre",
    status: typeof row.status === "string" ? row.status : "not_ready",
    thumbnail: typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
  };
}

/** The visitor's Soul ID characters. One trained for another Soul version is
    left out when the platform says which version it was trained for. */
export async function listSoulCharacters(version: unknown): Promise<ActionResult<SoulCharacter[]>> {
  return settle(async () => {
    const client = createPlatformClient(await readCredentials());
    const out: SoulCharacter[] = [];
    for (let page = 1; page <= 5; page++) {
      const payload = (await client.get(`/v1/custom-references/list?page=${page}&page_size=50`)) as {
        items?: unknown;
        total_pages?: unknown;
      } | null;
      const items = Array.isArray(payload?.items) ? payload.items : [];
      for (const raw of items) {
        const trained = (raw as Record<string, unknown>)?.model_version;
        if (typeof trained === "string" && typeof version === "string" && trained !== version) continue;
        const character = toCharacter(raw);
        if (character) out.push(character);
      }
      if (typeof payload?.total_pages !== "number" || page >= payload.total_pages) break;
    }
    return out;
  });
}

/** Starts training a Soul ID from uploaded photos of one person. */
export async function createSoulCharacter(data: unknown): Promise<ActionResult<SoulCharacter>> {
  return settle(async () => {
    const input = (data ?? {}) as { name?: unknown; version?: unknown; urls?: unknown };
    const name = typeof input.name === "string" ? input.name.trim().slice(0, 100) : "";
    if (!name) throw new Error("Ponle un nombre al personaje");
    const version = typeof input.version === "string" && SOUL_VERSIONS.has(input.version) ? input.version : "v2";
    const urls = Array.isArray(input.urls)
      ? input.urls.filter((url): url is string => typeof url === "string" && /^https?:\/\//.test(url)).slice(0, 100)
      : [];
    if (!urls.length) throw new Error("Agrega al menos una foto");
    const created = toCharacter(
      await createPlatformClient(await readCredentials()).post("/v1/custom-references", {
        name,
        model_version: version,
        input_images: urls.map((url) => ({ type: "image_url", image_url: url })),
      }),
    );
    if (!created) throw new Error("Higgsfield no devolvió el nuevo personaje");
    return created;
  });
}

export async function deleteSoulCharacter(id: unknown): Promise<ActionResult<null>> {
  return settle(async () => {
    if (typeof id !== "string" || !UUID.test(id)) throw new Error("Invalid character id");
    await createPlatformClient(await readCredentials()).delete(`/v1/custom-references/${id}`);
    return null;
  });
}

/** Asks the platform to drop a run. The poll then reads the "canceled" status
    and settles the tile like any other ending. */
export async function cancelGeneration(requestId: string): Promise<ActionResult<null>> {
  return settle(async () => {
    if (typeof requestId !== "string" || !requestId) throw new Error("Invalid request id");
    await createPlatformClient(await readCredentials()).cancel(requestId);
    return null;
  });
}

/** Every request in flight, answered in one round trip. Next dispatches server
    actions one at a time per client, so a poll per run would queue ahead of the
    next submit — the fan-out belongs on this side of the call, where it is
    genuinely parallel. */
export async function getGenerationStatuses(data: unknown): Promise<StatusResult[]> {
  const requestIds = parseRequestIds(data);
  let client: ReturnType<typeof createPlatformClient>;
  try {
    client = createPlatformClient(await readCredentials());
  } catch (caught) {
    const error = caught instanceof Error ? caught.message : String(caught);
    return requestIds.map((requestId) => ({ requestId, error }));
  }
  return Promise.all(
    requestIds.map(async (requestId): Promise<StatusResult> => {
      try {
        return { requestId, status: await client.status(requestId) };
      } catch (caught) {
        return { requestId, error: caught instanceof Error ? caught.message : String(caught) };
      }
    }),
  );
}

async function settle<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : String(caught) };
  }
}

async function readStoredCredentials() {
  const jar = await cookies();
  return decodeCredentials(jar.get(PLATFORM_KEY_COOKIE)?.value);
}

async function readCredentials() {
  const stored = await readStoredCredentials();
  if (!stored) throw new MissingCredentialsError();
  const baseUrl = process.env.HF_API_BASE_URL;
  if (!baseUrl) throw new Error("Missing HF_API_BASE_URL");
  return { ...stored, baseUrl };
}

function parseRequestIds(data: unknown): string[] {
  const payload = asObject(data, "Invalid status payload");
  const requestIds = payload.requestIds;
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    throw new Error("Invalid request ids");
  }
  return requestIds.map((requestId) => {
    if (typeof requestId !== "string" || !requestId) throw new Error("Invalid request id");
    return requestId;
  });
}

function asObject(data: unknown, message: string): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error(message);
  return data as Record<string, unknown>;
}
