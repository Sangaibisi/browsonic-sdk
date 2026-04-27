/**
 * user-metadata helpers — covers the thin delegation layer used by the
 * Browsonic class (setUser / clearUser / *Metadata). The goal here is to
 * lock in the mask behaviour: `redactKeys` (Set-fast-path) and
 * `redactKeyPatterns` (substring fallback) must both redact without
 * re-introducing the legacy `toLowerCase()` per-iteration allocation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setUser, clearUser, addMetadata, removeMetadata, clearMetadata } from './user-metadata';
import type { Browsonic } from './browsonic';
import type { UserContext } from '../types';

type SdkStub = Pick<Browsonic, 'config' | 'user' | 'metadata' | 'debugLog'>;

function makeSdk(overrides: Partial<SdkStub> = {}): Browsonic {
  const config = {
    // resolveConfig already lowercases entries — mirror that here so
    // tests exercise the fast path (lowerKey stays lowerKey) and not
    // an accidental type coercion.
    redactKeys: new Set<string>(['password', 'ssn']),
    redactKeyPatterns: ['token'],
  };
  const logs: unknown[] = [];
  const sdk: SdkStub = {
    config: config as unknown as Browsonic['config'],
    user: null,
    metadata: {},
    debugLog: ((..._args: unknown[]) => {
      logs.push(_args);
    }) as unknown as Browsonic['debugLog'],
    ...overrides,
  };
  return sdk as Browsonic;
}

describe('setUser', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeSdk();
  });

  it('stores a copy of the user context (does not mutate the input)', () => {
    const original: UserContext = { id: 'u1', email: 'a@b.test' };
    setUser(sdk, original);
    expect(sdk.user).toEqual(original);
    expect(sdk.user).not.toBe(original);
  });

  it('masks fields whose lower-cased key is in redactKeys (Set fast path)', () => {
    setUser(sdk, { id: 'u1', password: 'secret', SSN: 'x' } as UserContext);
    expect(sdk.user).toEqual({ id: 'u1', password: '***', SSN: '***' });
  });

  it('masks fields that match a redactKeyPatterns substring', () => {
    setUser(sdk, {
      id: 'u1',
      apiToken: 'abc',
      refreshTokenV2: 'def',
    } as unknown as UserContext);
    expect((sdk.user as Record<string, unknown>).apiToken).toBe('***');
    expect((sdk.user as Record<string, unknown>).refreshTokenV2).toBe('***');
  });

  it('leaves non-string values untouched even if the key is redacted', () => {
    setUser(sdk, {
      id: 'u1',
      password: 12345,
    } as unknown as UserContext);
    expect((sdk.user as Record<string, unknown>).password).toBe(12345);
  });

  it('is a no-op when config is null (early-init safety)', () => {
    const noConfigSdk = makeSdk({ config: null as unknown as Browsonic['config'] });
    setUser(noConfigSdk, { id: 'u1', password: 'p' } as UserContext);
    expect(noConfigSdk.user).toEqual({ id: 'u1', password: 'p' });
  });
});

describe('clearUser', () => {
  it('resets user to null', () => {
    const sdk = makeSdk({ user: { id: 'u1' } as UserContext });
    clearUser(sdk);
    expect(sdk.user).toBeNull();
  });
});

describe('addMetadata / removeMetadata / clearMetadata', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeSdk();
  });

  it('addMetadata writes string values', () => {
    addMetadata(sdk, 'env', 'prod');
    expect(sdk.metadata).toEqual({ env: 'prod' });
  });

  it('addMetadata accepts numbers and booleans', () => {
    addMetadata(sdk, 'retries', 3);
    addMetadata(sdk, 'beta', true);
    expect(sdk.metadata).toEqual({ retries: 3, beta: true });
  });

  it('removeMetadata deletes by key', () => {
    sdk.metadata = { a: 1, b: 2 };
    removeMetadata(sdk, 'a');
    expect(sdk.metadata).toEqual({ b: 2 });
  });

  it('clearMetadata empties the object', () => {
    sdk.metadata = { a: 1, b: 2 };
    clearMetadata(sdk);
    expect(sdk.metadata).toEqual({});
  });
});
