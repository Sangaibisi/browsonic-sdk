// SPDX-License-Identifier: Apache-2.0

/**
 * Sourcemap upload HTTP client. Uses Node 20+'s built-in `fetch` +
 * `FormData` + `Blob` from `node:buffer` so the upload path stays
 * dependency-free. The endpoint contract matches the design draft
 * (see `docs/design/SOURCEMAP_PIPELINE.md`):
 *
 *   POST <baseUrl>/v1/sourcemaps
 *   Authorization: Bearer <token>
 *   Content-Type: multipart/form-data
 *   Form fields: release, filename, sourcemap (file), [dist]
 *
 * The CLI's `--dry-run` mode swaps the real `fetch` for a
 * "would-have-POSTed" stub so consumers can validate their build
 * config before the service ingest endpoint is live.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { readFile } from "node:fs/promises";
import { Blob } from "node:buffer";

export interface UploadOptions {
  /** Base URL of the Browsonic ingest service (no trailing slash). */
  baseUrl: string;
  /** Per-app sourcemap-upload token (Bearer auth). */
  token: string;
  /** App key the dashboard uses to identify the project. */
  appKey: string;
  /** The release tag this sourcemap belongs to. */
  release: string;
  /** Distribution discriminator (rarely needed). */
  dist?: string;
  /**
   * `fetch` override. Defaults to the global `fetch` (Node 20+).
   * Tests pass a stub; `--dry-run` mode passes a recording stub.
   */
  fetch?: typeof globalThis.fetch;
}

export interface UploadResult {
  /** The relative filename used on the wire (matches `relativeFilenameForUpload`). */
  filename: string;
  /** HTTP status code returned. `200` (created) or `409` (idempotent dup) on success. */
  status: number;
  /** Service-issued sourcemap id, when available. */
  id?: string;
  /** Bytes posted (the sourcemap file size). */
  bytes: number;
}

/**
 * Upload one sourcemap file to the ingest endpoint. Caller passes
 * the absolute file path + the `filename` (relative path the runtime
 * will report). Returns once the service responds; throws on 4xx /
 * 5xx so the caller can decide whether to abort the rest of the
 * batch or continue.
 *
 * The upload is idempotent on the service side — duplicate uploads
 * of the same `(release, filename)` return 200 / 409 without
 * re-storing.
 */
export async function uploadOne(
  filePath: string,
  filename: string,
  options: UploadOptions,
): Promise<UploadResult> {
  const buf = await readFile(filePath);
  const bytes = buf.byteLength;
  const blob = new Blob([buf], { type: "application/json" });

  const form = new FormData();
  form.append("release", options.release);
  form.append("filename", filename);
  form.append("appKey", options.appKey);
  if (options.dist !== undefined) {
    form.append("dist", options.dist);
  }
  // The Blob -> File coercion isn't strictly needed; FormData on
  // Node 20+ accepts Blob with a third-arg name. We pass the
  // relative filename so the multipart Content-Disposition carries
  // a useful `filename=` field for service-side debugging.
  form.append("sourcemap", blob, filename);

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const url = `${stripTrailingSlash(options.baseUrl)}/v1/sourcemaps`;

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.token}`,
      // No `Content-Type` — fetch sets the multipart boundary.
    },
    body: form,
  });

  if (!res.ok && res.status !== 409) {
    const text = await safeText(res);
    throw new UploadError(
      `Sourcemap upload failed: ${res.status} ${res.statusText}\n${text}`,
      res.status,
      filename,
    );
  }

  let id: string | undefined;
  try {
    const body = (await res.json()) as { id?: unknown };
    if (typeof body.id === "string") id = body.id;
  } catch {
    // Service may return empty body on 409; tolerate.
  }

  return {
    filename,
    status: res.status,
    bytes,
    ...(id !== undefined ? { id } : {}),
  };
}

/**
 * `--dry-run` mode shim. Returns a recorded "would-have-uploaded"
 * result without making any HTTP call. Useful for CI smoke tests
 * before the service endpoint is live, and for consumers
 * validating their build config.
 */
export async function uploadOneDryRun(
  filePath: string,
  filename: string,
  options: Pick<UploadOptions, "release" | "appKey" | "dist" | "baseUrl">,
): Promise<UploadResult> {
  const buf = await readFile(filePath);
  return {
    filename,
    status: 200,
    bytes: buf.byteLength,
    id: `dry-run:${options.release}:${filename}`,
  };
}

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly filename: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable response body>";
  }
}
