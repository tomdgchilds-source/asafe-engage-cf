// ─────────────────────────────────────────────────────────
// Minimal IndexedDB wrapper for the Survey Walk offline upload queue
// (Phase 3, Task S2). One database, one object store ("uploads",
// keyPath "id"), no library. Every call opens (or reuses) the
// connection lazily so callers never manage the handle themselves.
// ─────────────────────────────────────────────────────────

export const DB_NAME = "asafe-survey-walk";
export const DB_VERSION = 1;
export const UPLOADS_STORE = "uploads";

let dbPromise: Promise<IDBDatabase> | null = null;

export function idbSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

/** Open (or reuse) the walk database, creating the uploads store on first run. */
export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!idbSupported()) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(UPLOADS_STORE)) {
        const store = db.createObjectStore(UPLOADS_STORE, { keyPath: "id" });
        store.createIndex("surveyId", "surveyId", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB open blocked by another tab"));
  }).catch((err: unknown) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function whenDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Insert or replace one record (keyed by its `id` property). */
export async function idbPut<T>(store: string, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(value);
  await whenDone(tx);
}

/** Read every record in a store. */
export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  return promisify(tx.objectStore(store).getAll() as IDBRequest<T[]>);
}

/** Delete one record by key. Deleting a missing key is a no-op. */
export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(key);
  await whenDone(tx);
}
