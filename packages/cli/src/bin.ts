#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * `browsonic` bin entry. Invoked by `npx @browsonic/cli` /
 * `pnpm exec browsonic` / a CI step. Parses `process.argv`, runs
 * the matching command, and exits with a POSIX-friendly code so
 * shells can react to failures.
 *
 * Exit codes:
 *   0  success / dry-run / help / version
 *   1  per-file upload failure (some files succeeded)
 *   2  argv validation failure (misuse — bad / missing flags)
 *   3  HTTP auth failure (401 / 403)
 *   4  HTTP payload-too-large (413)
 *   5  HTTP transient failure (5xx — caller should retry)
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import {
  parseCliArgs,
  ArgsError,
  USAGE,
  USAGE_UPLOAD_SOURCEMAPS,
} from "./args.js";
import { runUploadSourcemaps } from "./commands/upload-sourcemaps.js";
import { UploadError, CLI_VERSION } from "./index.js";

const logger = {
  log: (m: string): void => {
    process.stdout.write(m + "\n");
  },
  error: (m: string): void => {
    process.stderr.write(m + "\n");
  },
};

async function main(): Promise<number> {
  let args;
  try {
    args = parseCliArgs(process.argv.slice(2), process.env);
  } catch (err) {
    if (err instanceof ArgsError) {
      // exitCode 0 means we showed help and want a clean exit;
      // anything else is a misuse-style failure.
      const sink = err.exitCode === 0 ? logger.log : logger.error;
      sink(err.message);
      return err.exitCode;
    }
    throw err;
  }

  switch (args.command) {
    case "help":
      logger.log(
        args.topic === "upload-sourcemaps" ? USAGE_UPLOAD_SOURCEMAPS : USAGE,
      );
      return 0;
    case "version":
      logger.log(CLI_VERSION);
      return 0;
    case "upload-sourcemaps":
      try {
        const result = await runUploadSourcemaps(args, logger);
        return result.failed > 0 ? 1 : 0;
      } catch (err) {
        if (err instanceof UploadError) {
          logger.error(err.message);
          if (err.status === 401 || err.status === 403) return 3;
          if (err.status === 413) return 4;
          if (err.status >= 500) return 5;
          return 1;
        }
        logger.error(
          `[browsonic] unexpected error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
        );
        return 1;
      }
  }
}

main().then(
  (code) => {
    process.exit(code);
  },
  (err) => {
    logger.error(
      `[browsonic] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
    );
    process.exit(1);
  },
);
