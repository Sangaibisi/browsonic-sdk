// SPDX-License-Identifier: Apache-2.0

/**
 * `discoverSourceMaps` + `relativeFilenameForUpload` regression
 * suite. Uses a real tmpdir tree so the walker exercises the same
 * `node:fs/promises` paths it would in production.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSourceMaps, relativeFilenameForUpload } from "./walk";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "browsonic-cli-test-"));
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

async function placeFile(rel: string, content = ""): Promise<string> {
  const full = join(tmpRoot, rel);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, content, "utf8");
  return full;
}

describe("discoverSourceMaps", () => {
  it("finds every *.map file in a flat dist directory", async () => {
    await placeFile("a.js.map", "{}");
    await placeFile("b.js.map", "{}");
    await placeFile("a.js", "noop");

    const found = await discoverSourceMaps(tmpRoot);
    expect(found.sort()).toEqual(
      [join(tmpRoot, "a.js.map"), join(tmpRoot, "b.js.map")].sort(),
    );
  });

  it("recurses into nested directories", async () => {
    await placeFile("chunks/abc.js.map", "{}");
    await placeFile("assets/img/logo.svg", "<svg/>");
    await placeFile("static/css.map", "{}");

    const found = await discoverSourceMaps(tmpRoot);
    expect(found.sort()).toEqual(
      [
        join(tmpRoot, "chunks/abc.js.map"),
        join(tmpRoot, "static/css.map"),
      ].sort(),
    );
  });

  it("ignores `node_modules` + `.git` by default", async () => {
    await placeFile("chunks/main.js.map", "{}");
    await placeFile("node_modules/foo/index.js.map", "{}");
    await placeFile(".git/objects/x.map", "{}");

    const found = await discoverSourceMaps(tmpRoot);
    expect(found).toEqual([join(tmpRoot, "chunks/main.js.map")]);
  });

  it("respects the `ignore` override", async () => {
    await placeFile("chunks/main.js.map", "{}");
    await placeFile("vendor/dep.js.map", "{}");

    const found = await discoverSourceMaps(tmpRoot, { ignore: ["vendor"] });
    expect(found).toEqual([join(tmpRoot, "chunks/main.js.map")]);
  });

  it("respects the `extensions` override", async () => {
    await placeFile("a.map.json", "{}");
    await placeFile("b.js.map", "{}");

    const found = await discoverSourceMaps(tmpRoot, { extensions: [".json"] });
    expect(found).toEqual([join(tmpRoot, "a.map.json")]);
  });

  it("returns an empty list when the directory has no matching files", async () => {
    await placeFile("a.js", "");
    await placeFile("b.css", "");

    const found = await discoverSourceMaps(tmpRoot);
    expect(found).toEqual([]);
  });

  it("returns an empty list for a non-existent directory", async () => {
    const found = await discoverSourceMaps(join(tmpRoot, "does-not-exist"));
    expect(found).toEqual([]);
  });

  it("caps recursion at the configured maxDepth", async () => {
    // Build a 5-level tree; cap at depth 2 should drop the deeper
    // matches.
    await placeFile("a.js.map", "{}");
    await placeFile("lvl1/b.js.map", "{}");
    await placeFile("lvl1/lvl2/c.js.map", "{}");
    await placeFile("lvl1/lvl2/lvl3/d.js.map", "{}");

    const found = await discoverSourceMaps(tmpRoot, { maxDepth: 2 });
    expect(found.sort()).toEqual(
      [
        join(tmpRoot, "a.js.map"),
        join(tmpRoot, "lvl1/b.js.map"),
        join(tmpRoot, "lvl1/lvl2/c.js.map"),
      ].sort(),
    );
  });
});

describe("relativeFilenameForUpload", () => {
  it("strips the rootDir prefix and normalises to forward slashes", () => {
    expect(
      relativeFilenameForUpload("/proj/dist/chunks/abc.js.map", "/proj/dist"),
    ).toBe("chunks/abc.js.map");
  });

  it("handles a trailing slash on rootDir", () => {
    expect(
      relativeFilenameForUpload("/proj/dist/abc.js.map", "/proj/dist/"),
    ).toBe("abc.js.map");
  });

  it("strips leading separator from paths that do not start with rootDir (defensive)", () => {
    // The helper unconditionally strips one leading `/` so the
    // wire-format value is consistent (relative from project root)
    // regardless of whether the path matched rootDir or not.
    expect(relativeFilenameForUpload("/elsewhere/abc.map", "/proj/dist")).toBe(
      "elsewhere/abc.map",
    );
  });
});
