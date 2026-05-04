// SPDX-License-Identifier: Apache-2.0

/**
 * `bootstrapBrowsonic({ apiEndpoint, ... })` — `entry.client.tsx`
 * helper that hands the SDK its config in one place. Remix hydrates
 * the client tree from `app/entry.client.tsx`; calling this function
 * BEFORE `hydrateRoot()` makes sure the SDK reads the config when it
 * picks up the singleton.
 *
 * ```tsx
 * // app/entry.client.tsx
 * import { hydrateRoot } from 'react-dom/client';
 * import { RemixBrowser } from '@remix-run/react';
 * import { bootstrapBrowsonic } from '@browsonic/remix';
 *
 * bootstrapBrowsonic({ apiEndpoint: 'https://ingest.example/v1/events', appKey: 'remix-app' });
 * hydrateRoot(document, <RemixBrowser />);
 * ```
 *
 * The function reads any existing `window.Browsonic.config` first
 * (so Remix's `entry.server.tsx` can serialise per-request fields
 * like `release` or `environment` via `<script>` injection) and
 * merges the caller's options on top. Returns the SDK singleton if
 * one is reachable, otherwise `null` — useful for follow-up
 * `setUser()` / `setTag()` calls in the same module.
 *
 * Browser-only. SSR / Node calls return `null` without touching any
 * globals so importing this module from `entry.client.tsx` doesn't
 * accidentally fire on the server.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

export interface BrowsonicBootstrapOptions {
  /**
   * Backend ingest URL. Required at runtime; the SDK throws on init
   * without one. Optional in the type so callers can pass partial
   * options when the rest is already on `window.Browsonic.config`
   * (e.g. set by `entry.server.tsx`'s injected script).
   */
  apiEndpoint?: string;
  /** Application key for tenancy. Optional. */
  appKey?: string;
  /** Environment label (`'production'` / `'staging'` / etc.). */
  environment?: string;
  /** Release identifier — Remix builds typically thread this from `process.env`. */
  release?: string;
  /** Version-aware analytics tag. */
  clientVersion?: string;
}

interface BrowsonicWindow {
  Browsonic?: {
    config?: Record<string, unknown>;
    getBrowsonic?: () => Browsonic | null;
  };
}

/**
 * Set the Browsonic SDK config and (best-effort) return the SDK
 * singleton. Idempotent — calling it twice merges the new options
 * on top of any existing `window.Browsonic.config`. SSR-safe.
 */
export function bootstrapBrowsonic(options: BrowsonicBootstrapOptions = {}): Browsonic | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const w = window as Window & BrowsonicWindow;
  if (!w.Browsonic) {
    w.Browsonic = {};
  }
  const existingConfig = w.Browsonic.config ?? {};

  const merged: Record<string, unknown> = { ...existingConfig };
  if (options.apiEndpoint) merged.apiEndpoint = options.apiEndpoint;
  if (options.appKey) merged.appKey = options.appKey;
  if (options.environment) merged.environment = options.environment;
  if (options.release) merged.release = options.release;
  if (options.clientVersion) merged.clientVersion = options.clientVersion;

  w.Browsonic.config = merged;
  return resolveSdk();
}
