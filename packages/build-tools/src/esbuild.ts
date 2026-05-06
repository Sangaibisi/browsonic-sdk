// SPDX-License-Identifier: Apache-2.0

/**
 * esbuild plugin — uploads source maps after a build completes via
 * the `onEnd` hook.
 *
 * Drop into `build.mjs`:
 *
 * ```js
 * import { build } from 'esbuild';
 * import browsonicSourceMaps from '@browsonic/build-tools/esbuild';
 *
 * await build({
 *   entryPoints: ['src/index.ts'],
 *   outdir: 'dist',
 *   sourcemap: 'external',
 *   plugins: [browsonicSourceMaps({ appKey: 'web' })],
 * });
 * ```
 *
 * Note: esbuild's plugin model fires `onEnd` after every build. In
 * watch mode this means an upload per rebuild — set `dryRun: true`
 * (or skip the plugin entirely) in dev configs.
 */

import { runUploadFromOptions } from "./run-upload.js";
import type { BrowsonicSourceMapsOptions } from "./types.js";

/**
 * Structural shape of the esbuild plugin context. Defined locally so
 * this package does not pull in `esbuild` as a build-time dependency.
 */
interface EsbuildBuildOptionsLike {
  outdir?: string;
  outfile?: string;
}

interface EsbuildPluginBuildLike {
  initialOptions: EsbuildBuildOptionsLike;
  onEnd(callback: () => void | Promise<void>): void;
}

interface EsbuildPluginLike {
  name: string;
  setup(build: EsbuildPluginBuildLike): void;
}

export function browsonicSourceMaps(
  options: BrowsonicSourceMapsOptions,
): EsbuildPluginLike {
  return {
    name: "browsonic-source-maps",
    setup(build) {
      build.onEnd(async () => {
        let detected: string | undefined = build.initialOptions.outdir;
        if (
          detected === undefined &&
          build.initialOptions.outfile !== undefined
        ) {
          const file = build.initialOptions.outfile;
          const idx = file.lastIndexOf("/");
          detected = idx >= 0 ? file.slice(0, idx) : ".";
        }
        const distPath = options.distPath ?? detected ?? "dist";
        await runUploadFromOptions(options, distPath);
      });
    },
  };
}

export default browsonicSourceMaps;
