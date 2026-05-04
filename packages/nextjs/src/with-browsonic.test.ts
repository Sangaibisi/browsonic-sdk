// SPDX-License-Identifier: Apache-2.0

/**
 * withBrowsonicConfig regression suite. 0.1 is a passthrough — the
 * tests lock in the contract so future build-time integrations
 * either preserve the input config shape or document the change.
 */
import { describe, it, expect } from 'vitest';
import { withBrowsonicConfig } from './with-browsonic';

describe('withBrowsonicConfig (0.1 — passthrough)', () => {
  it('returns the input config reference unchanged', () => {
    const config = { reactStrictMode: true, images: { domains: ['example.com'] } };
    const wrapped = withBrowsonicConfig(config);
    expect(wrapped).toBe(config);
  });

  it('preserves the shape (no fields added or removed)', () => {
    const config = { x: 1, y: 'two', z: { nested: true } };
    const wrapped = withBrowsonicConfig(config);
    expect(wrapped).toEqual(config);
  });

  it('accepts an empty config', () => {
    const wrapped = withBrowsonicConfig({});
    expect(wrapped).toEqual({});
  });

  it('accepts an options object (currently ignored)', () => {
    const config = { foo: 'bar' };
    const wrapped = withBrowsonicConfig(config, {});
    expect(wrapped).toBe(config);
  });
});
