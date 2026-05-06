// SPDX-License-Identifier: Apache-2.0

import {
  runUploadSourcemaps,
  type UploadSourcemapsArgs,
  type UploadSourcemapsLogger,
} from "@browsonic/cli";

import { deriveRelease } from "./derive-release.js";
import type { BrowsonicSourceMapsOptions } from "./types.js";

const DEFAULT_BASE_URL = "https://api.browsonic.io";

function resolveLogger(silent: boolean | undefined): UploadSourcemapsLogger {
  if (silent === true) {
    return { log: () => undefined, error: () => undefined };
  }
  return {
    log: (m: string) => {
      console.log(m);
    },
    error: (m: string) => {
      console.error(m);
    },
  };
}

/**
 * Resolve plugin options into the CLI's `UploadSourcemapsArgs` and
 * run the upload. Every Browsonic bundler plugin calls this from its
 * post-build hook.
 *
 * Errors handling: if `bailOnError` is true, this re-throws. Otherwise
 * the error is logged and we return — sourcemap upload is not a
 * release blocker by default.
 */
export async function runUploadFromOptions(
  options: BrowsonicSourceMapsOptions,
  resolvedDistPath: string,
  cwd: string = process.cwd(),
): Promise<void> {
  const logger = resolveLogger(options.silent);

  const token = options.token ?? process.env.BROWSONIC_SOURCEMAP_TOKEN;
  if (!token) {
    if (options.silent !== true) {
      logger.error(
        "[browsonic] BROWSONIC_SOURCEMAP_TOKEN not set — skipping sourcemap upload.",
      );
    }
    return;
  }

  let release: string;
  try {
    release = options.release ?? deriveRelease(cwd);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[browsonic] ${msg}`);
    if (options.bailOnError === true) throw err;
    return;
  }

  const args: UploadSourcemapsArgs = {
    command: "upload-sourcemaps",
    distPath: resolvedDistPath,
    release,
    appKey: options.appKey,
    token,
    baseUrl:
      options.baseUrl ?? process.env.BROWSONIC_API_ENDPOINT ?? DEFAULT_BASE_URL,
    dryRun: options.dryRun === true,
    bailOnError: options.bailOnError === true,
    ...(options.dist !== undefined ? { dist: options.dist } : {}),
  };

  try {
    const result = await runUploadSourcemaps(args, logger);
    if (options.silent !== true) {
      logger.log(
        `[browsonic] sourcemap upload: ${String(result.uploaded)} uploaded / ${String(result.failed)} failed / ${String(result.discovered)} discovered.`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[browsonic] sourcemap upload failed: ${msg}`);
    if (options.bailOnError === true) throw err;
  }
}
