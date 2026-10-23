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
  /** When the row was last changed in place (kept, released, priced), so the
      newer copy wins between tabs. Absent until the first such change. */
  updatedAt?: number;
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

/** A row the visitor deleted, and when — the same clock in every tab, so a
    copy changed after the deletion (an undo, a favorite) is told apart from a
    stale one. */
export type Removal = readonly [id: string, at: number];

/* Other tabs write the same store, so a save merges into what is there rather
   than over it: a row only another tab knows about is kept. Only `removed` —
   rows the visitor deleted — leaves the store and the other tabs. A row that
   merely aged out of this tab's window is no removal: another tab may hold it
   as a favorite, and the store's own cap trims it otherwise. */
export async function saveHistory(
  records: RunRecord[],
  removed: Iterable<Removal> = [],
  kv: Kv = defaultKv(),
  legacy: LegacyStore | undefined = browserLegacy(),
): Promise<void> {
  /* Merged uncapped: a row changed here and pushed past the cap by it (a
     favorite released) must still outrank the store's older copy, and the
     merge's own cap trims it after. */
  const valid = records.filter(isRunRecord);
  const present = new Set(valid.map((record) => record.id));
  /* A row put back since (an undo) is not removed after all. */
  const removals = [...removed].filter(([id]) => !present.has(id));
  bury(removals);
  const all = valid.filter((record) => !buried(record));
  const kept = (stored: RunRecord[]) => stored.filter((record) => !buried(record));
  let next = capHistory(all);
  try {
    next = await kv.update(HISTORY_KEY, (stored) => mergeHistory(kept(storedRecords(stored)), all));
  } catch {
    /* private mode or a denied store */
  }
  /* The rows the cap trimmed go along, so the legacy store and the other tabs
     drop their older copies too. A running row missing from `next` was not
     trimmed: its request ended in another tab. */
  const nextIds = new Set(next.map((record) => record.id));
  const sent = [...next, ...all.filter((record) => record.status !== "running" && !nextIds.has(record.id))];
  try {
    legacy?.setItem(LEGACY_HISTORY_KEY, JSON.stringify(mergeHistory(kept(readLegacy(legacy)), sent)));
  } catch {
    /* quota or a denied store */
  }
  historyChannel()?.postMessage({ rows: sent, removed: removals });
}

/* Rows deleted this session, by when they were deleted (not when this tab
   heard of it). A save that crossed the deletion can still carry the row;
   without this, two tabs would hand it back and forth, each re-adopting it
   from the other's stale save. A row put back by an undo is stamped after its
   deletion, so it passes. */
const tombstones = new Map<string, number>();

function bury(removals: Iterable<Removal>): void {
  for (const [id, at] of removals) tombstones.set(id, Math.max(tombstones.get(id) ?? 0, at));
}

function buried(record: RunRecord): boolean {
  const at = tombstones.get(record.id);
  return at !== undefined && stampOf(record) <= at;
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
export function subscribeHistory(listener: (rows: RunRecord[], removed: Removal[]) => void): () => void {
  const bus = historyChannel();
  if (!bus) return () => {};
  const onMessage = (event: MessageEvent) => {
    const data = (event.data ?? {}) as { rows?: unknown; removed?: unknown };
    if (!Array.isArray(data.rows) || !Array.isArray(data.removed)) return;
    listener(
      data.rows.filter(isRunRecord),
      data.removed.filter(
        (entry): entry is Removal =>
          Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "number",
      ),
    );
  };
  bus.addEventListener("message", onMessage);
  return () => bus.removeEventListener("message", onMessage);
}

/** Folds another tab's save in: rows this tab has not seen, runs that finished
    there, rows changed there since this tab's copy, rows deleted there — a
    copy changed after its deletion (put back by an undo) stays. Nothing else
    is taken, so two tabs settle rather than bounce saves off each other; with
    nothing to take, `current` comes back as is. */
export function adoptHistory(current: RunRecord[], rows: RunRecord[], removed: Removal[]): RunRecord[] {
  bury(removed);
  const byId = new Map(current.map((record) => [record.id, record]));
  const fresh = rows.filter((row) => {
    if (buried(row)) return false;
    const have = byId.get(row.id);
    if (!have) return true;
    if ((have.status === "running") !== (row.status === "running")) return have.status === "running";
    return stampOf(row) > stampOf(have);
  });
  if (fresh.length === 0 && !current.some(buried)) return current;
  return mergeHistory(fresh, current.filter((record) => !buried(record)));
}

/** Session rows win on id collision, unless the other copy was changed later,
    so a generate that landed before IDB finished reading is not wiped by the
    delayed load. */
export function mergeHistory(stored: RunRecord[], live: RunRecord[]): RunRecord[] {
  const byId = new Map<string, RunRecord>();
  for (const row of [...stored, ...live]) {
    const prev = byId.get(row.id);
    if (!prev || newerRecord(row, prev)) byId.set(row.id, row);
  }
  /* A request that ended keeps none of its running tiles, whichever copy still
     held them: the swap one tab made is not undone by another tab's save. A
     row deleted this session stays deleted, whichever copy brings it back. */
  const rows = [...byId.values()].filter((row) => !buried(row));
  const ended = new Set(rows.filter((row) => row.status !== "running").map(requestIdOf));
  return capHistory(
    rows
      .filter((row) => row.status !== "running" || !ended.has(requestIdOf(row)))
      .sort((a, b) => b.createdAt - a.createdAt),
  );
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
   deliberate keep, so only unmarked runs age out of the window. A favorite
   just released lingers a while, so its newer copy is still around to beat a
   stale one another tab may yet save. */
const RELEASE_GRACE_MS = 10 * 60_000;

export function capHistory(records: RunRecord[], max = MAX_RECORDS, now = Date.now()): RunRecord[] {
  if (records.length <= max) return records;
  let kept = 0;
  return records.filter(
    (record) =>
      record.favorite === true ||
      record.status === "running" ||
      (record.favorite === false && now - (record.updatedAt ?? 0) < RELEASE_GRACE_MS) ||
      kept++ < max,
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
  return stampOf(row) >= stampOf(prev);
}

function stampOf(record: RunRecord): number {
  return record.updatedAt ?? record.createdAt;
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
    (record.updatedAt === undefined || typeof record.updatedAt === "number") &&
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
