// SPDX-License-Identifier: Apache-2.0

/**
 * `browsonic upload-sourcemaps` command implementation. Walks the
 * dist tree, finds every `.map` file, and uploads each to the
 * ingest service. The sequencing is sequential (not parallel) so
 * the service-side rate limit is gentle and consumers see
 * deterministic per-file progress lines.
 *
 * `--dry-run` mode swaps the real upload for a stub that prints
 * "would have uploaded" — useful before the ingest endpoint is live
 * and for CI smoke tests against unconfigured environments.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { stat } from "node:fs/promises";
import type { UploadSourcemapsArgs } from "../args.js";
import { discoverSourceMaps, relativeFilenameForUpload } from "../walk.js";
import {
  uploadOne,
  uploadOneDryRun,
  UploadError,
  type UploadResult,
} from "../upload.js";

export interface UploadSourcemapsLogger {
  log: (message: string) => void;
  error: (message: string) => void;
}

export interface UploadSourcemapsRunResult {
  /** Number of `.map` files the walker found. */
  discovered: number;
  /** Number of files actually uploaded (or simulated in dry-run). */
  uploaded: number;
  /** Number of per-file failures collected. */
  failed: number;
  /** Per-file results in walk order. */
  results: UploadResult[];
}

/**
 * Run the upload-sourcemaps command. Logs progress + summary lines
 * to the supplied logger; returns an aggregate result for the bin
 * entry's exit-code computation.
 *
 * Behaviour:
 *
 * - Walks `args.distPath` for `.map` files (recursive, ignoring
 *   `node_modules` / `.git`).
 * - For each file, computes the relative filename + uploads (or
 *   simulates in dry-run) and records the result.
 * - On a per-file `UploadError`, either bails (when
 *   `args.bailOnError` is true) or records the failure and
 *   continues.
 * - Returns the aggregate so the bin entry exits non-zero when
 *   anything failed.
 */
export async function runUploadSourcemaps(
  args: UploadSourcemapsArgs,
  logger: UploadSourcemapsLogger,
): Promise<UploadSourcemapsRunResult> {
  // Sanity-check the dist path before walking — a missing directory
  // is a config error, not an empty walk. POSIX `stat` raises on
  // missing entries; we surface a friendly message.
  await assertDistPathExists(args.distPath);

  const maps = await discoverSourceMaps(args.distPath);
  const results: UploadResult[] = [];
  let failed = 0;

  if (maps.length === 0) {
    logger.log(
      `[browsonic] upload-sourcemaps: no *.map files found under ${args.distPath} — nothing to upload.`,
    );
    return { discovered: 0, uploaded: 0, failed: 0, results: [] };
  }

  logger.log(
    `[browsonic] upload-sourcemaps: ${maps.length} file(s) found under ${args.distPath}` +
      (args.dryRun ? " (dry-run)" : ""),
  );

  for (const mapPath of maps) {
    const filename = relativeFilenameForUpload(mapPath, args.distPath);
    try {
      const result = await runOne(args, mapPath, filename);
      results.push(result);
      logger.log(
        `  ✓ ${filename} (${result.bytes} bytes)` +
          (result.id !== undefined ? ` → ${result.id}` : ""),
      );
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`  ✗ ${filename}: ${message}`);
      if (args.bailOnError) {
        throw err;
      }
    }
  }

  logger.log(
    `[browsonic] upload-sourcemaps: ${maps.length - failed}/${maps.length} succeeded` +
      (failed > 0 ? `, ${failed} failed` : "") +
      (args.dryRun ? " (dry-run — no HTTP requests made)" : ""),
  );

  return {
    discovered: maps.length,
    uploaded: maps.length - failed,
    failed,
    results,
  };
}

async function runOne(
  args: UploadSourcemapsArgs,
  mapPath: string,
  filename: string,
): Promise<UploadResult> {
  if (args.dryRun) {
    const dryArgs: Parameters<typeof uploadOneDryRun>[2] = {
      release: args.release,
      appKey: args.appKey,
      baseUrl: args.baseUrl,
    };
    if (args.dist !== undefined) {
      dryArgs.dist = args.dist;
    }
    return uploadOneDryRun(mapPath, filename, dryArgs);
  }
  const realArgs: Parameters<typeof uploadOne>[2] = {
    baseUrl: args.baseUrl,
    token: args.token,
    appKey: args.appKey,
    release: args.release,
  };
  if (args.dist !== undefined) {
    realArgs.dist = args.dist;
  }
  return uploadOne(mapPath, filename, realArgs);
}

async function assertDistPathExists(path: string): Promise<void> {
  try {
    const s = await stat(path);
    if (!s.isDirectory()) {
      throw new UploadError(`--dist-path is not a directory: ${path}`, 2, path);
    }
  } catch (err) {
    if (err instanceof UploadError) throw err;
    throw new UploadError(
      `--dist-path does not exist or is not readable: ${path}`,
      2,
      path,
    );
  }
}
