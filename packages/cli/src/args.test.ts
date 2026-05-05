// SPDX-License-Identifier: Apache-2.0

/**
 * `parseCliArgs` regression suite. Exercises every command shape +
 * env-var fallback + validation failure mode the bin entry relies
 * on. The parser is pure — no fs / network access — so tests are
 * fast and deterministic.
 */
import { describe, it, expect } from "vitest";
import { parseCliArgs, ArgsError } from "./args";

describe("parseCliArgs", () => {
  it("returns help when called with no args", () => {
    expect(parseCliArgs([])).toEqual({ command: "help" });
  });

  it("returns help on --help / -h", () => {
    expect(parseCliArgs(["--help"])).toEqual({ command: "help" });
    expect(parseCliArgs(["-h"])).toEqual({ command: "help" });
  });

  it("returns version on --version / -v", () => {
    expect(parseCliArgs(["--version"])).toEqual({ command: "version" });
    expect(parseCliArgs(["-v"])).toEqual({ command: "version" });
  });

  it("parses help with a topic argument", () => {
    expect(parseCliArgs(["help", "upload-sourcemaps"])).toEqual({
      command: "help",
      topic: "upload-sourcemaps",
    });
  });

  it("rejects an unknown command with exit code 2", () => {
    expect(() => parseCliArgs(["mystery-command"])).toThrow(ArgsError);
    try {
      parseCliArgs(["mystery-command"]);
    } catch (err) {
      expect((err as ArgsError).exitCode).toBe(2);
      expect((err as ArgsError).message).toContain("Unknown command");
    }
  });

  describe("upload-sourcemaps", () => {
    const baseArgs = [
      "upload-sourcemaps",
      "--dist-path",
      "./dist",
      "--release",
      "v1.2.3",
      "--app-key",
      "app_xyz",
      "--token",
      "sm_abc",
      "--base-url",
      "https://x.test/v1/events",
    ];

    it("parses the canonical full-flag invocation", () => {
      const result = parseCliArgs(baseArgs);
      expect(result).toEqual({
        command: "upload-sourcemaps",
        distPath: "./dist",
        release: "v1.2.3",
        appKey: "app_xyz",
        token: "sm_abc",
        baseUrl: "https://x.test/v1/events",
        dryRun: false,
        bailOnError: false,
      });
    });

    it("falls back to env vars for credentials", () => {
      const result = parseCliArgs(
        ["upload-sourcemaps", "--dist-path", "./dist", "--release", "v1.2.3"],
        {
          BROWSONIC_APP_KEY: "env_app",
          BROWSONIC_SOURCEMAP_TOKEN: "env_token",
          BROWSONIC_API_ENDPOINT: "https://env.test/v1/events",
        },
      );
      expect(result).toMatchObject({
        appKey: "env_app",
        token: "env_token",
        baseUrl: "https://env.test/v1/events",
      });
    });

    it("flags override env vars when both are set", () => {
      const result = parseCliArgs([...baseArgs], {
        BROWSONIC_APP_KEY: "env_app",
        BROWSONIC_SOURCEMAP_TOKEN: "env_token",
        BROWSONIC_API_ENDPOINT: "https://env.test/v1/events",
      });
      expect(result).toMatchObject({
        appKey: "app_xyz",
        token: "sm_abc",
        baseUrl: "https://x.test/v1/events",
      });
    });

    it("parses --dry-run as a boolean toggle", () => {
      const result = parseCliArgs([...baseArgs, "--dry-run"]);
      expect((result as { dryRun: boolean }).dryRun).toBe(true);
    });

    it("parses --bail-on-error as a boolean toggle", () => {
      const result = parseCliArgs([...baseArgs, "--bail-on-error"]);
      expect((result as { bailOnError: boolean }).bailOnError).toBe(true);
    });

    it("passes the optional --dist field through", () => {
      const result = parseCliArgs([...baseArgs, "--dist", "esm"]);
      expect((result as { dist?: string }).dist).toBe("esm");
    });

    it("throws ArgsError when --dist-path is missing", () => {
      expect(() =>
        parseCliArgs([
          "upload-sourcemaps",
          "--release",
          "v1.2.3",
          "--app-key",
          "a",
          "--token",
          "t",
          "--base-url",
          "https://x.test",
        ]),
      ).toThrow(/--dist-path is required/);
    });

    it("throws ArgsError when --release is missing", () => {
      expect(() =>
        parseCliArgs([
          "upload-sourcemaps",
          "--dist-path",
          "./dist",
          "--app-key",
          "a",
          "--token",
          "t",
          "--base-url",
          "https://x.test",
        ]),
      ).toThrow(/--release is required/);
    });

    it("throws ArgsError when --app-key + env are both missing", () => {
      expect(() =>
        parseCliArgs([
          "upload-sourcemaps",
          "--dist-path",
          "./dist",
          "--release",
          "v1",
          "--token",
          "t",
          "--base-url",
          "https://x.test",
        ]),
      ).toThrow(/--app-key/);
    });

    it("throws ArgsError when --token + env are both missing", () => {
      expect(() =>
        parseCliArgs([
          "upload-sourcemaps",
          "--dist-path",
          "./dist",
          "--release",
          "v1",
          "--app-key",
          "a",
          "--base-url",
          "https://x.test",
        ]),
      ).toThrow(/--token/);
    });

    it("throws ArgsError when --base-url + env are both missing", () => {
      expect(() =>
        parseCliArgs([
          "upload-sourcemaps",
          "--dist-path",
          "./dist",
          "--release",
          "v1",
          "--app-key",
          "a",
          "--token",
          "t",
        ]),
      ).toThrow(/--base-url/);
    });

    it("throws on unknown flags (strict parsing)", () => {
      expect(() => parseCliArgs([...baseArgs, "--mystery-flag"])).toThrow();
    });

    it("exits 0 with usage text on `upload-sourcemaps --help`", () => {
      try {
        parseCliArgs(["upload-sourcemaps", "--help"]);
      } catch (err) {
        expect(err).toBeInstanceOf(ArgsError);
        expect((err as ArgsError).exitCode).toBe(0);
        expect((err as ArgsError).message).toContain("upload-sourcemaps");
      }
    });
  });
});
