export type Kv = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  /** Reads a key and writes what `change` makes of it in one transaction, so
      another tab's write cannot land between the two. */
  update<T>(key: string, change: (current: unknown) => T): Promise<T>;
};

export type LegacyStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const DB_NAME = "openhiggsfield";
const STORE = "kv";
const VERSION = 1;

export function memoryKv(): Kv {
  const map = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return map.get(key) as T | undefined;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async update(key, change) {
      const next = change(map.get(key));
      map.set(key, next);
      return next;
    },
  };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onabort = () => reject(tx.error ?? req.error);
        tx.onerror = () => reject(tx.error ?? req.error);
      }),
  );
}

export function idbKv(): Kv {
  return {
    get<T>(key: string) {
      return request("readonly", (store) => store.get(key)) as Promise<T | undefined>;
    },
    async set(key, value) {
      await request("readwrite", (store) => store.put(value, key));
    },
    update<T>(key: string, change: (current: unknown) => T) {
      return open().then(
        (db) =>
          new Promise<T>((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            const store = tx.objectStore(STORE);
            const read = store.get(key);
            let next: T;
            read.onsuccess = () => {
              next = change(read.result);
              store.put(next, key);
            };
            tx.oncomplete = () => resolve(next);
            tx.onabort = () => reject(tx.error ?? read.error);
            tx.onerror = () => reject(tx.error ?? read.error);
          }),
      );
    },
  };
}

let browser: Kv | undefined;

export function defaultKv(): Kv {
  if (typeof indexedDB === "undefined") return memoryKv();
  browser ??= idbKv();
  return browser;
}

export function browserLegacy(): LegacyStore | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}
