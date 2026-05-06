// SPDX-License-Identifier: Apache-2.0

/**
 * Webpack plugin — uploads source maps after the compilation emits
 * files. Hooks `afterEmit` (asynchronous) so Webpack's own pipeline
 * has finished writing.
 *
 * Drop into `webpack.config.js`:
 *
 * ```js
 * import { BrowsonicSourceMapsPlugin } from '@browsonic/build-tools/webpack';
 *
 * export default {
 *   devtool: 'hidden-source-map',
 *   plugins: [
 *     new BrowsonicSourceMapsPlugin({ appKey: 'web' }),
 *   ],
 * };
 * ```
 *
 * `devtool: 'hidden-source-map'` strips the `sourceMappingURL`
 * comment so production assets do not advertise the maps.
 */

import { runUploadFromOptions } from "./run-upload.js";
import type { BrowsonicSourceMapsOptions } from "./types.js";

/**
 * Structural shape of Webpack's compiler object. Defined locally so
 * this package does not pull in `webpack` as a build-time dependency.
 */
interface WebpackCompilerLike {
  hooks: {
    afterEmit: {
      tapPromise(name: string, fn: () => Promise<void>): void;
    };
  };
  options: {
    output?: {
      path?: string;
    };
  };
}

export class BrowsonicSourceMapsPlugin {
  private readonly options: BrowsonicSourceMapsOptions;

  constructor(options: BrowsonicSourceMapsOptions) {
    this.options = options;
  }

  apply(compiler: WebpackCompilerLike): void {
    const opts = this.options;
    compiler.hooks.afterEmit.tapPromise(
      "BrowsonicSourceMapsPlugin",
      async () => {
        const distPath =
          opts.distPath ?? compiler.options.output?.path ?? "dist";
        await runUploadFromOptions(opts, distPath);
      },
    );
  }
}

export default BrowsonicSourceMapsPlugin;
