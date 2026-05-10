/**
 * Event context collection microbenchmark.
 *
 * PERFORMANCE-STRATEGY.md §1: Event process p95 <= 1ms.
 * collectEventContext is called per event (hot path).
 */
import { bench, describe } from 'vitest';
import { collectEventContext } from '../src/context';

describe('collectEventContext — per-event hot path', () => {
  bench('collectEventContext (happy-dom)', () => {
    collectEventContext();
  });
});

describe('Date.now vs timestamp() ISO string', () => {
  bench('Date.now()', () => {
    Date.now();
  });

  bench('new Date().toISOString()', () => {
    new Date().toISOString();
  });

  bench('new Date(Date.now()).toISOString()', () => {
    new Date(Date.now()).toISOString();
  });
});
