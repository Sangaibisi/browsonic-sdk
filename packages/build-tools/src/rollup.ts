// SPDX-License-Identifier: Apache-2.0

/**
 * Rollup plugin — uploads source maps after `writeBundle` (post-write
 * hook). Drop into `rollup.config.js`:
 *
 * ```js
 * import browsonicSourceMaps from '@browsonic/build-tools/rollup';
 *
 * export default {
 *   output: { dir: 'dist', sourcemap: 'hidden' },
 *   plugins: [
 *     browsonicSourceMaps({ appKey: 'web' }),
 *   ],
 * };
 * ```
 */

import { runUploadFromOptions } from "./run-upload.js";
import type { BrowsonicSourceMapsOptions } from "./types.js";

/**
 * Structural shape of a Rollup plugin object + the `writeBundle`
 * options. Defined locally so this package does not pull in `rollup`
 * as a build-time dependency.
 */
interface RollupWriteBundleOptions {
  dir?: string;
  file?: string;
}

interface RollupPluginLike {
  name: string;
  writeBundle?: (options: RollupWriteBundleOptions) => void | Promise<void>;
}

export function browsonicSourceMaps(
  options: BrowsonicSourceMapsOptions,
): RollupPluginLike {
  return {
    name: "browsonic-source-maps",
    async writeBundle(outputOptions) {
      let detected: string | undefined;
      if (outputOptions.dir !== undefined) {
        detected = outputOptions.dir;
      } else if (outputOptions.file !== undefined) {
        // Single-file output — the dist directory is the file's parent.
        const idx = outputOptions.file.lastIndexOf("/");
        detected = idx >= 0 ? outputOptions.file.slice(0, idx) : ".";
      }
      const distPath = options.distPath ?? detected ?? "dist";
      await runUploadFromOptions(options, distPath);
    },
  };
}

export default browsonicSourceMaps;
