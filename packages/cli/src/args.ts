// SPDX-License-Identifier: Apache-2.0

/**
 * Argument parsing for the Browsonic CLI. Uses Node's built-in
 * `node:util.parseArgs` (Node 18.3+) so the CLI keeps zero npm
 * runtime deps. Returns a structured shape per command instead of
 * raw flags, so the command implementation never has to re-derive
 * the same flag names.
 *
 * Why a custom parser instead of `commander` / `yargs`: install
 * footprint. The CLI runs once per build (CI, prerelease hooks)
 * and ships a single command (today) — a 100-LOC parser is the
 * right size for the contract.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { parseArgs } from "node:util";

export interface UploadSourcemapsArgs {
  command: "upload-sourcemaps";
  /** Dist directory to walk for `*.map` files. */
  distPath: string;
  /** Release tag (matches `BrowsonicConfig.release`). */
  release: string;
  /** App key from the dashboard. Maps to env `BROWSONIC_APP_KEY`. */
  appKey: string;
  /** Bearer token for sourcemap upload. Maps to env `BROWSONIC_SOURCEMAP_TOKEN`. */
  token: string;
  /** Base URL of the ingest service. Defaults to `BROWSONIC_API_ENDPOINT`. */
  baseUrl: string;
  /** Distribution discriminator (rare). */
  dist?: string;
  /** Skip the actual HTTP call; print would-have-uploaded list. */
  dryRun: boolean;
  /** Continue on per-file upload errors instead of aborting. */
  bailOnError: boolean;
}

export interface HelpArgs {
  command: "help";
  topic?: string | undefined;
}

export interface VersionArgs {
  command: "version";
}

export type Args = UploadSourcemapsArgs | HelpArgs | VersionArgs;

export interface Env {
  BROWSONIC_API_ENDPOINT?: string;
  BROWSONIC_APP_KEY?: string;
  BROWSONIC_SOURCEMAP_TOKEN?: string;
}

export class ArgsError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 2,
  ) {
    super(message);
    this.name = "ArgsError";
  }
}

/**
 * Parse the user's argv into a structured command shape. The first
 * positional is the subcommand (`upload-sourcemaps`, `help`,
 * `version`). Flags after that subcommand fill the remaining fields,
 * with environment-variable fallbacks for credentials so CI never
 * has to leak tokens onto the shell history.
 *
 * Throws {@link ArgsError} with `exitCode` = 2 (POSIX "misuse")
 * on validation failures. The bin entry catches this and prints
 * the message before exiting.
 */
export function parseCliArgs(argv: string[], env: Env = {}): Args {
  const [maybeCommand, ...rest] = argv;
  if (!maybeCommand || maybeCommand === "--help" || maybeCommand === "-h") {
    return { command: "help" };
  }
  if (maybeCommand === "--version" || maybeCommand === "-v") {
    return { command: "version" };
  }

  switch (maybeCommand) {
    case "help":
      return rest[0] !== undefined
        ? { command: "help", topic: rest[0] }
        : { command: "help" };
    case "version":
      return { command: "version" };
    case "upload-sourcemaps":
      return parseUploadSourcemaps(rest, env);
    default:
      throw new ArgsError(
        `Unknown command: ${maybeCommand}. Run \`browsonic help\` for usage.`,
      );
  }
}

function parseUploadSourcemaps(rest: string[], env: Env): UploadSourcemapsArgs {
  const parsed = parseArgs({
    args: rest,
    options: {
      "dist-path": { type: "string" },
      release: { type: "string" },
      "app-key": { type: "string" },
      token: { type: "string" },
      "base-url": { type: "string" },
      dist: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "bail-on-error": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (parsed.values.help === true) {
    throw new ArgsError(USAGE_UPLOAD_SOURCEMAPS, 0);
  }

  const distPath = parsed.values["dist-path"];
  const release = parsed.values.release;
  const appKey = parsed.values["app-key"] ?? env.BROWSONIC_APP_KEY;
  const token = parsed.values.token ?? env.BROWSONIC_SOURCEMAP_TOKEN;
  const baseUrl = parsed.values["base-url"] ?? env.BROWSONIC_API_ENDPOINT;

  if (!distPath) {
    throw new ArgsError(
      "--dist-path is required.\n\n" + USAGE_UPLOAD_SOURCEMAPS,
    );
  }
  if (!release) {
    throw new ArgsError("--release is required.\n\n" + USAGE_UPLOAD_SOURCEMAPS);
  }
  if (!appKey) {
    throw new ArgsError(
      "--app-key (or BROWSONIC_APP_KEY env) is required.\n\n" +
        USAGE_UPLOAD_SOURCEMAPS,
    );
  }
  if (!token) {
    throw new ArgsError(
      "--token (or BROWSONIC_SOURCEMAP_TOKEN env) is required.\n\n" +
        USAGE_UPLOAD_SOURCEMAPS,
    );
  }
  if (!baseUrl) {
    throw new ArgsError(
      "--base-url (or BROWSONIC_API_ENDPOINT env) is required.\n\n" +
        USAGE_UPLOAD_SOURCEMAPS,
    );
  }

  const result: UploadSourcemapsArgs = {
    command: "upload-sourcemaps",
    distPath,
    release,
    appKey,
    token,
    baseUrl,
    dryRun: parsed.values["dry-run"] === true,
    bailOnError: parsed.values["bail-on-error"] === true,
  };
  if (parsed.values.dist !== undefined) {
    result.dist = parsed.values.dist;
  }
  return result;
}

export const USAGE = `Usage: browsonic <command> [options]

Commands:
  upload-sourcemaps   Walk a dist tree and upload every *.map to the ingest service.
  help [<topic>]      Print usage. \`help upload-sourcemaps\` for the command's flags.
  version             Print the CLI version.

Run \`browsonic help <command>\` for command-specific options.
Tokens may be passed via env vars (BROWSONIC_API_ENDPOINT, BROWSONIC_APP_KEY,
BROWSONIC_SOURCEMAP_TOKEN) so they don't leak onto CI shell history.
`;

export const USAGE_UPLOAD_SOURCEMAPS = `Usage: browsonic upload-sourcemaps [options]

Required:
  --dist-path <path>   Directory to walk for *.map files (e.g. ./dist).
  --release <tag>      Release tag (matches your SDK BrowsonicConfig.release).
  --app-key <key>      App key from the Browsonic dashboard.
                       (env: BROWSONIC_APP_KEY)
  --token <token>      Sourcemap upload bearer token.
                       (env: BROWSONIC_SOURCEMAP_TOKEN)
  --base-url <url>     Ingest service base URL.
                       (env: BROWSONIC_API_ENDPOINT)

Optional:
  --dist <name>        Distribution discriminator (rarely needed).
  --dry-run            Skip the HTTP call; print would-have-uploaded list.
                       Useful before the ingest endpoint is live.
  --bail-on-error      Abort batch on first per-file failure (default:
                       continue and surface aggregate failures at exit).
  -h, --help           Print this help text.

Examples:
  browsonic upload-sourcemaps --dist-path ./dist --release v1.2.3 --dry-run
  BROWSONIC_API_ENDPOINT=https://ingest.example.com \\
  BROWSONIC_APP_KEY=app_xyz \\
  BROWSONIC_SOURCEMAP_TOKEN=sm_abc \\
  browsonic upload-sourcemaps --dist-path ./dist --release v1.2.3
`;
