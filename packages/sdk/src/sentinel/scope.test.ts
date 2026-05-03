// SPDX-License-Identifier: Apache-2.0

/**
 * withScope regression suite (Sprint 8 M3). Verifies the transient
 * snapshot/restore semantics for tags / contexts / extras / user, the
 * sync + async overloads (including the rejection path that must still
 * restore), nested scopes (LIFO restore order), and the documented
 * divergence — breadcrumbs persist beyond the scope.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { withScope } from './scope';
import { Browsonic } from './browsonic';
import { createTelemetryStore } from '../telemetry';
import type { UserContext } from '../types';

function makeSdk(): Browsonic {
  const sdk = new Browsonic();
  // Minimal config wiring — withScope only touches metadata / contexts /
  // extras / user / telemetryStore. We avoid full init() so tests stay
  // fast and don't pull collectors in.
  sdk.config = {
    redactKeys: new Set<string>(),
    redactKeyPatterns: [],
  } as unknown as Browsonic['config'];
  sdk.telemetryStore = createTelemetryStore(20);
  return sdk;
}

describe('withScope (Sprint 8 M3) — sync', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeSdk();
  });

  it('setTag inside the block is visible inside, gone after', () => {
    sdk.setTag('persistent', 'yes');

    let insideValue: string | number | boolean | undefined;
    withScope(sdk, (scope) => {
      scope.setTag('order_id', '123');
      insideValue = sdk.metadata.order_id;
    });

    expect(insideValue).toBe('123');
    expect(sdk.metadata.order_id).toBeUndefined();
    expect(sdk.metadata.persistent).toBe('yes');
  });

  it('setContext inside the block is visible inside, gone after', () => {
    let insideCtx: Record<string, unknown> | undefined;
    withScope(sdk, (scope) => {
      scope.setContext('order', { id: 1, total: 99 });
      insideCtx = sdk.contexts.order;
    });

    expect(insideCtx).toEqual({ id: 1, total: 99 });
    expect(sdk.contexts.order).toBeUndefined();
  });

  it('setExtra inside the block is visible inside, gone after', () => {
    let insideExtra: unknown;
    withScope(sdk, (scope) => {
      scope.setExtra('debug', { snapshot: [1, 2, 3] });
      insideExtra = sdk.extras.debug;
    });

    expect(insideExtra).toEqual({ snapshot: [1, 2, 3] });
    expect(sdk.extras.debug).toBeUndefined();
  });

  it('setUser inside the block is restored to null after', () => {
    expect(sdk.user).toBeNull();
    withScope(sdk, (scope) => {
      scope.setUser({ id: 'u1', email: 'a@b.test' } as UserContext);
      expect(sdk.user).not.toBeNull();
    });
    expect(sdk.user).toBeNull();
  });

  it('setUser inside the block is restored to a previous user', () => {
    sdk.setUser({ id: 'orig' } as UserContext);
    withScope(sdk, (scope) => {
      scope.setUser({ id: 'inner' } as UserContext);
      expect((sdk.user as UserContext).id).toBe('inner');
    });
    expect((sdk.user as UserContext).id).toBe('orig');
  });

  it('returns the value of the callback', () => {
    const value = withScope(sdk, () => 42);
    expect(value).toBe(42);
  });

  it('restores the snapshot when the callback throws (state is not corrupted)', () => {
    sdk.setTag('persistent', 'yes');

    expect(() =>
      withScope(sdk, (scope) => {
        scope.setTag('inner', 'maybe');
        throw new Error('boom');
      })
    ).toThrow('boom');

    expect(sdk.metadata.persistent).toBe('yes');
    expect(sdk.metadata.inner).toBeUndefined();
  });

  it('nested scopes restore in LIFO order', () => {
    sdk.setTag('layer', 'root');

    withScope(sdk, (outer) => {
      outer.setTag('layer', 'outer');
      expect(sdk.metadata.layer).toBe('outer');

      withScope(sdk, (inner) => {
        inner.setTag('layer', 'inner');
        expect(sdk.metadata.layer).toBe('inner');
      });

      // After inner scope, outer's value is back
      expect(sdk.metadata.layer).toBe('outer');
    });

    // After outer scope, root is back
    expect(sdk.metadata.layer).toBe('root');
  });
});

describe('withScope (Sprint 8 M3) — async', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeSdk();
  });

  it('awaits an async callback and restores after resolution', async () => {
    sdk.setTag('persistent', 'yes');

    const result = await withScope(sdk, async (scope) => {
      scope.setTag('async_tag', 'live');
      await Promise.resolve();
      expect(sdk.metadata.async_tag).toBe('live');
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(sdk.metadata.async_tag).toBeUndefined();
    expect(sdk.metadata.persistent).toBe('yes');
  });

  it('restores the snapshot when the async callback rejects', async () => {
    sdk.setTag('persistent', 'yes');

    await expect(
      withScope(sdk, async (scope) => {
        scope.setTag('inner', 'maybe');
        await Promise.resolve();
        throw new Error('async-boom');
      })
    ).rejects.toThrow('async-boom');

    expect(sdk.metadata.persistent).toBe('yes');
    expect(sdk.metadata.inner).toBeUndefined();
  });
});

describe('withScope (Sprint 8 M3) — breadcrumb divergence', () => {
  it('breadcrumbs added inside a scope persist beyond it (documented)', () => {
    const sdk = makeSdk();

    withScope(sdk, (scope) => {
      scope.addBreadcrumb({ category: 'navigation', message: 'inside' });
    });

    const timeline = sdk.telemetryStore!.getTimeline();
    expect(timeline.breadcrumb.length).toBe(1);
    expect(timeline.breadcrumb[0].message).toBe('inside');
  });
});
