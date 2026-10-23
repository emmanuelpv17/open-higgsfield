import type { Cost } from "@/generation/pricing";
import { browserLegacy, defaultKv, type Kv, type LegacyStore } from "./idb";
import type { Surface } from "@/generation/catalog";

export type RunStatus = "running" | "completed" | "failed";

export interface RunRecord {
  id: string;
  surface: Surface;
  modelId: string;
  modelLabel: string;
  prompt: string;
  /** CSS aspect-ratio value, e.g. "16 / 9" */
  ratio: string;
  meta: string;
  badge?: string;
  kind: "image" | "video";
  urls: string[];
  status: RunStatus;
  /** Platform request this row is waiting on. Set while status is running so a
      refresh can resume the poll; completed rows keep it for the same id. */
  requestId?: string;
  error?: string;
  /** Layered-gradient fallback used while media loads or when a run failed. */
  art: string;
  createdAt: number;
  /** Kept deliberately: shows in the Favorites scope and outlives the cap. */
  favorite?: boolean;
  /** Resolved catalog settings this run was submitted with, so reuse can
      restore the dials and not just the words. Absent on pre-existing records. */
  settings?: Record<string, unknown>;
  /** Estimated USD for this result, when the model's price is published. */
  cost?: Cost | number;
}

export const HISTORY_KEY = "history.v1";
export const LEGACY_HISTORY_KEY = "openhiggsfield.history.v1";
const MAX_RECORDS = 60;

export async function loadHistory(
  kv: Kv = defaultKv(),
  legacy: LegacyStore | undefined = browserLegacy(),
): Promise<RunRecord[]> {
  const stored = await readIdb(kv);
  const fromLegacy = readLegacy(legacy);
  if (stored.length === 0) return fromLegacy;
  if (fromLegacy.length === 0) return stored;
  return mergeHistory(stored, fromLegacy);
}

/* Ids this tab last saved. Other tabs write the same store, so a save merges
   into what is there rather than over it: a row this tab dropped since its
   last save (deleted, swapped for its terminal rows, aged out) is removed, and
   a row only another tab knows about is kept. */
let saved = new Set<string>();

export async function saveHistory(
  records: RunRecord[],
  kv: Kv = defaultKv(),
  legacy: LegacyStore | undefined = browserLegacy(),
): Promise<void> {
  const mine = capHistory(records.filter(isRunRecord));
  const ids = new Set(mine.map((record) => record.id));
  const removed = new Set([...saved].filter((id) => !ids.has(id)));
  saved = ids;
  const kept = (stored: RunRecord[]) => stored.filter((record) => !removed.has(record.id));
  let next = mine;
  try {
    next = await kv.update(HISTORY_KEY, (stored) => mergeHistory(kept(storedRecords(stored)), mine));
  } catch {
    /* private mode or a denied store */
  }
  try {
    legacy?.setItem(LEGACY_HISTORY_KEY, JSON.stringify(mergeHistory(kept(readLegacy(legacy)), next)));
  } catch {
    /* quota or a denied store */
  }
  historyChannel()?.postMessage({ rows: next, removed: [...removed] });
}

let channel: BroadcastChannel | null | undefined;

/* One channel both sends and listens: a channel never hears its own messages,
   but a second one in the same tab would. */
function historyChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("openhiggsfield.history");
  }
  return channel;
}

/** Hands `listener` each save another tab makes. */
export function subscribeHistory(listener: (rows: RunRecord[], removed: string[]) => void): () => void {
  const bus = historyChannel();
  if (!bus) return () => {};
  const onMessage = (event: MessageEvent) => {
    const data = (event.data ?? {}) as { rows?: unknown; removed?: unknown };
    if (!Array.isArray(data.rows) || !Array.isArray(data.removed)) return;
    listener(
      data.rows.filter(isRunRecord),
      data.removed.filter((id): id is string => typeof id === "string"),
    );
  };
  bus.addEventListener("message", onMessage);
  return () => bus.removeEventListener("message", onMessage);
}

/** Folds another tab's save in: rows this tab has not seen, runs that finished
    there, rows removed there. Nothing else is taken, so two tabs settle rather
    than bounce saves off each other; with nothing to take, `current` comes
    back as is. */
