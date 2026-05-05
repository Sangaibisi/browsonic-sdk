// SPDX-License-Identifier: Apache-2.0

/**
 * Dist tree traversal for sourcemap discovery. Walks a directory
 * recursively and yields every file matching the sourcemap glob —
 * by convention `**\/*.map` for external sourcemaps. The walker
 * uses Node's stable `node:fs/promises` API only — no glob
 * dependencies.
 *
 * Why a custom walker instead of `glob` / `fast-glob`: this CLI's
 * dependency graph is "zero npm runtime deps" by design. Adding a
 * glob package for a single-glob, depth-bounded walk would be
 * net-negative on install size. The walker below does the same job
 * in 30 lines.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { readdir } from "node:fs/promises";
import { join, extname, sep } from "node:path";

/**
 * Discover sourcemap files under `rootDir`. Returns absolute paths
 * to every `*.map` file the walker found, in directory-listing
 * order (deterministic on most file systems).
 *
 * @param rootDir Absolute path to the dist directory.
 * @param options.extensions File extensions to match. Default `['.map']`.
 * @param options.maxDepth Maximum directory depth from `rootDir`.
 *   Defaults to 12 — typical bundler outputs nest at most 4-5
 *   levels deep; the cap stops a runaway recursion if the tree
 *   contains a cycle (rare with bind mounts) without affecting
 *   real-world traversal.
 * @param options.ignore Directory names to skip at every level.
 *   Defaults to `['node_modules', '.git']` — sourcemaps in those
 *   trees are vendor / VCS noise, never the consumer's bundle.
 */
export async function discoverSourceMaps(
  rootDir: string,
  options: {
    extensions?: string[];
    maxDepth?: number;
    ignore?: string[];
  } = {},
): Promise<string[]> {
  const extensions = options.extensions ?? [".map"];
  const maxDepth = options.maxDepth ?? 12;
  const ignore = new Set(options.ignore ?? ["node_modules", ".git"]);
  const matches: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      // `encoding: 'utf8'` pins `entry.name` to `string` (the
      // default in newer Node types is `Buffer` when withFileTypes
      // is true).
      entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      // Directory doesn't exist or isn't readable. The caller
      // verifies the rootDir before invoking; per-subdir failures
      // are swallowed because a single unreadable subtree shouldn't
      // abort the entire walk.
      return;
    }

    for (const entry of entries) {
      const name: string = entry.name;
      const full = join(dir, name);
      if (entry.isDirectory()) {
        if (ignore.has(name)) continue;
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        if (extensions.includes(extname(name))) {
          matches.push(full);
        }
      }
    }
  }

  await walk(rootDir, 0);
  return matches;
}

/**
 * Convert an absolute sourcemap path into the `filename` field the
 * service ingest expects. The convention is the path *relative* to
 * `rootDir`, with leading `/` and OS-specific separators normalised
 * to forward slashes (the runtime URL the SDK reports always uses
 * `/`).
 *
 * @param mapPath Absolute path to a `.map` file inside `rootDir`.
 * @param rootDir The dist directory that was walked.
 *
 * @example
 * relativeFilenameForUpload('/proj/dist/chunks/abc.js.map', '/proj/dist')
 *   → 'chunks/abc.js.map'
 */
export function relativeFilenameForUpload(
  mapPath: string,
  rootDir: string,
): string {
  const trimmedRoot = rootDir.endsWith(sep) ? rootDir.slice(0, -1) : rootDir;
  const relative = mapPath.startsWith(trimmedRoot)
    ? mapPath.slice(trimmedRoot.length)
    : mapPath;
  // Strip a single leading separator and normalise to forward
  // slashes for the wire format.
  const trimmed = relative.startsWith(sep) ? relative.slice(1) : relative;
  return trimmed.split(sep).join("/");
}
