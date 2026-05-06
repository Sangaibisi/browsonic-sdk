// SPDX-License-Identifier: Apache-2.0

/**
 * Vite plugin — uploads source maps to Browsonic after the bundle
 * is written. Hooks `closeBundle` (post, build-only) so Vite's own
 * tooling has finished writing files before we walk the dist tree.
 *
 * Drop into `vite.config.ts`:
 *
 * ```ts
 * import { defineConfig } from 'vite';
 * import browsonicSourceMaps from '@browsonic/build-tools/vite';
 *
 * export default defineConfig({
 *   build: { sourcemap: 'hidden' },
 *   plugins: [
 *     browsonicSourceMaps({ appKey: 'web' }),
 *   ],
 * });
 * ```
 *
 * `build.sourcemap: 'hidden'` is recommended: Vite emits .map files
 * without a `sourceMappingURL` comment, so production HTML never
 * advertises the maps to end users.
 */

import { runUploadFromOptions } from "./run-upload.js";
import type { BrowsonicSourceMapsOptions } from "./types.js";

/**
 * Structural shape of the Vite plugin object. Defined locally so this
 * package does not pull in `vite` as a build-time dependency.
 */
interface VitePluginLike {
  name: string;
  apply?: "build" | "serve";
  enforce?: "pre" | "post";
  configResolved?: (config: { build: { outDir: string } }) => void;
  closeBundle?: () => void | Promise<void>;
}

export function browsonicSourceMaps(
  options: BrowsonicSourceMapsOptions,
): VitePluginLike {
  let resolvedOutDir: string | undefined;

  return {
    name: "browsonic-source-maps",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      resolvedOutDir = config.build.outDir;
    },
    async closeBundle() {
      const distPath = options.distPath ?? resolvedOutDir ?? "dist";
      await runUploadFromOptions(options, distPath);
    },
  };
}

export default browsonicSourceMaps;
