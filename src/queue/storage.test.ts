/**
 * Tiered persist backend (Sprint P15 / F3.1.G) — unit coverage.
 *
 * Covers the three stages declared in storage.ts header comment:
 *   1. localStorage happy path + quota exhaustion escalation
 *   2. IndexedDB fallback (best-effort)
 *   3. in-memory terminal (both tiers unavailable)
 *
 * happy-dom ships only a partial localStorage stub (setItem/removeItem
 * missing in some versions) — we install a deterministic fake for the
 * lifetime of each test so behaviour is portable. IndexedDB is absent
 * in happy-dom, so the stage-2 path is exercised by feeding a
 * temporary fake-indexedDB global.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { persistToTiers, loadFromTiers, clearTiers } from './storage';

const KEY = '__browsonic_test_queue';
const debugLog = vi.fn();

interface FakeLocalStorage {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
  store: Map<string, string>;
}

function installFakeLocalStorage(): FakeLocalStorage {
  const store = new Map<string, string>();
  // happy-dom exposes a partial Storage implementation whose methods
  // are not always spy-able; install a deterministic fake on
  // globalThis.localStorage so the SDK under test picks it up
  // transparently. The generic vi.fn() keeps MockInstance's signature
  // loose (any[]/unknown) so callers can override with mockImplementation
  // without triggering TS2322 parameter-variance errors.
  const getItem = vi.fn();
  getItem.mockImplementation((k: string) => (store.has(k) ? store.get(k)! : null));
  const setItem = vi.fn();
  setItem.mockImplementation((k: string, v: string) => {
    store.set(k, v);
  });
  const removeItem = vi.fn();
  removeItem.mockImplementation((k: string) => {
    store.delete(k);
  });
  const fake: FakeLocalStorage = { store, getItem, setItem, removeItem };
  Object.defineProperty(globalThis, 'localStorage', {
    value: fake,
    configurable: true,
    writable: true,
  });
  return fake;
}

describe('persistToTiers — localStorage happy path', () => {
  let fake: FakeLocalStorage;

  beforeEach(() => {
    fake = installFakeLocalStorage();
    debugLog.mockReset();
  });

  it('writes to localStorage and returns the tier marker', async () => {
    const result = await persistToTiers(KEY, 'payload', debugLog);
    expect(result).toBe('localStorage');
    expect(fake.store.get(KEY)).toBe('payload');
    expect(debugLog).not.toHaveBeenCalled();
  });
});

describe('persistToTiers — escalation when localStorage throws', () => {
  let fake: FakeLocalStorage;

  beforeEach(() => {
    fake = installFakeLocalStorage();
    fake.setItem.mockImplementation(() => {
      throw new DOMException('QuotaExceeded', 'QuotaExceededError');
    });
    debugLog.mockReset();
  });

  it('logs failure and falls through to the terminal tier when IDB absent', async () => {
    const originalIdb = (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = undefined;

    try {
      const result = await persistToTiers(KEY, 'payload', debugLog);
      expect(result).toBeNull();
      expect(debugLog).toHaveBeenCalledWith(
        'persist(localStorage) failed, escalating to IndexedDB:',
        expect.any(DOMException)
      );
    } finally {
      (globalThis as unknown as { indexedDB: unknown }).indexedDB = originalIdb;
    }
  });

  it('attempts IndexedDB when available and reports tier on success', async () => {
    type FakeReq = { onsuccess?: () => void; onerror?: () => void; result?: unknown };
    const put = vi.fn(() => {
      const req: FakeReq = {};
      queueMicrotask(() => req.onsuccess?.());
      return req as unknown as IDBRequest<unknown>;
    });
    const transactionStub = {
      objectStore: () => ({ put }),
    } as unknown as IDBTransaction;
    const dbStub = {
      transaction: () => transactionStub,
      objectStoreNames: { contains: () => true },
    } as unknown as IDBDatabase;
    const idbOpen = vi.fn(() => {
      const req: FakeReq = { result: dbStub };
      queueMicrotask(() => req.onsuccess?.());
      return req as unknown as IDBOpenDBRequest;
    });
    const originalIdb = (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = { open: idbOpen };

    try {
      const result = await persistToTiers(KEY, 'payload', debugLog);
      expect(result).toBe('indexedDB');
      expect(put).toHaveBeenCalledWith('payload', KEY);
    } finally {
      (globalThis as unknown as { indexedDB: unknown }).indexedDB = originalIdb;
    }
  });
});

describe('loadFromTiers', () => {
  let fake: FakeLocalStorage;

  beforeEach(() => {
    fake = installFakeLocalStorage();
    debugLog.mockReset();
  });

  it('reads from localStorage when present', async () => {
    fake.store.set(KEY, 'saved');
    const result = await loadFromTiers(KEY, debugLog);
    expect(result).toBe('saved');
  });

  it('returns null when neither tier has the key', async () => {
    const originalIdb = (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = undefined;
    try {
      const result = await loadFromTiers(KEY, debugLog);
      expect(result).toBeNull();
    } finally {
      (globalThis as unknown as { indexedDB: unknown }).indexedDB = originalIdb;
    }
  });

  it('logs and continues to IDB when localStorage.getItem throws', async () => {
    fake.getItem.mockImplementation(() => {
      throw new Error('access denied');
    });
    const originalIdb = (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = undefined;

    try {
      const result = await loadFromTiers(KEY, debugLog);
      expect(result).toBeNull();
      expect(debugLog).toHaveBeenCalledWith(
        'load(localStorage) failed, escalating to IndexedDB:',
        expect.any(Error)
      );
    } finally {
      (globalThis as unknown as { indexedDB: unknown }).indexedDB = originalIdb;
    }
  });
});

describe('clearTiers', () => {
  let fake: FakeLocalStorage;

  beforeEach(() => {
    fake = installFakeLocalStorage();
    debugLog.mockReset();
  });

  it('removes the key from localStorage', async () => {
    fake.store.set(KEY, 'saved');
    await clearTiers(KEY, debugLog);
    expect(fake.store.has(KEY)).toBe(false);
  });

  it('logs but does not throw when localStorage.removeItem fails', async () => {
    fake.removeItem.mockImplementation(() => {
      throw new Error('denied');
    });
    const originalIdb = (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = undefined;

    try {
      await expect(clearTiers(KEY, debugLog)).resolves.toBeUndefined();
      expect(debugLog).toHaveBeenCalledWith('clear(localStorage) failed:', expect.any(Error));
    } finally {
      (globalThis as unknown as { indexedDB: unknown }).indexedDB = originalIdb;
    }
  });
});
