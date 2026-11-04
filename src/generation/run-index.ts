import { createHash } from "node:crypto";

import { put } from "@vercel/blob";

/* Claude desktop restores a reopened chat's result tile with the tool's
   arguments but without its result, so the tile cannot tell which run to
   show. Each generate call leaves a note in the Blob store, keyed by its
   arguments: the tile hands the arguments back and gets its run's id. */

export const RUN_INDEX_PREFIX = "runs/";

export type RunArgs = { model?: unknown; prompt?: unknown; settings?: unknown; media?: unknown };

/** JSON with object keys sorted, so the same arguments give the same key
    however a client ordered them. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function keyOf(args: RunArgs): string {
  const { model, prompt, settings, media } = args;
  return createHash("sha256")
    .update(canonical({ model, prompt: typeof prompt === "string" ? prompt.trim() : "", settings: settings ?? {}, media: media ?? {} }))
    .digest("hex");
}

function store(): { token: string; base: string } | null {
  const token = process.env.OPEN_HIGGSFIELD_READ_WRITE_TOKEN;
  const storeId = token?.split("_")[3];
  return token && storeId ? { token, base: `https://${storeId}.public.blob.vercel-storage.com/` } : null;
}

/** Notes which run these arguments started. Best effort: a run is paid for
    and must reach Claude whether or not the note is written. */
export async function rememberRun(args: RunArgs, requestId: string): Promise<void> {
  const blob = store();
  if (!blob) return;
  try {
    await put(`${RUN_INDEX_PREFIX}${keyOf(args)}.json`, JSON.stringify({ requestId, at: Date.now() }), {
      access: "public",
      token: blob.token,
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
  } catch (error) {
    console.error("[runs] note not written", { error: error instanceof Error ? error.message : String(error) });
  }
}

/** The run these arguments last started, if a note is there. */
export async function findRun(args: RunArgs): Promise<string | null> {
  const blob = store();
  if (!blob) return null;
  try {
    const response = await fetch(`${blob.base}${RUN_INDEX_PREFIX}${keyOf(args)}.json`, { cache: "no-store" });
    if (!response.ok) return null;
    const note = (await response.json()) as { requestId?: unknown };
    return typeof note.requestId === "string" ? note.requestId : null;
  } catch {
    return null;
  }
}

/* Temporary diagnostics: the result tile reports how the host answers its
   buttons (timings only, no prompts), so a host's quirks can be read back
   instead of guessed. Kept under runs/, so the cleanup job removes them. */
const VIEWER_LOG_PREFIX = `${RUN_INDEX_PREFIX}viewer-log/`;

export async function writeViewerLog(text: string): Promise<void> {
  const blob = store();
  if (!blob) return;
  await put(`${VIEWER_LOG_PREFIX}${Date.now()}.txt`, text.slice(0, 4000), {
    access: "public",
    token: blob.token,
    contentType: "text/plain",
    addRandomSuffix: true,
  });
}

export async function readViewerLog(): Promise<string> {
  const blob = store();
  if (!blob) return "sin almacenamiento";
  const { list } = await import("@vercel/blob");
  const { blobs } = await list({ prefix: VIEWER_LOG_PREFIX, token: blob.token, limit: 1000 });
  const latest = blobs.sort((a, b) => (a.pathname < b.pathname ? 1 : -1)).slice(0, 15);
  const texts = await Promise.all(latest.map((b) => fetch(b.url, { cache: "no-store" }).then((r) => r.text()).catch(() => "?")));
  return texts.map((t, i) => `${latest[i]!.pathname}\n${t}`).join("\n\n") || "vacío";
}
