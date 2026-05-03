// SPDX-License-Identifier: Apache-2.0

/**
 * addBreadcrumb regression suite (Sprint 8 M2). Locks in the defaults
 * (`level` → `'info'`, store auto-fills `timestamp`), the no-op when
 * the store is uninitialised, and the defensive `safeExecute` envelope
 * so a thrown collector callback can't crash the host app.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { addBreadcrumb } from './breadcrumbs';
import { createTelemetryStore } from '../telemetry';
import type { Browsonic } from './browsonic';
import type { TelemetryStore } from '../telemetry';
import type { BreadcrumbTelemetryData } from '../telemetry';

type SdkStub = Pick<Browsonic, 'telemetryStore' | 'debugLog'>;

function makeSdk(store: TelemetryStore | null = createTelemetryStore(10)): Browsonic {
  const sdk: SdkStub = {
    telemetryStore: store,
    debugLog: (() => {}) as unknown as Browsonic['debugLog'],
  };
  return sdk as Browsonic;
}

describe('addBreadcrumb (Sprint 8 M2)', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeSdk();
  });

  it('appends a breadcrumb under the breadcrumb timeline category', () => {
    addBreadcrumb(sdk, {
      category: 'navigation',
      message: 'user navigated',
      data: { from: '/a', to: '/b' },
    });

    const timeline = sdk.telemetryStore!.getTimeline();
    expect(timeline.breadcrumb.length).toBe(1);
    const entry = timeline.breadcrumb[0];
    expect(entry.category).toBe('navigation');
    expect(entry.message).toBe('user navigated');
    expect(entry.data).toEqual({ from: '/a', to: '/b' });
  });

  it('defaults level to "info" when omitted', () => {
    addBreadcrumb(sdk, { category: 'ui' });
    const entry = sdk.telemetryStore!.getTimeline().breadcrumb[0];
    expect(entry.level).toBe('info');
  });

  it('preserves an explicit level', () => {
    addBreadcrumb(sdk, { category: 'http', level: 'warning' });
    const entry = sdk.telemetryStore!.getTimeline().breadcrumb[0];
    expect(entry.level).toBe('warning');
  });

  it('auto-fills an ISO timestamp via the telemetry store', () => {
    const before = Date.now();
    addBreadcrumb(sdk, { category: 'auth' });
    const after = Date.now();

    const entry = sdk.telemetryStore!.getTimeline().breadcrumb[0];
    expect(typeof entry.timestamp).toBe('string');
    const ts = Date.parse(entry.timestamp);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('omits message and data when not provided (lean wire format)', () => {
    addBreadcrumb(sdk, { category: 'log' });
    const entry = sdk.telemetryStore!.getTimeline().breadcrumb[0] as {
      timestamp: string;
    } & BreadcrumbTelemetryData;
    expect(entry.message).toBeUndefined();
    expect(entry.data).toBeUndefined();
  });

  it('keeps console / network / visitor channels untouched', () => {
    sdk.telemetryStore!.add({
      category: 'console',
      data: { level: 'log', message: 'hi', stack: null },
    });
    addBreadcrumb(sdk, { category: 'navigation' });

    const timeline = sdk.telemetryStore!.getTimeline();
    expect(timeline.console.length).toBe(1);
    expect(timeline.breadcrumb.length).toBe(1);
    expect(timeline.network).toEqual([]);
    expect(timeline.visitor).toEqual([]);
  });

  it('preserves chronological order across multiple adds', () => {
    addBreadcrumb(sdk, { category: 'ui', message: 'click 1' });
    addBreadcrumb(sdk, { category: 'ui', message: 'click 2' });
    addBreadcrumb(sdk, { category: 'ui', message: 'click 3' });

    const messages = sdk.telemetryStore!.getTimeline().breadcrumb.map((b) => b.message);
    expect(messages).toEqual(['click 1', 'click 2', 'click 3']);
  });

  it('is a no-op when telemetryStore is null (pre-init)', () => {
    const noStoreSdk = makeSdk(null);
    // must not throw
    expect(() => addBreadcrumb(noStoreSdk, { category: 'navigation' })).not.toThrow();
  });

  it('is a no-op while the store is paused (Critical Path)', () => {
    addBreadcrumb(sdk, { category: 'ui', message: 'before' });
    sdk.telemetryStore!.pause();
    addBreadcrumb(sdk, { category: 'ui', message: 'during' });
    sdk.telemetryStore!.resume();
    addBreadcrumb(sdk, { category: 'ui', message: 'after' });

    const messages = sdk.telemetryStore!.getTimeline().breadcrumb.map((b) => b.message);
    expect(messages).toEqual(['before', 'after']);
  });

  it('does not crash the host when the underlying store throws', () => {
    const throwingStore = {
      add: () => {
        throw new Error('boom');
      },
      getRecent: () => [],
      getTimeline: () => ({
        console: [],
        network: [],
        navigation: [],
        visitor: [],
        breadcrumb: [],
      }),
      clear: () => {},
      size: () => 0,
      pause: () => {},
      resume: () => {},
      isPaused: () => false,
    } as unknown as TelemetryStore;

    const fragileSdk = makeSdk(throwingStore);
    expect(() => addBreadcrumb(fragileSdk, { category: 'navigation' })).not.toThrow();
  });
});
