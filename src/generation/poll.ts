import { unstable_isUnrecognizedActionError } from "next/navigation";

import { getGenerationStatuses, type StatusAnswer } from "./actions";
import type { GenerationStatus } from "./platform";

/** Statuses the platform never moves off again. */
const TERMINAL = new Set(["completed", "failed", "nsfw", "canceled"]);

export const POLL_INTERVAL_MS = 4000;
export const POLL_DEADLINE_MS = 10 * 60_000;
/** Rounds allowed to fail back to back before the watches are given up on. One
    dropped round must not end every generation in flight. */
const MAX_MISSES = 3;
/** Requests asked about in one round; the server action refuses more. */
const MAX_PER_ROUND = 50;
/** Asks in one window that show the tab was awake for most of it. A window
    that ends on a passing error after this many is overdue all the same; one
    that slept through its deadline has far fewer. */
const AWAKE_ASKS = Math.floor(POLL_DEADLINE_MS / POLL_INTERVAL_MS / 2);

/** The watch ended without the platform saying how the run went: the
    connection kept failing, the run outlasted its window, the key was turned
    away, or the app was redeployed. The run itself may still finish and be
    billed, so its rows are left running to be asked about again. */
export class WatchInterrupted extends Error {}

/** The interruption is the key's: missing, or not accepted. Asking again only
    helps once the key is fixed. */
export class KeyRefused extends WatchInterrupted {}

/** The run outlasted its window: the platform kept answering, never with an
    ending. */
export class Overdue extends WatchInterrupted {}

/** The app was redeployed under this tab: its server actions are gone, so
    asking again fails the same way until the page is reloaded. */
export class StaleBuild extends WatchInterrupted {}

type Waiter = {
  deadline: number;
  /** The platform said how the run stands the last time it was asked, rather
      than failing in passing. Only then is a run past its window overdue. */
  answered: boolean;
  /** Times the platform was asked about this run in this window. */
  asked: number;
  resolve: (status: GenerationStatus) => void;
  reject: (reason: Error) => void;
};

const waiting = new Map<string, Waiter>();
const inflight = new Map<string, Promise<GenerationStatus>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let polling = false;
let misses = 0;

/** Resolves when the platform reports a terminal status for this request.
    Every request in flight is asked for together, in one server action per
    interval: Next dispatches server actions one at a time per client, so a
    poll per run would queue ahead of the next submit and the composer would
    stall again — with the lock gone and the queue doing the same work. */
export function watchRequest(
  requestId: string,
  opts?: { deadline?: number },
): Promise<GenerationStatus> {
  const existing = inflight.get(requestId);
  if (existing) return existing;
  const promise = new Promise<GenerationStatus>((resolve, reject) => {
    waiting.set(requestId, {
      deadline: opts?.deadline ?? Date.now() + POLL_DEADLINE_MS,
      answered: false,
      asked: 0,
      resolve: (status) => {
        inflight.delete(requestId);
        resolve(status);
      },
      reject: (reason) => {
        inflight.delete(requestId);
        reject(reason);
      },
    });
    schedule();
  });
  inflight.set(requestId, promise);
  return promise;
}

export function isWatching(requestId: string): boolean {
  return inflight.has(requestId);
}

/** Drops every watch without settling it: the studio unmounted and there is
    nobody left to hand a result to. In-flight jobs stay in history and the
    next mount starts a fresh watch. */
export function stopWatching(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  misses = 0;
  waiting.clear();
  inflight.clear();
}

function schedule(): void {
  if (timer !== null || polling || waiting.size === 0) return;
  timer = setTimeout(() => void round(), POLL_INTERVAL_MS);
}

async function round(): Promise<void> {
  timer = null;
  polling = true;
  try {
    const requestIds = [...waiting.keys()].slice(0, MAX_PER_ROUND);
    /* Asked requests go to the back of the line, so past the cap every
       request still gets its turn. */
    for (const requestId of requestIds) {
      const waiter = waiting.get(requestId)!;
      waiting.delete(requestId);
      waiting.set(requestId, waiter);
    }
    const results = await getGenerationStatuses({ requestIds });
    misses = 0;
    for (const result of results) deliver(result);
    sweep();
  } catch (caught) {
    /* No number of rounds brings a retired build's actions back. */
    if (unstable_isUnrecognizedActionError(caught)) {
      settleAll(new StaleBuild("Hay una versión nueva de la app"));
      return;
    }
    if (++misses < MAX_MISSES) return;
    settleAll(new WatchInterrupted("Se perdió la conexión con Higgsfield"));
  } finally {
    polling = false;
    schedule();
  }
}

function deliver(result: StatusAnswer): void {
  const waiter = waiting.get(result.requestId);
  if (!waiter) return;
  waiter.asked++;
  if ("error" in result) {
    /* A 429, a 5xx or a dropped connection says nothing about the run; it is
       asked about again next round, up to its deadline. */
    if (result.about === null) {
      waiter.answered = false;
      return;
    }
    waiting.delete(result.requestId);
    waiter.reject(result.about === "key" ? new KeyRefused(result.error) : new Error(result.error));
    return;
  }
  if (!TERMINAL.has(result.status.status)) {
    waiter.answered = true;
    return;
  }
  waiting.delete(result.requestId);
  waiter.resolve(result.status);
}

/* A run the platform never finishes would otherwise be asked about for the
   rest of the session. Past its window the watch stops; the run is not over.
   The window is wall-clock, so it can run out while the machine sleeps: a
   deadline met by a passing error is an interruption, not an overdue run —
   unless the run was asked about all window long and never got an answer. */
function sweep(): void {
  const now = Date.now();
  for (const [requestId, waiter] of [...waiting]) {
    if (now <= waiter.deadline) continue;
    waiting.delete(requestId);
    waiter.reject(
      waiter.answered || waiter.asked >= AWAKE_ASKS
        ? new Overdue("Higgsfield tardó demasiado en responder")
        : new WatchInterrupted("Se perdió la conexión con Higgsfield"),
    );
  }
}

function settleAll(reason: Error): void {
  const waiters = [...waiting.values()];
  waiting.clear();
  misses = 0;
  for (const waiter of waiters) waiter.reject(reason);
}
