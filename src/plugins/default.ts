/**
 * Default-plugin bridge.
 *
 * The main entry (`src/index.ts`) uses this to translate classic
 * `BrowsonicConfig` fields (`captureXHR`, `trackNavigation`, …) into
 * plugin registrations at `init()` time. The core entry
 * (`src/core.ts`) never imports this module; tree-shake therefore
 * strips the collector + plugin graph out of the core bundle.
 *
 * Registration rules:
 *   - `error` + `console` → always (no config knob; error capture is the
 *     SDK's reason to exist).
 *   - `network` → always (fetch telemetry + 4xx/5xx capture).
 *   - `xhr` → `captureXHR !== false` (default true).
 *   - `navigation` → `trackNavigation !== false` (default true).
 *   - `visitor` → `trackVisitor === true` (default false, opt-in).
 *   - `callback` → `captureAsyncStack === 'global'` (default false).
 *   - `pageview` → `trackPageViews !== false` AND `apiKey` provided.
 *
 * Each plugin is registered by `id`; `sdk.register` dedups by id, so
 * re-init or manual prior registration is safe.
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { BrowsonicConfig } from '../types';
import type { Browsonic } from '../sentinel';
import { errorPlugin } from './error';
import { consolePlugin } from './console';
import { networkPlugin } from './network';
import { xhrPlugin } from './xhr';
import { navigationPlugin } from './navigation';
import { visitorPlugin } from './visitor';
import { callbackPlugin } from './callback';
import { pageViewPlugin } from './pageview';

export function applyLegacyPluginsFromConfig(sdk: Browsonic, config: BrowsonicConfig): void {
  sdk.register(errorPlugin());
  sdk.register(consolePlugin());
  sdk.register(networkPlugin());

  if (config.captureXHR !== false) {
    sdk.register(xhrPlugin());
  }
  if (config.trackNavigation !== false) {
    sdk.register(navigationPlugin());
  }
  if (config.trackVisitor === true) {
    sdk.register(visitorPlugin());
  }
  if (config.captureAsyncStack === 'global') {
    sdk.register(callbackPlugin());
  }
  if (config.trackPageViews !== false && config.apiKey) {
    sdk.register(pageViewPlugin());
  }
}
