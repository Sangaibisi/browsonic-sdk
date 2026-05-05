// SPDX-License-Identifier: Apache-2.0

/**
 * `runUploadSourcemaps` regression suite. Uses real tmpdir trees +
 * a captured logger so the orchestration logic (walk → upload →
 * summary) is exercised end-to-end. The HTTP path is exercised
 * via the dry-run code path because `runUploadSourcemaps` doesn't
 * accept a `fetch` override (its caller wires that on the real
 * upload path; tests for that live in `upload.test.ts`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUploadSourcemaps } from "./upload-sourcemaps";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "browsonic-cli-cmd-test-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

async function placeMap(
  rel: string,
  content = '{"version":3,"sources":[]}',
): Promise<void> {
  const full = join(tmpRoot, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
}

function makeLogger() {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logger: {
      log: (m: string) => logs.push(m),
      error: (m: string) => errors.push(m),
    },
    logs,
    errors,
  };
}

describe("runUploadSourcemaps", () => {
  it("walks the dist tree, uploads (dry-run) each *.map, returns the aggregate", async () => {
    await placeMap("a.js.map");
    await placeMap("chunks/b.js.map");
    await placeMap("static/c.js.map");

    const { logger, logs } = makeLogger();
    const result = await runUploadSourcemaps(
      {
        command: "upload-sourcemaps",
        distPath: tmpRoot,
        release: "v1.2.3",
        appKey: "app_xyz",
        token: "sm_token",
        baseUrl: "https://ingest.test",
        dryRun: true,
        bailOnError: false,
      },
      logger,
    );

    expect(result.discovered).toBe(3);
    expect(result.uploaded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(3);
    expect(
      result.results.every((r) => r.id?.startsWith("dry-run:v1.2.3:")),
    ).toBe(true);
    expect(logs.some((line) => line.includes("3 file(s) found"))).toBe(true);
    expect(logs.some((line) => line.includes("3/3 succeeded"))).toBe(true);
    expect(logs.some((line) => line.includes("dry-run"))).toBe(true);
  });

  it("returns 0 discovered when the dist has no *.map files", async () => {
    await mkdir(join(tmpRoot, "empty"), { recursive: true });
    const { logger, logs } = makeLogger();

    const result = await runUploadSourcemaps(
      {
        command: "upload-sourcemaps",
        distPath: tmpRoot,
        release: "v1",
        appKey: "a",
        token: "t",
        baseUrl: "https://x",
        dryRun: true,
        bailOnError: false,
      },
      logger,
    );

    expect(result.discovered).toBe(0);
    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(0);
    expect(logs[0]).toContain("nothing to upload");
  });

  it("throws when --dist-path does not exist", async () => {
    const { logger } = makeLogger();
    await expect(
      runUploadSourcemaps(
        {
          command: "upload-sourcemaps",
          distPath: join(tmpRoot, "does-not-exist"),
          release: "v1",
          appKey: "a",
          token: "t",
          baseUrl: "https://x",
          dryRun: true,
          bailOnError: false,
        },
        logger,
      ),
    ).rejects.toMatchObject({
      name: "UploadError",
      status: 2,
    });
  });

  it("logs progress lines per file in walk order", async () => {
    await placeMap("a.js.map", '{"version":3}');
    await placeMap("b.js.map", '{"version":3}');

    const { logger, logs } = makeLogger();
    await runUploadSourcemaps(
      {
        command: "upload-sourcemaps",
        distPath: tmpRoot,
        release: "v1",
        appKey: "a",
        token: "t",
        baseUrl: "https://x",
        dryRun: true,
        bailOnError: false,
      },
      logger,
    );

    const progressLines = logs.filter((l) => l.startsWith("  ✓ "));
    expect(progressLines).toHaveLength(2);
    expect(progressLines[0]).toContain("a.js.map");
    expect(progressLines[1]).toContain("b.js.map");
  });

  it("passes the optional dist field through dry-run", async () => {
    await placeMap("a.js.map");

    const { logger } = makeLogger();
    const result = await runUploadSourcemaps(
      {
        command: "upload-sourcemaps",
        distPath: tmpRoot,
        release: "v1",
        appKey: "a",
        token: "t",
        baseUrl: "https://x",
        dist: "esm",
        dryRun: true,
        bailOnError: false,
      },
      logger,
    );

    expect(result.uploaded).toBe(1);
  });

  it("reports bytes per uploaded file", async () => {
    await placeMap("a.js.map", "x".repeat(100));

    const { logger, logs } = makeLogger();
    await runUploadSourcemaps(
      {
        command: "upload-sourcemaps",
        distPath: tmpRoot,
        release: "v1",
        appKey: "a",
        token: "t",
        baseUrl: "https://x",
        dryRun: true,
        bailOnError: false,
      },
      logger,
    );

    const fileLine = logs.find((l) => l.includes("a.js.map"));
    expect(fileLine).toMatch(/100 bytes/);
  });

  it("does not invoke real fetch when dry-run is true", async () => {
    await placeMap("a.js.map");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch should not be called in dry-run");
    });

    try {
      const { logger } = makeLogger();
      await runUploadSourcemaps(
        {
          command: "upload-sourcemaps",
          distPath: tmpRoot,
          release: "v1",
          appKey: "a",
          token: "t",
          baseUrl: "https://x",
          dryRun: true,
          bailOnError: false,
        },
        logger,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
