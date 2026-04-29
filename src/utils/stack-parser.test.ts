// SPDX-License-Identifier: Apache-2.0

/**
 * Stack-parser regression suite.
 *
 * Each engine block uses real-world stack dumps captured from the
 * matching browser. The fixtures live inline so this file is the
 * single source of truth — diffs against new browser versions stay
 * obvious. When a new engine version breaks parsing, add a fixture,
 * fix the regex, leave the old fixture in place to prevent
 * regressions.
 */
import { describe, it, expect } from 'vitest';
import {
  UNKNOWN_FUNCTION,
  chromiumStackParser,
  geckoStackParser,
  parseStackString,
  type StackFrame,
} from './stack-parser';

describe('chromiumStackParser', () => {
  it('parses a function frame with file:line:col', () => {
    const frame = chromiumStackParser('    at fn (https://example.com/app.js:10:5)');
    expect(frame).toEqual<StackFrame>({
      filename: 'https://example.com/app.js',
      function: 'fn',
      lineno: 10,
      colno: 5,
      inApp: true,
    });
  });

  it('parses an anonymous frame', () => {
    const frame = chromiumStackParser('    at <anonymous>:1:1');
    expect(frame).toEqual<StackFrame>({
      filename: '<anonymous>',
      function: UNKNOWN_FUNCTION,
      lineno: 1,
      colno: 1,
      inApp: true,
    });
  });

  it('parses a frame without function name', () => {
    const frame = chromiumStackParser('    at https://example.com/app.js:42:7');
    expect(frame).toEqual<StackFrame>({
      filename: 'https://example.com/app.js',
      function: UNKNOWN_FUNCTION,
      lineno: 42,
      colno: 7,
      inApp: true,
    });
  });

  it('collapses Object.<anonymous> to UNKNOWN_FUNCTION', () => {
    const frame = chromiumStackParser('    at Object.<anonymous> (file:///app.js:10:5)');
    expect(frame?.function).toBe(UNKNOWN_FUNCTION);
    expect(frame?.filename).toBe('file:///app.js');
  });

  it('strips the `async` keyword from async function frames', () => {
    const frame = chromiumStackParser('    at async fetchUser (https://example.com/api.js:23:11)');
    expect(frame).toEqual<StackFrame>({
      filename: 'https://example.com/api.js',
      function: 'fetchUser',
      lineno: 23,
      colno: 11,
      inApp: true,
    });
  });

  it('flags chrome-extension URLs as not in_app', () => {
    const frame = chromiumStackParser('    at handler (chrome-extension://abc/content.js:1:1)');
    expect(frame?.inApp).toBe(false);
  });

  it('flags [native code] frames as not in_app', () => {
    const frame = chromiumStackParser('    at Array.forEach ([native code])');
    expect(frame?.inApp).toBe(false);
  });

  it('returns null for a Gecko-shaped line', () => {
    expect(chromiumStackParser('foo@https://example.com/app.js:10:5')).toBeNull();
  });

  it('returns null for a header line', () => {
    expect(chromiumStackParser('TypeError: something exploded')).toBeNull();
  });

  it('handles localhost URLs with port numbers', () => {
    const frame = chromiumStackParser('    at render (http://localhost:5173/src/App.tsx:42:13)');
    expect(frame).toEqual<StackFrame>({
      filename: 'http://localhost:5173/src/App.tsx',
      function: 'render',
      lineno: 42,
      colno: 13,
      inApp: true,
    });
  });

  it('flags eval frames with the function name "eval"', () => {
    const frame = chromiumStackParser(
      '    at eval (eval at <anonymous> (https://example.com/app.js:10:5))'
    );
    expect(frame?.function).toBe('eval');
  });
});

describe('geckoStackParser', () => {
  it('parses a function frame', () => {
    const frame = geckoStackParser('fn@https://example.com/app.js:10:5');
    expect(frame).toEqual<StackFrame>({
      filename: 'https://example.com/app.js',
      function: 'fn',
      lineno: 10,
      colno: 5,
      inApp: true,
    });
  });

  it('parses an anonymous frame', () => {
    const frame = geckoStackParser('@https://example.com/app.js:10:5');
    expect(frame).toEqual<StackFrame>({
      filename: 'https://example.com/app.js',
      function: UNKNOWN_FUNCTION,
      lineno: 10,
      colno: 5,
      inApp: true,
    });
  });

  it('parses a Module/fn shape', () => {
    const frame = geckoStackParser('Module/fn@app.js:5:1');
    expect(frame?.function).toBe('Module/fn');
    expect(frame?.filename).toBe('app.js');
    expect(frame?.lineno).toBe(5);
  });

  it('flags moz-extension URLs as not in_app', () => {
    const frame = geckoStackParser('handler@moz-extension://abc/content.js:1:1');
    expect(frame?.inApp).toBe(false);
  });

  it('flags safari-web-extension URLs as not in_app', () => {
    const frame = geckoStackParser('fn@safari-web-extension://abc/script.js:5:5');
    expect(frame?.inApp).toBe(false);
  });

  it('returns null for a chromium-shaped line', () => {
    expect(geckoStackParser('    at fn (file.js:1:1)')).toBeNull();
  });

  it('returns null for a header-only line without @', () => {
    expect(geckoStackParser('TypeError: boom')).toBeNull();
  });

  it('returns null for a bare @ with no filename', () => {
    expect(geckoStackParser('fn@')).toBeNull();
  });
});

