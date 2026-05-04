// SPDX-License-Identifier: Apache-2.0

/**
 * `withBrowsonicConfig(nextConfig)` — Next.js config wrapper.
 * Currently a passthrough; reserved for future build-time
 * integrations (sourcemap upload via the deferred S3/S4 source-map
 * pipeline, `experimental.instrumentationHook` auto-registration,
 * etc.).
 *
 * Named `withBrowsonicConfig` (mirroring Sentry's
 * `withSentryConfig`) to avoid colliding with the React adapter's
 * `withBrowsonic` HOC, which we re-export from this package.
 *
 * Shipping the wrapper now means consumers can adopt the API once,
 * and future additions (when the build-time pipeline lands) are a
 * no-op upgrade for them.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * Minimal subset of `next.config.js` we touch. Mirroring this shape
 * here (instead of importing `next/types`) keeps `next` out of our
 * dependency graph — the wrapper works against any Next config
 * shape because it's a passthrough.
 */
export type NextConfigLike = Record<string, unknown>;

export interface WithBrowsonicConfigOptions {
  /**
   * Reserved — not used in 0.1. Future versions accept SDK build
   * options (sourcemap upload toggles, deploy-id propagation, etc.).
   */
  reserved?: never;
}

export function withBrowsonicConfig<TConfig extends NextConfigLike>(
  nextConfig: TConfig,
  _options: WithBrowsonicConfigOptions = {},
): TConfig {
  // 0.1: passthrough. The function exists so consumers can adopt
  // `withBrowsonicConfig(...)` once and pick up future build-time
  // integrations (sourcemap upload, auto-instrumentation) without
  // touching their config again.
  return nextConfig;
}
