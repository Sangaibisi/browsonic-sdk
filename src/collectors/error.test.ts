// SPDX-License-Identifier: Apache-2.0

/**
 * Error collector — window.onerror + unhandledrejection regression suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createErrorCollector } from './error';

describe('createErrorCollector', () => {
  let onEvent: ReturnType<typeof vi.fn>;
  let collector: ReturnType<typeof createErrorCollector>;
  let originalOnError: typeof window.onerror;

  beforeEach(() => {
    onEvent = vi.fn();
    originalOnError = window.onerror;
    collector = createErrorCollector({ onEvent, debugLog: () => {} });
    collector.install();
  });

  afterEach(() => {
    collector.uninstall();
    window.onerror = originalOnError;
  });

  describe('install / uninstall', () => {
    it('installs window.onerror and reports installed flag', () => {
      expect(collector.isInstalled()).toBe(true);
      expect(window.onerror).not.toBeNull();
    });

    it('install is idempotent', () => {
      collector.install();
      expect(collector.isInstalled()).toBe(true);
    });

    it('uninstall clears state', () => {
      collector.uninstall();
      expect(collector.isInstalled()).toBe(false);
    });

    it('uninstall is idempotent', () => {
      collector.uninstall();
      collector.uninstall();
      expect(collector.isInstalled()).toBe(false);
    });
  });

  describe('window.onerror path', () => {
    it('emits error event with Error.message and stack', () => {
      const err = new Error('explicit boom');
      window.onerror?.('unused', 'file.js', 10, 5, err);
      expect(onEvent).toHaveBeenCalledOnce();
      const event = onEvent.mock.calls[0][0];
      expect(event.type).toBe('error');
      expect(event.level).toBe('error');
      expect(event.message).toBe('explicit boom');
      expect(event.stack).toBeDefined();
    });

    it('falls back to string message + synthesized stack when Error missing', () => {
      window.onerror?.('implicit', 'main.js', 42, 7);
      expect(onEvent).toHaveBeenCalledOnce();
      const event = onEvent.mock.calls[0][0];
      expect(event.message).toBe('implicit');
      expect(event.stack).toContain('main.js');
    });

    it('invokes pre-existing onerror handler and propagates its return', () => {
      const pre = vi.fn().mockReturnValue(true);
      collector.uninstall(); // clear current
      window.onerror = pre;
      collector.install();
      const result = window.onerror!('msg', 's', 1, 1, new Error('x'));
      expect(pre).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('returns false when no pre-existing handler', () => {
      const result = window.onerror!('m', 's', 1, 1, new Error('y'));
      expect(result).toBe(false);
    });

    it('swallows pre-existing handler errors without breaking pipeline', () => {
      collector.uninstall();
      const bad = vi.fn(() => {
        throw new Error('pre-handler blew up');
      });
      window.onerror = bad;
      collector.install();
      expect(() => window.onerror!('m', 's', 1, 1, new Error('ok'))).not.toThrow();
    });
  });

  describe('unhandledrejection path', () => {
    it('emits unhandledrejection event for Error reason', () => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: new Error('rejected') });
      window.dispatchEvent(event);
      expect(onEvent).toHaveBeenCalledOnce();
      const e = onEvent.mock.calls[0][0];
      expect(e.type).toBe('unhandledrejection');
      expect(e.level).toBe('error');
      expect(e.message).toBe('rejected');
    });

    it('emits for string reason', () => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: 'stringified' });
      window.dispatchEvent(event);
      expect(onEvent.mock.calls[0][0].message).toBe('stringified');
    });

    it('JSON-stringifies object reason', () => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: { code: 42 } });
      window.dispatchEvent(event);
      const msg = onEvent.mock.calls[0][0].message;
      expect(msg).toContain('42');
    });

    it('falls back to generic message for circular reason', () => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      Object.defineProperty(event, 'reason', { value: circular });
      window.dispatchEvent(event);
      expect(onEvent.mock.calls[0][0].message).toBe('Unhandled promise rejection');
    });
  });

  describe('parsed stack + linked errors (Sprint 2 M2)', () => {
    it('attaches stackFrames parsed from the captured Error', () => {
      const err = new Error('boom');
      window.onerror?.('unused', 'app.js', 1, 1, err);
      const event = onEvent.mock.calls[0][0];
      expect(Array.isArray(event.stackFrames)).toBe(true);
      // happy-dom + V8 produce at least one frame for any thrown Error.
      expect(event.stackFrames.length).toBeGreaterThan(0);
    });

    it('attaches errorType from the Error constructor name', () => {
      const err = new TypeError('type boom');
      window.onerror?.('unused', 'app.js', 1, 1, err);
      const event = onEvent.mock.calls[0][0];
      expect(event.errorType).toBe('TypeError');
    });

    it('errorType is null when Error is missing (synthesized stack path)', () => {
      window.onerror?.('implicit', 'app.js', 1, 1);
      const event = onEvent.mock.calls[0][0];
      expect(event.errorType).toBeNull();
    });

    it('attaches unwound linkedErrors when Error.cause is present', () => {
      const root = new TypeError('underlying');
      const err = new Error('wrapped', { cause: root });
      window.onerror?.('unused', 'app.js', 1, 1, err);
      const event = onEvent.mock.calls[0][0];
      expect(event.linkedErrors).toHaveLength(1);
      expect(event.linkedErrors[0].type).toBe('TypeError');
      expect(event.linkedErrors[0].message).toBe('underlying');
    });

    it('linkedErrors is [] when there is no cause chain', () => {
      const err = new Error('plain');
      window.onerror?.('unused', 'app.js', 1, 1, err);
      const event = onEvent.mock.calls[0][0];
      expect(event.linkedErrors).toEqual([]);
    });

    it('linkedErrors caps at depth 5 even with a 10-deep chain', () => {
      let chain = new Error('level-0');
      for (let i = 1; i < 10; i++) {
        chain = new Error(`level-${i}`, { cause: chain });
      }
      window.onerror?.('unused', 'app.js', 1, 1, chain);
      const event = onEvent.mock.calls[0][0];
      expect(event.linkedErrors).toHaveLength(5);
    });
  });

  describe('unhandledrejection — parsed stack + linked errors', () => {
    it('attaches errorType for Error reasons', () => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: new RangeError('out of range') });
      window.dispatchEvent(event);
      const captured = onEvent.mock.calls[0][0];
      expect(captured.errorType).toBe('RangeError');
    });

    it('errorType is null for non-Error reasons', () => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: 'plain reason' });
      window.dispatchEvent(event);
      const captured = onEvent.mock.calls[0][0];
      expect(captured.errorType).toBeNull();
    });

    it('attaches linkedErrors for Error reasons with a cause', () => {
      const root = new Error('underlying');
      const reason = new Error('wrapped', { cause: root });
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: reason });
      window.dispatchEvent(event);
      const captured = onEvent.mock.calls[0][0];
      expect(captured.linkedErrors).toHaveLength(1);
      expect(captured.linkedErrors[0].message).toBe('underlying');
    });

    it('linkedErrors is [] for non-Error reasons', () => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: 'plain reason' });
      window.dispatchEvent(event);
      const captured = onEvent.mock.calls[0][0];
      expect(captured.linkedErrors).toEqual([]);
    });

    it('attaches stackFrames for Error reasons', () => {
      const reason = new Error('async boom');
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: reason });
      window.dispatchEvent(event);
      const captured = onEvent.mock.calls[0][0];
      expect(Array.isArray(captured.stackFrames)).toBe(true);
      expect(captured.stackFrames.length).toBeGreaterThan(0);
    });
  });
});
