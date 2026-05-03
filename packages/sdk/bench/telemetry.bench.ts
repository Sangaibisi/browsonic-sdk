/**
 * Telemetry ring buffer microbenchmark.
 *
 * PERFORMANS-STRATEJISI.md §1: Event process p95 <= 1ms.
 * Ring buffer `add()` is in that hot path.
 */
import { bench, describe } from 'vitest';
import { createTelemetryStore } from '../src/telemetry/store';

describe('TelemetryStore.add — ring buffer hot path', () => {
  const store = createTelemetryStore(20);
  let counter = 0;

  bench('add console entry (buffer not full)', () => {
    const freshStore = createTelemetryStore(20);
    for (let i = 0; i < 10; i++) {
      freshStore.add({
        category: 'console',
        data: { level: 'log', message: `msg ${i}`, stack: null },
      });
    }
  });

  bench('add console entry (buffer full, overwrite path)', () => {
    store.add({
      category: 'console',
      data: { level: 'log', message: `msg ${counter++}`, stack: null },
    });
  });

  bench('add network entry (buffer full, overwrite path)', () => {
    store.add({
      category: 'network',
      data: {
        method: 'GET',
        url: 'https://api.example.com/users/123',
        statusCode: 200,
        statusText: 'OK',
        duration: 42,
        type: 'fetch',
      },
    });
  });
});

describe('TelemetryStore.getTimeline — snapshot for event payload', () => {
  const store = createTelemetryStore(20);
  // Pre-fill with mixed entries
  for (let i = 0; i < 20; i++) {
    const cat = (['console', 'network', 'navigation', 'visitor'] as const)[i % 4];
    store.add({
      category: cat,
      data:
        cat === 'console'
          ? { level: 'log', message: `m${i}`, stack: null }
          : cat === 'network'
            ? {
                method: 'GET',
                url: `u${i}`,
                statusCode: 200,
                statusText: 'OK',
                duration: 10,
                type: 'fetch',
              }
            : cat === 'navigation'
              ? { from: 'a', to: 'b', type: 'pushState' }
              : { action: 'click', element: { tag: 'button', attributes: {} } },
    });
  }

  bench('getTimeline (full buffer)', () => {
    store.getTimeline();
  });

  bench('getRecent(5)', () => {
    store.getRecent(5);
  });
});
