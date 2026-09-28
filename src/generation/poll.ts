import { getGenerationStatuses } from "./actions";
import type { ErrorCode, GenerationStatus, StatusResult } from "./platform";

/** Statuses the platform never moves off again. */
const TERMINAL = new Set(["completed", "failed", "nsfw", "canceled"]);

/* The polling guide: start at two seconds, grow gradually to ten, add jitter. */
const FIRST_DELAY_MS = 2000;
const MAX_DELAY_MS = 10_000;
const GROWTH = 1.5;
const JITTER_MS = 500;
export const POLL_DEADLINE_MS = 10 * 60_000;
/** Rounds allowed to fail back to back before the watches are given up on. One
    dropped round must not end every generation in flight. */
const MAX_MISSES = 5;

export class WatchError extends Error {
  readonly code: ErrorCode | "timeout";

  constructor(message: string, code: ErrorCode | "timeout") {
    super(message);
    this.name = "WatchError";
    this.code = code;
  }
}

type Waiter = {
  deadline: number;
  resolve: (status: GenerationStatus) => void;
  reject: (reason: WatchError) => void;
};

const waiting = new Map<string, Waiter>();
const inflight = new Map<string, Promise<GenerationStatus>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let polling = false;
let misses = 0;
let delay = FIRST_DELAY_MS;

/** Resolves when the platform reports a terminal status for this request.
    Every request in flight is asked for together, in one server action per
    round: Next dispatches server actions one at a time per client, so a poll
    per run would queue ahead of the next submit. */
export function watchRequest(
  requestId: string,
  opts?: { deadline?: number },
): Promise<GenerationStatus> {
  const existing = inflight.get(requestId);
  if (existing) return existing;
  const promise = new Promise<GenerationStatus>((resolve, reject) => {
    waiting.set(requestId, {
      deadline: opts?.deadline ?? Date.now() + POLL_DEADLINE_MS,
      resolve: (status) => {
        inflight.delete(requestId);
        resolve(status);
      },
      reject: (reason) => {
        inflight.delete(requestId);
        reject(reason);
      },
    });
    /* A new request is worth an early look, whatever the backoff reached. */
    delay = FIRST_DELAY_MS;
    if (timer !== null && !polling) {
      clearTimeout(timer);
      timer = null;
    }
    schedule();
  });
  inflight.set(requestId, promise);
  return promise;
}

/** Look again soon — after a cancel, whose answer only the status carries. */
export function pollSoon(): void {
  delay = FIRST_DELAY_MS;
  if (timer !== null && !polling) {
    clearTimeout(timer);
    timer = null;
  }
  schedule();
}

/** Drops every watch without settling it: the studio unmounted and there is
    nobody left to hand a result to. In-flight jobs stay in history and the
    next mount starts a fresh watch. */
export function stopWatching(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  misses = 0;
  delay = FIRST_DELAY_MS;
  waiting.clear();
  inflight.clear();
}

function schedule(): void {
  if (timer !== null || polling || waiting.size === 0) return;
  timer = setTimeout(() => void round(), delay + Math.random() * JITTER_MS);
}

async function round(): Promise<void> {
  timer = null;
  polling = true;
  try {
    const answer = await getGenerationStatuses({ requestIds: [...waiting.keys()] });
    if (!answer.ok) {
      /* A missing or refused key ends every watch at once; anything else is a
         dropped round, retried on the backoff. */
      if (answer.code === "missing_key" || answer.code === "invalid_key") {
        settleAll(new WatchError(answer.error, answer.code));
      } else {
        miss(new WatchError(answer.error, answer.code));
      }
      return;
    }
    misses = 0;
    for (const result of answer.results) deliver(result);
    sweep();
  } catch {
    miss(new WatchError("Lost contact with the studio server while checking on runs.", "network"));
  } finally {
    polling = false;
    delay = Math.min(delay * GROWTH, MAX_DELAY_MS);
    schedule();
  }
}

function miss(reason: WatchError): void {
  if (++misses < MAX_MISSES) {
    sweep();
    return;
  }
  settleAll(reason);
}

function deliver(result: StatusResult): void {
  const waiter = waiting.get(result.requestId);
  if (!waiter) return;
  if ("error" in result) {
    /* 5xx and network failures are retried until the deadline; 401 and 404
       will not change by asking again. */
    if (result.retryable) return;
    waiting.delete(result.requestId);
    waiter.reject(new WatchError(result.error, result.code));
    return;
  }
  if (!TERMINAL.has(result.status.status)) return;
  waiting.delete(result.requestId);
  waiter.resolve(result.status);
}

/* A run the platform never finishes would otherwise hold its skeleton open for
   the rest of the session. */
function sweep(): void {
  const now = Date.now();
  for (const [requestId, waiter] of [...waiting]) {
    if (now <= waiter.deadline) continue;
    waiting.delete(requestId);
    waiter.reject(
      new WatchError(
        "Stopped waiting after 10 minutes. The run may still finish on open.higgsfield.ai.",
        "timeout",
      ),
    );
  }
}

function settleAll(reason: WatchError): void {
  const waiters = [...waiting.values()];
  waiting.clear();
  misses = 0;
  for (const waiter of waiters) waiter.reject(reason);
}
