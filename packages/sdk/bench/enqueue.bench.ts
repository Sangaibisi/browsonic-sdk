/**
 * Event enqueue microbenchmark — the most critical hot path.
 *
 * PERFORMANCE-STRATEGY.md §1: Event process p95 <= 1ms end-to-end.
 * This bench isolates enqueue pipeline: fingerprint + dedup + queue.push.
 *
 * IMPORTANT: Vitest `bench()` does NOT invoke `beforeEach` hooks between
 * iterations (unlike `test()`). Tinybench runs the fn N times; per-iter
 * setup must happen inside the fn or via the `setup` option (run once).
 *
 * We therefore structure benches in two modes:
 *   - COLD: create queue inside fn (measures creation + enqueue)
 *   - WARM: shared queue across iterations (measures pure enqueue as queue fills;
 *           hits the "ring buffer shift" path once queue reaches maxQueueSize)
 */
import { bench, describe } from 'vitest';
import { createEventQueue } from '../src/queue';
import type { BrowsonicEvent, ResolvedConfig } from '../src/types';
import { resolveConfig } from '../src/config';

const MOCK_CONFIG: ResolvedConfig = resolveConfig({
  apiEndpoint: 'https://api.test.local',
  appKey: 'bench-app',
  debug: false,
  flushIntervalMs: 30000,
  maxBatchSize: 25,
  maxQueueSize: 200,
  persistQueue: false,
});

function makeEvent(seq: number, overrides: Partial<BrowsonicEvent> = {}): BrowsonicEvent {
  return {
    eventId: `evt-${seq}`,
    timestamp: new Date().toISOString(),
    type: 'console_warn',
    level: 'warn',
    message: `benchmark message ${seq}`,
    stack: null,
    context: {
      url: 'https://example.com/page',
      referrer: '',
      pageAge: 1234,
    },
    telemetry: null,
    ...overrides,
  };
}

function makeQueue() {
  return createEventQueue({
    config: MOCK_CONFIG,
    debugLog: () => {},
    getSessionId: () => 'bench-session',
    getUser: () => null,
  });
}

describe('queue.enqueue — cold path (fresh queue per iteration)', () => {
  let seq = 0;
  bench('create queue + enqueue 1 warn event', () => {
    const q = makeQueue();
    q.enqueue(makeEvent(seq++));
    q.destroy();
  });
});

describe('queue.enqueue — warm path (shared queue, unique events)', () => {
  const q = makeQueue();
  let seq = 0;
  bench('enqueue unique warn event (new fingerprint each time)', () => {
    q.enqueue(makeEvent(seq++));
  });
});

describe('queue.enqueue — dedup path (same fingerprint, early return)', () => {
  const q = makeQueue();
  const seedEvent = makeEvent(0);
  // Seed cooldown map once via bench setup
  bench(
    'enqueue duplicate (cooldown hit, early return)',
    () => {
      q.enqueue(seedEvent);
    },
    {
      setup: () => {
        q.enqueue({ ...seedEvent, eventId: 'seed' });
      },
    }
  );
});

describe('queue.enqueue — burst of 10 unique events', () => {
  bench('10 fresh enqueues (incl. queue creation)', () => {
    const q = makeQueue();
    for (let i = 0; i < 10; i++) {
      q.enqueue(makeEvent(i));
    }
    q.destroy();
  });
});
