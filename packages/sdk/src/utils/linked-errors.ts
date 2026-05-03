// SPDX-License-Identifier: Apache-2.0

/**
 * Error.cause chain unwinding.
 *
 * `Error.cause` (ES2022) lets a thrown error reference the underlying
 * cause that triggered it — a common pattern when wrapping low-level
 * errors at API boundaries (e.g. wrapping a fetch error as
 * `new APIError('user load failed', { cause: networkErr })`). This
 * module unwinds that chain into a flat list so backends can display
 * the full causal trace, not just the topmost message.
 *
 * Bounded by design:
 *   - **max depth (default 5)** — long causal chains usually mean a
 *     bug in error wrapping, not genuine 50-level dependencies. The
 *     cap prevents pathological payloads from inflating event size.
 *   - **circular reference guard** — `a.cause = b; b.cause = a` is
 *     short-circuited via a WeakSet of visited errors. The top-level
 *     error is also marked visited so `a.cause = a` terminates.
 *
 * Non-Error causes (string, number, plain object) are stringified
 * into a synthetic LinkedError so
 * `throw new Error('x', { cause: 'reason string' })` still surfaces
 * the underlying reason.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { parseStackString, type StackFrame } from './stack-parser';

/**
 * One step in an unwound `Error.cause` chain.
 *
 * The top-level error itself is **not** included — callers already
 * carry that on the event. `linkedErrors[0]` is the direct cause of
 * the top-level error; `linkedErrors[1]` is the cause of that, and
 * so on, ordered from most-recent to oldest.
 */
export interface LinkedError {
  /** Constructor name (`TypeError`, `RangeError`, custom Error subclass, …). */
  type: string;
  /** Error message; empty string for non-Error causes that produced no message. */
  message: string;
  /** Raw stack string when the cause is an Error; `null` otherwise. */
  stack: string | null;
  /** Parsed stack frames; empty array when the cause has no stack to parse. */
  stackFrames: StackFrame[];
}

/**
 * Default depth cap. Five matches what most users hit in production
 * (one or two layers of API wrapping); a chain deeper than this is
 * almost certainly a wrapper bug.
 */
export const DEFAULT_LINKED_ERRORS_MAX_DEPTH = 5;

/**
 * Unwind the `Error.cause` chain rooted at `error`. Returns an empty
 * array when the input is not an Error-like object, has no `cause`,
 * or the cause is `null`/`undefined`.
 *
 * Never throws — defensive in line with the SDK's "internal failures
 * never crash the host" promise (AGENTS.md non-negotiable #1).
 */
export function unwindLinkedErrors(
  error: unknown,
  maxDepth: number = DEFAULT_LINKED_ERRORS_MAX_DEPTH
): LinkedError[] {
  const linked: LinkedError[] = [];
  if (!error || typeof error !== 'object') return linked;
  if (!('cause' in error)) return linked;

  // WeakSet guards against `a.cause = a` and longer cycles. The
  // top-level error is added before unwinding so a cycle that walks
  // back to it terminates at the right depth.
  const visited = new WeakSet<object>();
  visited.add(error);

  let current: unknown = (error as { cause?: unknown }).cause;
  let depth = 0;

  while (current !== undefined && current !== null && depth < maxDepth) {
    if (current instanceof Error) {
      if (visited.has(current)) break;
      visited.add(current);

      const stack = current.stack ?? null;
      linked.push({
        type: current.name || 'Error',
        message: current.message,
        stack,
        stackFrames: parseStackString(stack),
      });
      current = (current as { cause?: unknown }).cause;
    } else {
      // Non-Error cause: capture once and stop. Chains of non-Error
      // causes are extremely rare; the first one is the only one
      // worth keeping in the trace.
      linked.push({
        type: typeof current === 'object' ? 'Object' : typeof current,
        message: stringifyCause(current),
        stack: null,
        stackFrames: [],
      });
      break;
    }
    depth += 1;
  }

  return linked;
}

function stringifyCause(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable cause]';
  }
}
