// SPDX-License-Identifier: Apache-2.0

/**
 * Multi-engine browser stack-frame parser.
 *
 * Browser engines emit `Error.stack` in subtly different shapes. This
 * module recognises:
 *
 *   - **Chromium** (Chrome, Edge ≥79, Brave, modern Opera)
 *     `    at functionName (filename:line:col)`
 *     `    at filename:line:col`
 *
 *   - **Gecko** (Firefox)
 *     `functionName@filename:line:col`
 *     `@filename:line:col`
 *
 *   - **WebKit** (Safari, including iOS WebView)
 *     Mostly Gecko-compatible at frame level. The shared parser
 *     handles the common shapes; Safari extension frames are
 *     normalised below.
 *
 * The runtime tries each parser in order; the first that returns a
 * frame for a line wins. Lines no parser claims are silently dropped —
 * preserving the parsed prefix is more useful than panicking on the
 * occasional unrecognised shape.
 *
 * Lineage: regex shapes are inspired by TraceKit
 * (https://github.com/csnover/TraceKit, MIT) via sentry-javascript
 * (MIT). Rewritten for Browsonic to drop the WinJS / Opera 10
 * branches that no longer matter on evergreen browsers, and to fit
 * our own StackFrame shape. See NOTICE for upstream attribution.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/** Marker used when the engine did not name the function. */
export const UNKNOWN_FUNCTION = '?';

/**
 * Maximum number of frames retained per parsed stack. Long stacks
 * inflate event payloads with diminishing diagnostic value; by the
 * 50th frame the relevant context is almost always already
 * captured. Tunable via `parseStackString(stack, parsers, maxFrames)`.
 */
export const DEFAULT_MAX_FRAMES = 50;

/**
 * A single stack frame, normalised across engines.
 */
export interface StackFrame {
  /** Source URL the frame was emitted from. `<anonymous>` for VM frames without a script. */
  filename: string;
  /** Function name. `UNKNOWN_FUNCTION` when anonymous or the engine omitted it. */
  function: string;
  /** Line number (1-indexed). Absent when the engine did not provide it. */
  lineno?: number;
  /** Column number (1-indexed). Absent when the engine did not provide it. */
  colno?: number;
  /**
   * True when the frame originates inside the host application bundle
   * (best-effort — the browser does not expose enough metadata for
   * full certainty). Frames from browser-extension URLs and `[native
   * code]` markers are flagged false. Backends may override with
   * their own rules; this flag is advisory.
   */
  inApp: boolean;
}

/** Per-line parser. Returns a frame on match, `null` otherwise. */
export type StackLineParser = (line: string) => StackFrame | null;

// ============================================================================
// Chromium / V8 parser
// ----------------------------------------------------------------------------
// Lines look like one of:
//
//   "    at fnName (https://example.com/app.js:10:5)"
//   "    at https://example.com/app.js:10:5"
//   "    at <anonymous>:1:1"
//   "    at Object.<anonymous> (file:///app.js:10:5)"
//   "    at async fn (file.js:10:5)"
//
// We split into a small set of single-purpose regexes instead of one
// mega-regex — easier to debug when a frame in production fails to
// parse, and the cost of multiple `.exec()` calls is dwarfed by the
// rest of the SDK pipeline.
// ============================================================================

const CHROMIUM_FN = /^\s*at (?:async )?(.+?) \((.+?)(?::(\d+))?(?::(\d+))?\)\s*$/;
const CHROMIUM_NO_FN = /^\s*at (?:async )?(.+?)(?::(\d+))?(?::(\d+))?\s*$/;
const CHROMIUM_EVAL_HINT = /\beval\b/;

/**
 * Chromium stack-line parser. Recognises Chrome, Edge, Brave, and
 * modern Opera frame shapes.
 */
export const chromiumStackParser: StackLineParser = (line) => {
  const fnMatch = CHROMIUM_FN.exec(line);
  if (fnMatch) {
    const rawFn = fnMatch[1] ?? UNKNOWN_FUNCTION;
    return makeFrame(
      fnMatch[2] ?? '',
      // Eval frames in Chromium look like "at eval (eval at <anonymous> (...
      // file:line:col), <anonymous>:line:col)". The simple "eval" function
      // name is preserved; line/col come from the inner location.
      CHROMIUM_EVAL_HINT.test(rawFn) ? 'eval' : cleanFunctionName(rawFn),
      toNumber(fnMatch[3]),
      toNumber(fnMatch[4])
    );
  }

  const noFnMatch = CHROMIUM_NO_FN.exec(line);
  if (noFnMatch) {
    return makeFrame(
      noFnMatch[1] ?? '',
      UNKNOWN_FUNCTION,
      toNumber(noFnMatch[2]),
      toNumber(noFnMatch[3])
    );
  }

  return null;
};

