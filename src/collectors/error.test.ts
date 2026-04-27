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
});
