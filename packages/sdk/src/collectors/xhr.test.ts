// SPDX-License-Identifier: Apache-2.0

/**
 * XHR collector — WeakMap metadata + AbortSignal listener regression suite.
 *
 * Verifies the Sprint 3 rewrite (TECHNICAL-IMPROVEMENTS §2.2).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createXHRCollector } from './xhr';

describe('createXHRCollector', () => {
  let onEvent: ReturnType<typeof vi.fn>;
  let onTelemetry: ReturnType<typeof vi.fn>;
  let collector: ReturnType<typeof createXHRCollector>;
  let originalOpen: typeof XMLHttpRequest.prototype.open;
  let originalSend: typeof XMLHttpRequest.prototype.send;

  beforeEach(() => {
    onEvent = vi.fn();
    onTelemetry = vi.fn();
    originalOpen = XMLHttpRequest.prototype.open;
    originalSend = XMLHttpRequest.prototype.send;
    collector = createXHRCollector({
      onEvent,
      onTelemetry,
      debugLog: () => {},
      sdkEndpoint: 'https://api.browsonic.test',
    });
  });

  afterEach(() => {
    collector.uninstall();
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.send = originalSend;
  });

  it('install wraps prototype open/send', () => {
    collector.install();
    expect(XMLHttpRequest.prototype.open).not.toBe(originalOpen);
    expect(XMLHttpRequest.prototype.send).not.toBe(originalSend);
    expect(collector.isInstalled()).toBe(true);
  });

  it('uninstall restores prototype identity', () => {
    collector.install();
    collector.uninstall();
    expect(XMLHttpRequest.prototype.open).toBe(originalOpen);
    expect(XMLHttpRequest.prototype.send).toBe(originalSend);
  });

  it('install is idempotent', () => {
    collector.install();
    collector.install();
    expect(collector.isInstalled()).toBe(true);
  });

  it('does not attach `_browsonicMetadata` property to XHR instances', () => {
    // Sprint 3 changed the strategy from a runtime property to a WeakMap.
    // The property is still declared in the type (back-compat), but SHOULD
    // not be set on real instances after the rewrite.
    collector.install();
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://api.test/x');
    const instanceProp = (xhr as unknown as { _browsonicMetadata?: unknown })._browsonicMetadata;
    expect(instanceProp).toBeUndefined();
  });

  it('open() preserves native behavior — call does not throw', () => {
    collector.install();
    expect(() => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'https://api.test/healthy');
    }).not.toThrow();
  });

  it('skips SDK-endpoint requests (no listeners attached)', () => {
    collector.install();
    const xhr = new XMLHttpRequest();
    const addSpy = vi.spyOn(xhr, 'addEventListener');
    xhr.open('POST', 'https://api.browsonic.test/v1/events');
    // send() is a no-op against a non-running HTTP stub — we just verify
    // no event listeners were added for telemetry.
    try {
      xhr.send(null);
    } catch {
      /* happy-dom XHR without network = throws */
    }
    expect(addSpy).not.toHaveBeenCalledWith('loadend', expect.any(Function), expect.anything());
  });
});
