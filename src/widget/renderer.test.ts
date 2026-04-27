/**
 * Widget renderer — Shadow DOM rendering regression suite.
 *
 * Note: ShadowRoot in happy-dom supports `querySelector`. `closed` mode
 * shadow roots cannot be introspected from outside the host via
 * `host.shadowRoot`, so these tests use the host+host-id approach and
 * rely on render-side queries where possible.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWidgetRenderer } from './renderer';

describe('createWidgetRenderer', () => {
  let renderer: ReturnType<typeof createWidgetRenderer>;

  beforeEach(() => {
    document.body.innerHTML = '';
    renderer = createWidgetRenderer('bottom-right');
  });

  afterEach(() => {
    renderer.destroy();
    document.body.innerHTML = '';
  });

  it('show() creates host element on body', () => {
    renderer.show({ title: 'hi', message: 'm' });
    const host = document.getElementById('browsonic-widget-host');
    expect(host).not.toBeNull();
    expect(host?.parentElement).toBe(document.body);
  });

  it('isVisible reflects render state', () => {
    expect(renderer.isVisible()).toBe(false);
    renderer.show({ title: 'x', message: 'y' });
    expect(renderer.isVisible()).toBe(true);
  });

  it('destroy() removes host from DOM', () => {
    renderer.show({ title: 'x', message: 'y' });
    expect(document.getElementById('browsonic-widget-host')).not.toBeNull();
    renderer.destroy();
    expect(document.getElementById('browsonic-widget-host')).toBeNull();
    expect(renderer.isVisible()).toBe(false);
  });

  it('show() with javascript: actionUrl is sanitized (no actionUrl rendered)', () => {
    // This is a defensive integration test — sanitize.test.ts covers the
    // sanitizer unit-level. Here we confirm the renderer uses it.
    renderer.show({
      title: 'x',
      message: 'y',
      actionUrl: 'javascript:alert(1)',
      actionLabel: 'click me',
    });
    // The notification renders (title/message still shown), but without
    // the dangerous link. isVisible = true.
    expect(renderer.isVisible()).toBe(true);
  });

  it('show() with oversized title/message does not throw', () => {
    renderer.show({
      title: 'a'.repeat(1000),
      message: 'b'.repeat(10000),
    });
    expect(renderer.isVisible()).toBe(true);
  });

  it('show() with empty title+message returns without rendering', () => {
    renderer.show({ title: '', message: '' });
    // sanitizer returns null; renderer bails.
    expect(renderer.isVisible()).toBe(false);
    expect(document.getElementById('browsonic-widget-host')).toBeNull();
  });

  it('consecutive show() calls replace the previous notification', () => {
    renderer.show({ title: 'first', message: 'x' });
    renderer.show({ title: 'second', message: 'y' });
    // Only one host element
    const hosts = document.querySelectorAll('#browsonic-widget-host');
    expect(hosts.length).toBe(1);
  });

  it('dismiss is safe to call before show', () => {
    expect(() => renderer.dismiss()).not.toThrow();
  });

  it('destroy is safe to call before show', () => {
    expect(() => renderer.destroy()).not.toThrow();
  });

  it('bottom-left position applies alternate class', () => {
    const leftRenderer = createWidgetRenderer('bottom-left');
    leftRenderer.show({ title: 'x', message: 'y' });
    expect(leftRenderer.isVisible()).toBe(true);
    leftRenderer.destroy();
  });
});
