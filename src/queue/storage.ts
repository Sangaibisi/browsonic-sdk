/**
 * Three-stage persist-queue backend (Sprint P15 / F3.1.G).
 *
 *   1. `localStorage` — primary. Synchronous, ~5 MB quota, ubiquitous.
 *   2. IndexedDB     — fallback. Async, ~50 MB+ quota, survives
 *      localStorage quota exhaustion + Safari's private-mode disable.
 *   3. In-memory     — terminal. Events stay in the queue and are lost
 *      if the tab closes before drain; better than losing them mid-run.
 *
 * The tier escalation is driven by write failure: stage 1 is always
 * attempted; on throw (quota, SecurityError, parse) stage 2 is
 * attempted; on IndexedDB failure events are silently left in memory.
 * Reads reverse the order — if localStorage is empty we still probe
 * IndexedDB in case an earlier session escalated.
 *
 * All methods are defensive: any unexpected error is logged via the
 * caller's `debugLog` and swallowed. Persistence is best-effort; it
 * must never crash the SDK.
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

type DebugLog = (message: string, ...args: unknown[]) => void;

const IDB_NAME = '__browsonic_queue_db';
const IDB_STORE = 'queue';
const IDB_VERSION = 1;

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
      req.onblocked = () => reject(new Error('indexedDB open blocked'));
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function idbRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        try {
          const tx = db.transaction(IDB_STORE, mode);
          const store = tx.objectStore(IDB_STORE);
          const req = action(store);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
          tx.onerror = () => reject(tx.error ?? new Error('indexedDB tx failed'));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })
  );
}

/**
 * Persist `serialized` to disk using the tiered strategy. Resolves
 * once the first tier succeeds; rejects only when every tier fails —
 * callers that treat persistence as best-effort should ignore the
 * rejection.
 */
export async function persistToTiers(
  key: string,
  serialized: string,
  debugLog: DebugLog
): Promise<'localStorage' | 'indexedDB' | null> {
  // Stage 1: localStorage.
  try {
    localStorage.setItem(key, serialized);
    return 'localStorage';
  } catch (err) {
    debugLog('persist(localStorage) failed, escalating to IndexedDB:', err);
  }

  // Stage 2: IndexedDB.
  if (hasIndexedDB()) {
    try {
      await idbRequest('readwrite', (store) => store.put(serialized, key));
      return 'indexedDB';
    } catch (err) {
      debugLog('persist(IndexedDB) failed, events remain in memory:', err);
    }
  }

  // Stage 3: in-memory only — caller keeps events in the queue.
  return null;
}

/**
 * Load a previously-persisted queue payload. Probes localStorage
 * first, then IndexedDB. Returns null when both tiers are empty or
 * unavailable. On success the caller is responsible for clearing via
 * {@link clearTiers}.
 */
export async function loadFromTiers(key: string, debugLog: DebugLog): Promise<string | null> {
  // Stage 1: localStorage.
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
  } catch (err) {
    debugLog('load(localStorage) failed, escalating to IndexedDB:', err);
  }

  // Stage 2: IndexedDB.
  if (hasIndexedDB()) {
    try {
      const stored = await idbRequest<string | undefined>('readonly', (store) => store.get(key));
      if (typeof stored === 'string' && stored.length > 0) {
        return stored;
      }
    } catch (err) {
      debugLog('load(IndexedDB) failed:', err);
    }
  }

  return null;
}

/**
 * Remove the persisted payload from both tiers. Caller invokes this
 * after a successful load so the same events aren't replayed twice.
 */
export async function clearTiers(key: string, debugLog: DebugLog): Promise<void> {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    debugLog('clear(localStorage) failed:', err);
  }
  if (hasIndexedDB()) {
    try {
      await idbRequest('readwrite', (store) => store.delete(key));
    } catch (err) {
      debugLog('clear(IndexedDB) failed:', err);
    }
  }
}
