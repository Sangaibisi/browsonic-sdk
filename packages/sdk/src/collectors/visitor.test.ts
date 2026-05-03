// SPDX-License-Identifier: Apache-2.0

/**
 * Visitor collector — click + input handler regression suite.
 *
 * Covers getValuePattern (privacy-safe value classification), attribute
 * filtering, password-field skip, and throttling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVisitorCollector } from './visitor';

describe('createVisitorCollector — install / uninstall', () => {
  let collector: ReturnType<typeof createVisitorCollector> | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    collector?.uninstall();
    collector = null;
  });

  it('install is idempotent', () => {
    collector = createVisitorCollector({
      onTelemetry: () => {},
      debugLog: () => {},
    });
    collector.install();
    collector.install();
    expect(collector.isInstalled()).toBe(true);
  });

  it('uninstall clears state', () => {
    collector = createVisitorCollector({
      onTelemetry: () => {},
      debugLog: () => {},
    });
    collector.install();
    collector.uninstall();
    expect(collector.isInstalled()).toBe(false);
  });
});

describe('Visitor collector — click events', () => {
  let onTelemetry: ReturnType<typeof vi.fn>;
  let collector: ReturnType<typeof createVisitorCollector>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onTelemetry = vi.fn();
    collector = createVisitorCollector({
      onTelemetry,
      debugLog: () => {},
      trackClicks: true,
      trackInputs: false,
    });
    collector.install();
  });

  afterEach(() => {
    collector.uninstall();
  });

  it('captures click telemetry with tag + attributes', () => {
    const btn = document.createElement('button');
    btn.id = 'cta';
    btn.className = 'primary';
    btn.textContent = 'Add to cart';
    document.body.appendChild(btn);

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onTelemetry).toHaveBeenCalled();
    const data = onTelemetry.mock.calls[0][0];
    expect(data.action).toBe('click');
    expect(data.element.tag).toBe('button');
    expect(data.element.attributes.id).toBe('cta');
    expect(data.element.attributes.class).toBe('primary');
    // Text captured for clickable elements
    expect(data.element.text).toBe('Add to cart');
  });

  it('excludes sensitive attributes (value, password)', () => {
    const input = document.createElement('input');
    input.setAttribute('value', 'secret-value');
    input.setAttribute('data-token', 'abc123');
    input.setAttribute('name', 'email');
    document.body.appendChild(input);

    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const data = onTelemetry.mock.calls[0][0];
    expect(data.element.attributes.value).toBeUndefined();
    expect(data.element.attributes['data-token']).toBeUndefined();
    expect(data.element.attributes.name).toBe('email');
  });

  it('does not emit when trackClicks=false', () => {
    collector.uninstall();
    const localTelemetry = vi.fn();
    collector = createVisitorCollector({
      onTelemetry: localTelemetry,
      debugLog: () => {},
      trackClicks: false,
      trackInputs: false,
    });
    collector.install();

    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(localTelemetry).not.toHaveBeenCalled();
  });
});

describe('Visitor collector — input events (getValuePattern)', () => {
  let onTelemetry: ReturnType<typeof vi.fn>;
  let collector: ReturnType<typeof createVisitorCollector>;

  beforeEach(() => {
    document.body.innerHTML = '';
    onTelemetry = vi.fn();
    collector = createVisitorCollector({
      onTelemetry,
      debugLog: () => {},
      trackClicks: false,
      trackInputs: true,
      inputThrottleMs: 0, // disable for deterministic tests
    });
    collector.install();
  });

  afterEach(() => {
    collector.uninstall();
  });

  function inputEvent(value: string): { length: number; pattern: string } {
    onTelemetry.mockClear();
    const el = document.createElement('input');
    el.type = 'text';
    document.body.appendChild(el);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const data = onTelemetry.mock.calls[0][0];
    document.body.removeChild(el);
    return data.element.value;
  }

  it('classifies empty as "empty"', () => {
    expect(inputEvent('').pattern).toBe('empty');
  });

  it('classifies email', () => {
    const v = inputEvent('user@example.com');
    expect(v.pattern).toBe('email');
  });

  it('classifies numeric', () => {
    expect(inputEvent('12345').pattern).toBe('numeric');
  });

  it('classifies alpha', () => {
    expect(inputEvent('abcdef').pattern).toBe('alpha');
  });

  it('classifies alphanumeric', () => {
    expect(inputEvent('abc123').pattern).toBe('alphanumeric');
  });

  it('classifies whitespace-only', () => {
    expect(inputEvent('   ').pattern).toBe('whitespace');
  });

  it('classifies mixed special chars as "characters"', () => {
    expect(inputEvent('!@#$').pattern).toBe('characters');
  });

  it('captures length but never the actual value', () => {
    const v = inputEvent('secret value 123');
    expect(v.length).toBe(16);
    // No "value" field containing the string
    expect((v as Record<string, unknown>).value).toBeUndefined();
  });

  it('skips password fields entirely (privacy)', () => {
    const pw = document.createElement('input');
    pw.type = 'password';
    document.body.appendChild(pw);
    pw.value = 'hunter2';
    pw.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onTelemetry).not.toHaveBeenCalled();
  });

  it('throttles rapid input events', () => {
    // Fresh collector with realistic throttle
    collector.uninstall();
    const telemetry = vi.fn();
    collector = createVisitorCollector({
      onTelemetry: telemetry,
      debugLog: () => {},
      trackClicks: false,
      trackInputs: true,
      inputThrottleMs: 500,
    });
    collector.install();

    const el = document.createElement('input');
    document.body.appendChild(el);
    // Fire 3 rapid inputs — only first should register
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(telemetry).toHaveBeenCalledTimes(1);
  });
});