// ============================================================================
// Gecko parser (Firefox + most modern WebKit cases)
// ----------------------------------------------------------------------------
// Lines look like one of:
//
//   "fnName@https://example.com/app.js:10:5"
//   "@https://example.com/app.js:10:5"
//   "Module/fnName@app.js:10:5"
//
// ============================================================================

const GECKO = /^\s*(.*?)@(.*?)(?::(\d+))?(?::(\d+))?\s*$/;

/**
 * Gecko stack-line parser. Also handles the bulk of WebKit (Safari)
 * frames since the two engines emit the same `fn@file:line:col` shape.
 */
export const geckoStackParser: StackLineParser = (line) => {
  if (!line.includes('@')) return null;

  const m = GECKO.exec(line);
  if (!m) return null;

  const func = m[1] ?? '';
  const filename = m[2] ?? '';
  // A bare `@` with no filename is not a frame — likely a header line.
  if (!filename) return null;

  return makeFrame(
    filename,
    cleanFunctionName(func || UNKNOWN_FUNCTION),
    toNumber(m[3]),
    toNumber(m[4])
  );
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Default per-line parser chain. Order matters: Chromium-style frames
 * are checked first because they are the most common and the regex
 * is anchored on `at ` which makes false positives rare; Gecko-style
 * only matches if Chromium returned null and the line contains `@`.
 */
export const defaultStackParsers: StackLineParser[] = [chromiumStackParser, geckoStackParser];

/**
 * Parse a raw `Error.stack` string into normalised StackFrames.
 *
 * - Each line is tried against parsers in order; the first match wins.
 * - Lines no parser recognises (the `Error: msg` header, blank lines,
 *   internal markers) are silently dropped.
 * - Parsing stops after `maxFrames` to bound payload size.
 * - Never throws: bad input returns `[]`.
 */
export function parseStackString(
  stack: unknown,
  parsers: StackLineParser[] = defaultStackParsers,
  maxFrames: number = DEFAULT_MAX_FRAMES
): StackFrame[] {
  if (typeof stack !== 'string' || !stack) return [];
  const lines = stack.split('\n');
  const frames: StackFrame[] = [];
  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    for (const parser of parsers) {
      try {
        const frame = parser(rawLine);
        if (frame) {
          frames.push(frame);
          break;
        }
      } catch {
        // Defensive: a faulty parser must not break the whole pipeline.
        // The SDK's "internal failures never crash the host" promise
        // (AGENTS.md non-negotiable #1) covers this surface too.
      }
    }
    if (frames.length >= maxFrames) break;
  }
  return frames;
}

// ============================================================================
// Internals
// ============================================================================

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const NON_APP_PATTERNS: RegExp[] = [
  /^chrome-extension:/,
  /^moz-extension:/,
  /^safari-(?:web-)?extension:/,
  /^webkit-masked-url:/,
  /\[native code\]/,
];

function makeFrame(
  filename: string,
  func: string,
  lineno: number | undefined,
  colno: number | undefined
): StackFrame {
  const cleanedFilename = filename === '<anonymous>' || filename === '' ? '<anonymous>' : filename;
  const inApp = !NON_APP_PATTERNS.some((re) => re.test(cleanedFilename));
  const frame: StackFrame = {
    filename: cleanedFilename,
    function: func,
    inApp,
  };
  if (lineno !== undefined) frame.lineno = lineno;
  if (colno !== undefined) frame.colno = colno;
  return frame;
}

/**
 * Collapse function-name shapes that callers consistently treat as
 * "anonymous" anyway. Sentry's TraceKit fork normalises more
 * aggressively; we only collapse the cases that have actually
 * confused groupers in production.
 */
function cleanFunctionName(name: string): string {
  if (!name) return UNKNOWN_FUNCTION;
  if (name === '<anonymous>' || name === 'Object.<anonymous>') {
    return UNKNOWN_FUNCTION;
  }
  return name;
}