describe('parseStackString', () => {
  it('returns [] for non-string input', () => {
    expect(parseStackString(undefined)).toEqual([]);
    expect(parseStackString(null)).toEqual([]);
    expect(parseStackString(42)).toEqual([]);
    expect(parseStackString({})).toEqual([]);
    expect(parseStackString('')).toEqual([]);
  });

  it('parses a real Chromium stack dump (Chrome 134, macOS)', () => {
    const stack = `TypeError: Cannot read properties of undefined (reading 'name')
    at Profile.render (https://app.example.com/static/js/main.0a4b.js:1234:56)
    at processChild (https://app.example.com/static/js/vendors.7c2d.js:8442:13)
    at HTMLDocument.<anonymous> (https://app.example.com/static/js/main.0a4b.js:5:1)`;
    const frames = parseStackString(stack);
    expect(frames).toHaveLength(3);
    expect(frames[0]?.function).toBe('Profile.render');
    expect(frames[0]?.filename).toBe('https://app.example.com/static/js/main.0a4b.js');
    expect(frames[0]?.lineno).toBe(1234);
    expect(frames[0]?.colno).toBe(56);
    // `HTMLDocument.<anonymous>` is preserved — only bare `<anonymous>`
    // and `Object.<anonymous>` collapse to UNKNOWN_FUNCTION. Prefixed
    // shapes carry context (here: an event handler attached to document).
    expect(frames[2]?.function).toBe('HTMLDocument.<anonymous>');
  });

  it('parses a real Firefox stack dump (Firefox 128)', () => {
    const stack = `loadUser@https://app.example.com/static/js/main.0a4b.js:1234:56
processChild@https://app.example.com/static/js/vendors.7c2d.js:8442:13
@https://app.example.com/static/js/main.0a4b.js:1:1`;
    const frames = parseStackString(stack);
    expect(frames).toHaveLength(3);
    expect(frames[0]?.function).toBe('loadUser');
    expect(frames[0]?.lineno).toBe(1234);
    expect(frames[2]?.function).toBe(UNKNOWN_FUNCTION);
    expect(frames[2]?.lineno).toBe(1);
  });

  it('parses a real Safari stack dump (Safari 17)', () => {
    // Safari (WebKit) emits the same fn@file:line:col shape as Gecko.
    const stack = `fetchUser@https://app.example.com/static/js/main.0a4b.js:1234:56
asyncFunctionResume@[native code]
@https://app.example.com/static/js/main.0a4b.js:5:1`;
    const frames = parseStackString(stack);
    expect(frames).toHaveLength(3);
    expect(frames[0]?.function).toBe('fetchUser');
    expect(frames[1]?.filename).toBe('[native code]');
    expect(frames[1]?.inApp).toBe(false);
    expect(frames[2]?.function).toBe(UNKNOWN_FUNCTION);
  });

  it('parses a real Edge stack dump (Edge 132, Chromium-based)', () => {
    // Modern Edge is Chromium under the hood, so its stack matches
    // the Chromium parser.
    const stack = `Error: validation failed
    at validateForm (https://app.example.com/static/js/main.0a4b.js:1234:56)
    at HTMLFormElement.handleSubmit (https://app.example.com/static/js/main.0a4b.js:1500:7)`;
    const frames = parseStackString(stack);
    expect(frames).toHaveLength(2);
    expect(frames[0]?.function).toBe('validateForm');
    expect(frames[1]?.function).toBe('HTMLFormElement.handleSubmit');
  });

  it('drops the Error: header line silently', () => {
    const stack = `Error: nope
    at fn (https://example.com/app.js:1:1)`;
    const frames = parseStackString(stack);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.function).toBe('fn');
  });

  it('skips blank lines', () => {
    const stack = `    at fn (https://example.com/app.js:1:1)

    at fn2 (https://example.com/app.js:2:1)`;
    const frames = parseStackString(stack);
    expect(frames).toHaveLength(2);
  });

  it('parses a mixed Chromium + Gecko stack (does not happen in real life but the parser is order-tolerant)', () => {
    const stack = `    at chromiumFn (file.js:1:1)
geckoFn@file.js:2:1`;
    const frames = parseStackString(stack);
    expect(frames).toHaveLength(2);
    expect(frames[0]?.function).toBe('chromiumFn');
    expect(frames[1]?.function).toBe('geckoFn');
  });

  it('respects the maxFrames cap', () => {
    const lines = Array.from(
      { length: 100 },
      (_, i) => `    at fn${i} (https://example.com/app.js:${i}:1)`
    ).join('\n');
    const frames = parseStackString(lines, undefined, 25);
    expect(frames).toHaveLength(25);
  });

  it('uses DEFAULT_MAX_FRAMES (50) when not overridden', () => {
    const lines = Array.from(
      { length: 100 },
      (_, i) => `    at fn${i} (https://example.com/app.js:${i}:1)`
    ).join('\n');
    const frames = parseStackString(lines);
    expect(frames).toHaveLength(50);
  });

  it('survives a parser that throws (defensive isolation)', () => {
    const buggy = (): StackFrame | null => {
      throw new Error('parser bug');
    };
    const stack = `    at fn (https://example.com/app.js:1:1)`;
    const frames = parseStackString(stack, [buggy, chromiumStackParser]);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.function).toBe('fn');
  });

  it('drops lines no parser recognises', () => {
    const stack = `garbled junk
    at fn (https://example.com/app.js:1:1)
more junk
fn2@file.js:2:1
> nonsense`;
    const frames = parseStackString(stack);
    expect(frames).toHaveLength(2);
    expect(frames[0]?.function).toBe('fn');
    expect(frames[1]?.function).toBe('fn2');
  });
});
