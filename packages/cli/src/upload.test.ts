// SPDX-License-Identifier: Apache-2.0

/**
 * `uploadOne` + `uploadOneDryRun` regression suite. Uses the
 * injectable `fetch` override so tests don't make real network
 * calls. The dry-run path is fully filesystem-isolated.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uploadOne, uploadOneDryRun, UploadError } from "./upload";

let tmpRoot: string;
let mapPath: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "browsonic-cli-upload-test-"));
  mapPath = join(tmpRoot, "sample.js.map");
  await writeFile(mapPath, '{"version":3,"sources":[]}', "utf8");
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

// Typed fetch mock — vitest's `vi.fn` infers a 0-param signature
// from a sync arrow that returns Promise<Response>. Pinning the
// generic preserves the [url, init] tuple shape on `mock.calls`.
type FetchFn = typeof globalThis.fetch;
type FetchArgs = Parameters<FetchFn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(
  body: string,
  status: number,
  statusText: string,
): Response {
  return new Response(body, { status, statusText });
}

describe("uploadOne", () => {
  it("POSTs to <baseUrl>/v1/sourcemaps with Bearer auth + multipart body", async () => {
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({ id: "sm_01HZ" })),
    );

    const result = await uploadOne(mapPath, "sample.js.map", {
      baseUrl: "https://ingest.test",
      token: "sm_token",
      appKey: "app_xyz",
      release: "v1.2.3",
      fetch: fetchMock as never,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe("https://ingest.test/v1/sourcemaps");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sm_token",
    );
    expect(init.body).toBeInstanceOf(FormData);

    expect(result.filename).toBe("sample.js.map");
    expect(result.status).toBe(200);
    expect(result.id).toBe("sm_01HZ");
    expect(result.bytes).toBe(26);
  });

  it("strips a trailing slash from baseUrl", async () => {
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({})),
    );
    await uploadOne(mapPath, "a.map", {
      baseUrl: "https://ingest.test/",
      token: "t",
      appKey: "a",
      release: "v1",
      fetch: fetchMock as never,
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://ingest.test/v1/sourcemaps",
    );
  });

  it("treats a 409 as a successful idempotent dup", async () => {
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(() =>
      Promise.resolve(jsonResponse({}, 409)),
    );
    const result = await uploadOne(mapPath, "a.map", {
      baseUrl: "https://ingest.test",
      token: "t",
      appKey: "a",
      release: "v1",
      fetch: fetchMock as never,
    });
    expect(result.status).toBe(409);
  });

  it("throws UploadError with status on a 4xx response", async () => {
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(() =>
      Promise.resolve(textResponse("forbidden", 403, "Forbidden")),
    );
    await expect(
      uploadOne(mapPath, "a.map", {
        baseUrl: "https://ingest.test",
        token: "t",
        appKey: "a",
        release: "v1",
        fetch: fetchMock as never,
      }),
    ).rejects.toMatchObject({
      name: "UploadError",
      status: 403,
      filename: "a.map",
    });
  });

  it("throws UploadError with status on a 5xx response", async () => {
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(() =>
      Promise.resolve(textResponse("boom", 503, "Service Unavailable")),
    );
    try {
      await uploadOne(mapPath, "a.map", {
        baseUrl: "https://ingest.test",
        token: "t",
        appKey: "a",
        release: "v1",
        fetch: fetchMock as never,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(UploadError);
      expect((err as UploadError).status).toBe(503);
    }
  });

  it("passes the optional dist field through to the form body", async () => {
    let capturedBody: FormData | undefined;
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      (_url, init) => {
        capturedBody = init?.body as FormData;
        return Promise.resolve(jsonResponse({}));
      },
    );
    await uploadOne(mapPath, "a.map", {
      baseUrl: "https://ingest.test",
      token: "t",
      appKey: "a",
      release: "v1",
      dist: "esm",
      fetch: fetchMock as never,
    });
    expect(capturedBody?.get("dist")).toBe("esm");
    expect(capturedBody?.get("release")).toBe("v1");
    expect(capturedBody?.get("filename")).toBe("a.map");
    expect(capturedBody?.get("appKey")).toBe("a");
  });

  it("omits dist from the form body when not provided", async () => {
    let capturedBody: FormData | undefined;
    const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      (_url, init) => {
        capturedBody = init?.body as FormData;
        return Promise.resolve(jsonResponse({}));
      },
    );
    await uploadOne(mapPath, "a.map", {
      baseUrl: "https://ingest.test",
      token: "t",
      appKey: "a",
      release: "v1",
      fetch: fetchMock as never,
    });
    expect(capturedBody?.has("dist")).toBe(false);
  });
});

describe("uploadOneDryRun", () => {
  it("returns a recorded result without invoking fetch", async () => {
    const result = await uploadOneDryRun(mapPath, "sample.js.map", {
      release: "v1.2.3",
      appKey: "app_xyz",
      baseUrl: "https://ingest.test",
    });
    expect(result.filename).toBe("sample.js.map");
    expect(result.status).toBe(200);
    expect(result.bytes).toBe(26);
    expect(result.id).toBe("dry-run:v1.2.3:sample.js.map");
  });
});

describe("UploadError", () => {
  it("carries name + status + filename", () => {
    const err = new UploadError("boom", 503, "a.map");
    expect(err.name).toBe("UploadError");
    expect(err.status).toBe(503);
    expect(err.filename).toBe("a.map");
    expect(err.message).toBe("boom");
  });
});
