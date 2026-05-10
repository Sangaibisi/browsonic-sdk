// SPDX-License-Identifier: Apache-2.0

/**
 * Widget sanitization — XSS regression suite.
 *
 * Covers TECHNICAL-IMPROVEMENT-PLAN.md §1.1 fix.
 * These tests MUST pass for every PR touching widget code.
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeActionUrl,
  sanitizeNotification,
  MAX_TITLE_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_ACTION_LABEL_LENGTH,
} from './sanitize';

describe('sanitizeActionUrl — protocol allow-list', () => {
  it('accepts https URLs', () => {
    expect(sanitizeActionUrl('https://example.com/docs')).toBe('https://example.com/docs');
  });

  it('accepts http URLs', () => {
    expect(sanitizeActionUrl('http://example.com/')).toBe('http://example.com/');
  });

  it('accepts mailto URLs', () => {
    expect(sanitizeActionUrl('mailto:help@example.com')).toBe('mailto:help@example.com');
  });

  it('accepts tel URLs', () => {
    expect(sanitizeActionUrl('tel:+18005551234')).toBe('tel:+18005551234');
  });

  it('rejects javascript: URLs', () => {
    expect(sanitizeActionUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeActionUrl('JAVASCRIPT:alert(1)')).toBeNull();
    expect(sanitizeActionUrl('  javascript:alert(1)  ')).toBeNull();
    expect(sanitizeActionUrl('JaVaScRiPt:alert(1)')).toBeNull();
  });

  it('rejects data: URLs (could carry script content)', () => {
    expect(sanitizeActionUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects vbscript: URLs', () => {
    expect(sanitizeActionUrl('vbscript:msgbox("x")')).toBeNull();
  });

  it('rejects file: URLs', () => {
    expect(sanitizeActionUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects blob: URLs (user-controlled content)', () => {
    expect(sanitizeActionUrl('blob:https://example.com/abc-123')).toBeNull();
  });

  it('rejects URLs containing control characters', () => {
    expect(sanitizeActionUrl('https://example.com/\x00hack')).toBeNull();
    expect(sanitizeActionUrl('https://example.com/\nhack')).toBeNull();
    expect(sanitizeActionUrl('https://example.com/\r\nSet-Cookie: x')).toBeNull();
  });

  it('rejects empty/whitespace/null/undefined', () => {
    expect(sanitizeActionUrl('')).toBeNull();
    expect(sanitizeActionUrl('   ')).toBeNull();
    expect(sanitizeActionUrl(null)).toBeNull();
    expect(sanitizeActionUrl(undefined)).toBeNull();
  });

  it('rejects non-string values (defensive)', () => {
    // Runtime callers may pass bad data; we mustn't throw.
    expect(sanitizeActionUrl(123 as unknown as string)).toBeNull();
    expect(sanitizeActionUrl({} as unknown as string)).toBeNull();
  });

  it('resolves relative URLs against document origin in browser envs', () => {
    const result = sanitizeActionUrl('/docs/troubleshoot');
    expect(result).toMatch(/^https?:\/\/.+\/docs\/troubleshoot$/);
  });

  it('normalizes URLs (removes redundant parts)', () => {
    expect(sanitizeActionUrl('https://example.com/a/./b')).toBe('https://example.com/a/b');
  });
});

describe('sanitizeNotification — length caps and safety', () => {
  it('truncates title exceeding MAX_TITLE_LENGTH', () => {
    const longTitle = 'A'.repeat(MAX_TITLE_LENGTH + 100);
    const result = sanitizeNotification({ title: longTitle, message: 'hi' });
    expect(result).not.toBeNull();
    expect(result!.title.length).toBe(MAX_TITLE_LENGTH);
    expect(result!.title.endsWith('…')).toBe(true);
  });

  it('truncates message exceeding MAX_MESSAGE_LENGTH', () => {
    const longMessage = 'B'.repeat(MAX_MESSAGE_LENGTH + 1000);
    const result = sanitizeNotification({ title: 'ok', message: longMessage });
    expect(result!.message.length).toBe(MAX_MESSAGE_LENGTH);
  });

  it('truncates actionLabel', () => {
    const result = sanitizeNotification({
      title: 'x',
      message: 'y',
      actionUrl: 'https://example.com',
      actionLabel: 'C'.repeat(MAX_ACTION_LABEL_LENGTH + 50),
    });
    expect(result!.actionLabel!.length).toBe(MAX_ACTION_LABEL_LENGTH);
  });

  it('strips javascript: actionUrl, keeps rest of notification', () => {
    const result = sanitizeNotification({
      title: 'Alert',
      message: 'Something happened',
      actionUrl: 'javascript:steal()',
      actionLabel: 'Click here',
    });
    expect(result).not.toBeNull();
    expect(result!.actionUrl).toBeUndefined();
    expect(result!.actionLabel).toBeUndefined(); // no URL → no label either
    expect(result!.title).toBe('Alert');
    expect(result!.message).toBe('Something happened');
  });

  it('returns null when title AND message are empty', () => {
    expect(sanitizeNotification({ title: '', message: '' })).toBeNull();
    expect(sanitizeNotification({ title: '   ', message: '   ' })).toBeNull();
  });

  it('normalizes severity to known enum, defaults to error', () => {
    const bad = sanitizeNotification({
      title: 'x',
      message: 'y',
      severity: 'CRITICAL' as any,
    });
    expect(bad!.severity).toBe('error');

    const good = sanitizeNotification({
      title: 'x',
      message: 'y',
      severity: 'warning',
    });
    expect(good!.severity).toBe('warning');
  });

  it('clamps autoDismissMs to finite non-negative integer', () => {
    expect(
      sanitizeNotification({ title: 'x', message: 'y', autoDismissMs: -1000 })!.autoDismissMs
    ).toBe(0);
    expect(
      sanitizeNotification({ title: 'x', message: 'y', autoDismissMs: NaN })!.autoDismissMs
    ).toBe(0);
    expect(
      sanitizeNotification({
        title: 'x',
        message: 'y',
        autoDismissMs: Infinity,
      })!.autoDismissMs
    ).toBe(0);
    expect(
      sanitizeNotification({ title: 'x', message: 'y', autoDismissMs: 3500 })!.autoDismissMs
    ).toBe(3500);
    expect(
      sanitizeNotification({ title: 'x', message: 'y', autoDismissMs: 3500.7 })!.autoDismissMs
    ).toBe(3500);
  });

  it('defaults actionLabel to "Learn more" when URL given but label missing', () => {
    const result = sanitizeNotification({
      title: 'x',
      message: 'y',
      actionUrl: 'https://example.com',
    });
    expect(result!.actionLabel).toBe('Learn more');
  });
});