export function adoptHistory(current: RunRecord[], rows: RunRecord[], removed: string[]): RunRecord[] {
  const gone = new Set(removed);
  const byId = new Map(current.map((record) => [record.id, record]));
  const fresh = rows.filter((row) => {
    if (gone.has(row.id)) return false;
    const have = byId.get(row.id);
    return !have || (have.status === "running" && row.status !== "running");
  });
  if (fresh.length === 0 && !current.some((record) => gone.has(record.id))) return current;
  return mergeHistory(fresh, current.filter((record) => !gone.has(record.id)));
}

/** Session rows win on id collision so a generate that landed before IDB
    finished reading is not wiped by the delayed load. */
export function mergeHistory(stored: RunRecord[], live: RunRecord[]): RunRecord[] {
  const byId = new Map<string, RunRecord>();
  for (const row of [...stored, ...live]) {
    const prev = byId.get(row.id);
    if (!prev || newerRecord(row, prev)) byId.set(row.id, row);
  }
  return capHistory([...byId.values()].sort((a, b) => b.createdAt - a.createdAt));
}

async function readIdb(kv: Kv): Promise<RunRecord[]> {
  try {
    return storedRecords(await kv.get<unknown>(HISTORY_KEY));
  } catch {
    return [];
  }
}

function storedRecords(stored: unknown): RunRecord[] {
  return Array.isArray(stored) ? capHistory(stored.filter(isRunRecord)) : [];
}

function readLegacy(legacy: LegacyStore | undefined): RunRecord[] {
  if (!legacy) return [];
  try {
    const raw = legacy.getItem(LEGACY_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return capHistory(parsed.filter(isRunRecord));
  } catch {
    return [];
  }
}

/* The cap trims the run log, not the visitor's shelf: a favorite is a
   deliberate keep, so only unmarked runs age out of the window. */
export function capHistory(records: RunRecord[], max = MAX_RECORDS): RunRecord[] {
  if (records.length <= max) return records;
  let kept = 0;
  return records.filter(
    (record) => record.favorite === true || record.status === "running" || kept++ < max,
  );
}

export function requestIdOf(record: RunRecord): string {
  return record.requestId ?? record.id.split("#")[0]!;
}

/** Swap every row of a request for its terminal records, or no-op if the
    visitor already deleted the in-flight tiles. */
export function replaceRequest(
  records: RunRecord[],
  requestId: string,
  next: RunRecord[],
): RunRecord[] {
  if (!records.some((record) => record.status === "running" && requestIdOf(record) === requestId)) {
    return records;
  }
  return capHistory(
    [...next, ...records.filter((record) => requestIdOf(record) !== requestId)].sort(
      (a, b) => b.createdAt - a.createdAt,
    ),
  );
}

function newerRecord(row: RunRecord, prev: RunRecord): boolean {
  const rowDone = row.status !== "running";
  const prevDone = prev.status !== "running";
  if (rowDone !== prevDone) return rowDone;
  return row.createdAt >= prev.createdAt;
}

function isRunRecord(value: unknown): value is RunRecord {
  if (value === null || typeof value !== "object") return false;
  const record = value as Partial<RunRecord>;
  return (
    typeof record.id === "string" &&
    (record.surface === "image" || record.surface === "video") &&
    typeof record.prompt === "string" &&
    typeof record.ratio === "string" &&
    Array.isArray(record.urls) &&
    (record.status === "completed" ||
      record.status === "failed" ||
      (record.status === "running" && typeof record.requestId === "string")) &&
    typeof record.createdAt === "number" &&
    (record.requestId === undefined || typeof record.requestId === "string") &&
    (record.favorite === undefined || typeof record.favorite === "boolean") &&
    (record.settings === undefined ||
      (typeof record.settings === "object" && record.settings !== null))
  );
}

export function timeAgo(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "ahora mismo";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

/* One step along the runs the visitor is actually looking at, or null at the
   ends — the walk stops there rather than wrapping, so the edge of the scope
   can be felt. A run that has left the list steps nowhere. */
export function stepRun(records: RunRecord[], id: string, delta: number): RunRecord | null {
  const from = records.findIndex((record) => record.id === id);
  if (from < 0) return null;
  return records[from + delta] ?? null;
}
