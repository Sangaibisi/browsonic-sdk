/**
 * DiagnosticsReporter — integration with fetch + interval timing.
 *
 * We fake the timer + fetch. Real behavior under flaky networks is
 * covered by the queue transport's existing mocks; this suite focuses
 * on: start/stop, empty-snapshot skip, payload shape, interval floor.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDiagnosticsReporter, type DiagnosticsReporter } from './reporter';
import { createDiagnosticsStore, type DiagnosticsStore } from './store';
import type { ResolvedConfig } from '../types';

function makeConfig(): ResolvedConfig {
  // Stub only the fields the reporter reads. The full ResolvedConfig
  // has ~40 fields; we cast via unknown after filling the relevant ones.
  return {
    apiEndpoint: 'https://api.test',
    appKey: 'app-x',
    apiKey: 'key-y',
    environment: 'production',
    internalDiagnostics: true,
    internalDiagnosticsIntervalMs: 60_000,
  } as unknown as ResolvedConfig;
}

describe('createDiagnosticsReporter', () => {
  let store: DiagnosticsStore;
  let reporter: DiagnosticsReporter;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = createDiagnosticsStore(50);
    fetchMock = vi.fn().mockResolvedValue({ status: 202 });
    vi.stubGlobal('fetch', fetchMock);
    reporter = createDiagnosticsReporter({
      config: makeConfig(),
      store,
      getSessionId: () => 'session-1',
      sdkName: '@browsonic/sdk',
      sdkVersion: '1.1.0-test',
      debugLog: () => {},
    });
  });

  afterEach(() => {
    reporter.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not POST before start() is called', () => {
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips empty reports — no POST when no samples accumulated', async () => {
    reporter.start();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs a well-formed payload when samples exist', async () => {
    store.recordInit(12);
    store.incDropped('sampled_out');

    reporter.start();
    await vi.advanceTimersByTimeAsync(60_001);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/diagnostics');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      sdk: { name: '@browsonic/sdk', version: '1.1.0-test' },
      session_id: 'session-1',
      app_key: 'app-x',
      environment: 'production',
    });
    expect(body.metrics).toBeDefined();
    const metrics = body.metrics as {
      init_duration_ms: { count: number };
      dropped_events: Record<string, number>;
    };
    expect(metrics.init_duration_ms.count).toBe(1);
    expect(metrics.dropped_events.sampled_out).toBe(1);
  });

  it('clamps sub-5-second intervals to 5 seconds', async () => {
    // New reporter with absurdly short interval — should still only fire
    // once per 5 s.
    reporter.stop();
    const cfg = makeConfig();
    (cfg as unknown as { internalDiagnosticsIntervalMs: number }).internalDiagnosticsIntervalMs =
      100;
    reporter = createDiagnosticsReporter({
      config: cfg,
      store,
      getSessionId: () => 's',
      sdkName: 'x',
      sdkVersion: 'y',
      debugLog: () => {},
    });
    store.recordInit(1);
    reporter.start();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flushNow sends immediately regardless of timer', async () => {
    store.recordFlush(42);
    await reporter.flushNow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stop() halts the periodic POST', async () => {
    store.recordInit(1);
    reporter.start();
    reporter.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows network failures (best-effort telemetry)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    store.recordInit(1);
    await expect(reporter.flushNow()).resolves.toBeUndefined();
  });
});
