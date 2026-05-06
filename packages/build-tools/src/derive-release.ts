// SPDX-License-Identifier: Apache-2.0

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Derive a release identifier when the consumer didn't pass one
 * explicitly. Order:
 *
 *   1. `BROWSONIC_RELEASE` env var (CI typically sets this).
 *   2. Git short-sha (`git rev-parse --short HEAD`).
 *   3. `package.json` `version` from `cwd`.
 *   4. throw — explicit failure beats silent `version=undefined`.
 */
export function deriveRelease(cwd: string = process.cwd()): string {
  const fromEnv = process.env.BROWSONIC_RELEASE;
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  try {
    const sha = execSync("git rev-parse --short HEAD", {
      cwd,
      stdio: ["pipe", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (sha.length > 0) return sha;
  } catch {
    // not a git repo, or git missing — fall through
  }

  const pkgPath = resolve(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(raw) as { version?: unknown };
      if (typeof pkg.version === "string" && pkg.version.length > 0) {
        return pkg.version;
      }
    } catch {
      // malformed package.json — fall through
    }
  }

  throw new Error(
    "Could not derive Browsonic release. Set BROWSONIC_RELEASE env var or pass `release` to the plugin options.",
  );
}
