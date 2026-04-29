// SPDX-License-Identifier: Apache-2.0

/**
 * Debug logger unit tests — covers the NOOP gate, namespace prefix,
 * and legacy adapter introduced in Sprint P15 (F3.1.E). These paths
 * are hit on every SDK session when `debug: true`, so the coverage
 * gap flagged during the BASELINE regression sweep is closed here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDebugLogger, adaptLegacyDebugLog } from './debug-logger';
import type { ResolvedConfig } from '../types';

function makeConfig(debug: boolean): ResolvedConfig {
  // Only the `debug` bit is read by the logger; cast the rest to a
  // minimal stub so we don't have to build a full resolved config here.
  return { debug } as unknown as ResolvedConfig;
}

describe('createDebugLogger', () => {
  const logSpy = vi.spyOn(console, 'log');
  const warnSpy = vi.spyOn(console, 'warn');
  const errorSpy = vi.spyOn(console, 'error');

  beforeEach(() => {
    logSpy.mockImplementation(() => {});
    warnSpy.mockImplementation(() => {});
    errorSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockReset();
    warnSpy.mockReset();
    errorSpy.mockReset();
  });

  it('returns a NOOP logger when debug is false (zero overhead contract)', () => {
    const logger = createDebugLogger(makeConfig(false));
    logger.info('ignored');
    logger.warn('ignored');
    logger.error('ignored', new Error('x'));
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('emits prefixed info with default namespace', () => {
    const logger = createDebugLogger(makeConfig(true));
    logger.info('hello', { foo: 'bar' });
    expect(logSpy).toHaveBeenCalledWith('[Browsonic:sdk]', 'hello', { foo: 'bar' });
  });

  it('honours a custom namespace', () => {
    const logger = createDebugLogger(makeConfig(true), 'widget');
    logger.warn('near quota');
    expect(warnSpy).toHaveBeenCalledWith('[Browsonic:widget]', 'near quota', '');
  });

  it('keeps err separate from data in error() so stacks render', () => {
    const logger = createDebugLogger(makeConfig(true), 'queue');
    const err = new Error('boom');
    logger.error('failed to flush', err, { attempt: 3 });
    expect(errorSpy).toHaveBeenCalledWith('[Browsonic:queue]', 'failed to flush', err, {
      attempt: 3,
    });
  });

  it('substitutes empty strings for undefined data / err arguments', () => {
    const logger = createDebugLogger(makeConfig(true), 'test');
    logger.info('no data');
    logger.error('no err');
    expect(logSpy).toHaveBeenCalledWith('[Browsonic:test]', 'no data', '');
    expect(errorSpy).toHaveBeenCalledWith('[Browsonic:test]', 'no err', '', '');
  });
});

describe('adaptLegacyDebugLog', () => {
  it('routes info through the legacy callback unchanged', () => {
    const legacy = vi.fn();
    const logger = adaptLegacyDebugLog(legacy);
    logger.info('hi', { a: 1 });
    expect(legacy).toHaveBeenCalledWith('hi', { a: 1 });
  });

  it('prefixes warn/error so legacy single-channel logs stay filterable', () => {
    const legacy = vi.fn();
    const logger = adaptLegacyDebugLog(legacy);
    logger.warn('watch out', { n: 2 });
    logger.error('nope', new Error('x'), { n: 3 });
    expect(legacy).toHaveBeenCalledWith('[warn] watch out', { n: 2 });
    expect(legacy).toHaveBeenCalledWith('[error] nope', expect.any(Error), { n: 3 });
  });
});
