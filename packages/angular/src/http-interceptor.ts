// SPDX-License-Identifier: Apache-2.0

/**
 * HttpClient companion. Angular's HTTP layer ships a chainable
 * `HttpInterceptor` interface — the framework wires every interceptor
 * registered against the `HTTP_INTERCEPTORS` token into the request
 * pipeline. This module ships the SDK side of the interceptor as a
 * reporter factory, *not* a concrete interceptor class:
 *
 *   `createBrowsonicHttpReporter(options?) → (req, err) => void`
 *
 * Consumers write the 5-line interceptor themselves so they own the
 * `rxjs` / `@angular/common/http` runtime imports — that keeps this
 * adapter peer-only on `@angular/*` and avoids forcing rxjs into a
 * graph that doesn't already have it.
 *
 * ```ts
 * // app/browsonic-http.interceptor.ts
 * import { Injectable } from '@angular/core';
 * import {
 *   HttpInterceptor, HttpHandler, HttpRequest, HttpEvent,
 * } from '@angular/common/http';
 * import { Observable, throwError } from 'rxjs';
 * import { catchError } from 'rxjs/operators';
 * import { createBrowsonicHttpReporter } from '@browsonic/angular';
 *
 * @Injectable()
 * export class BrowsonicHttpInterceptor implements HttpInterceptor {
 *   private readonly report = createBrowsonicHttpReporter();
 *   intercept(req: HttpRequest<unknown>, next: HttpHandler):
 *     Observable<HttpEvent<unknown>> {
 *     return next.handle(req).pipe(catchError(err => {
 *       this.report(req, err);
 *       return throwError(() => err);
 *     }));
 *   }
 * }
 *
 * // app.config.ts (standalone) or AppModule providers:
 * { provide: HTTP_INTERCEPTORS, useClass: BrowsonicHttpInterceptor, multi: true }
 * ```
 *
 * Why a reporter factory instead of a concrete class:
 * - Adapter stays free of `@angular/common/http` and `rxjs` runtime
 *   deps. Same contract the rest of the package follows
 *   (router instrumentation, error-handler).
 * - Consumers can wire the same reporter into a non-interceptor
 *   surface — direct `fetch()` calls, GraphQL clients, custom
 *   transports — without re-implementing the matching / status
 *   logic.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

/**
 * Subset of Angular's `HttpRequest` we read. The actual HttpRequest
 * has dozens of fields (headers, params, body, withCredentials, etc.);
 * none of those carry signal beyond what URL + method already do.
 */
export interface HttpRequestLike {
  url: string;
  method?: string;
  /** Optional `urlWithParams` — Angular populates this with the
   *  serialised query string. Falls back to `url` when absent. */
  urlWithParams?: string;
}

/**
 * Subset of Angular's `HttpErrorResponse` we read. The class is part
 * of `@angular/common/http` (peer-only here), so we structurally
 * duck-type the fields the dashboard needs.
 */
export interface HttpErrorResponseLike {
  status?: number;
  statusText?: string;
  url?: string | null;
  message?: string;
  /** Server-side error payload (parsed JSON in most setups). */
  error?: unknown;
  /** `false` for any HttpErrorResponse — kept for type narrowing. */
  ok?: false;
  /** `'HttpErrorResponse'` for the canonical class. Used as a
   *  fallback discriminator when the consumer hands us a
   *  re-thrown POJO. */
  name?: string;
}

export interface CreateBrowsonicHttpReporterOptions {
  /** SDK instance. Falls back to `window.Browsonic.getBrowsonic()`. */
  sdk?: Browsonic;
  /**
   * URLs to skip — match against the request URL exactly (string)
   * or via `regex.test(url)` (RegExp). The Browsonic ingest endpoint
   * itself should generally be on this list to avoid an infinite
   * report-on-failed-report loop.
   */
  ignoreUrls?: (string | RegExp)[];
  /**
   * HTTP status codes to skip — common values are `[401, 404]` for
   * apps that surface those at the UI layer and don't want them in
   * the dashboard.
   */
  ignoreStatuses?: number[];
  /**
   * Tag namespace prefix. Defaults to `'angular.http'`. Override
   * when a project hosts multiple Angular apps and wants distinct
   * dashboard buckets (e.g. `'admin.http'` / `'public.http'`).
   */
  tagNamespace?: string;
  /**
   * Maximum response-body length (chars) to attach as
   * `httpResponseBody` metadata. Defaults to 1024. Set to `0` to
   * skip body capture entirely (e.g. APIs that echo PII in error
   * payloads).
   */
  maxBodyLength?: number;
}

export type BrowsonicHttpReporter = (request: HttpRequestLike, error: unknown) => void;

/**
 * Build a reporter callback that captures HttpClient failures to the
 * Browsonic SDK. The returned function takes the request + the
 * error caught by `catchError(...)` and:
 *
 *   1. Filters by `ignoreUrls` / `ignoreStatuses` (no-ops if matched).
 *   2. Tags the active scope with `<ns>.method` and `<ns>.status`.
 *   3. Attaches `httpUrl` + (truncated) `httpResponseBody` metadata.
 *   4. Coerces the error to an `Error` and forwards to `captureError`.
 *
 * Returns `void` — no rethrow. The interceptor's own `catchError`
 * branch is responsible for rethrowing so HttpClient sees the
 * failure unchanged. Decoupling rethrow from capture lets consumers
 * wire the reporter into surfaces that don't preserve errors (e.g.
 * fire-and-forget logging).
 */
export function createBrowsonicHttpReporter(
  options: CreateBrowsonicHttpReporterOptions = {},
): BrowsonicHttpReporter {
  const ignoreUrls = options.ignoreUrls ?? [];
  const ignoreStatuses = options.ignoreStatuses ?? [];
  const tagNamespace = options.tagNamespace ?? 'angular.http';
  const maxBodyLength = options.maxBodyLength ?? 1024;

  return (request, error) => {
    if (matchesAny(request.url, ignoreUrls)) return;

    const httpError = asHttpErrorResponse(error);
    const status = httpError?.status;
    if (typeof status === 'number' && ignoreStatuses.includes(status)) return;

    const sdk = resolveSdk(options.sdk);
    if (!sdk) return;

    const errorObj = toError(error, request, status);

    try {
      if (request.method) {
        sdk.setTag(`${tagNamespace}.method`, request.method.toUpperCase());
      }
      if (typeof status === 'number') {
        sdk.setTag(`${tagNamespace}.status`, String(status));
      }
      const reportUrl = request.urlWithParams ?? request.url;
      if (reportUrl) {
        sdk.addMetadata('httpUrl', truncate(reportUrl, 256));
      }
      if (maxBodyLength > 0 && httpError?.error !== undefined) {
        sdk.addMetadata(
          'httpResponseBody',
          truncate(safeStringify(httpError.error), maxBodyLength),
        );
      }
      sdk.captureError(errorObj);
    } catch {
      // Defensive isolation — a thrown SDK call from the reporter
      // must never propagate into the interceptor's own
      // `catchError` re-throw path.
    }
  };
}

function matchesAny(url: string, patterns: (string | RegExp)[]): boolean {
  for (const pattern of patterns) {
    if (typeof pattern === 'string') {
      if (pattern === url) return true;
    } else if (pattern.test(url)) {
      return true;
    }
  }
  return false;
}

function asHttpErrorResponse(error: unknown): HttpErrorResponseLike | null {
  if (error === null || typeof error !== 'object') return null;
  const obj = error as HttpErrorResponseLike;
  // Angular's HttpErrorResponse always carries `status` (number) and
  // `ok: false`. We accept either as a structural discriminator so
  // re-thrown POJOs from the consumer's catchError still match.
  if (typeof obj.status === 'number') return obj;
  if (obj.ok === false) return obj;
  if (obj.name === 'HttpErrorResponse') return obj;
  return null;
}

function toError(error: unknown, request: HttpRequestLike, status: number | undefined): Error {
  if (error instanceof Error) return error;
  const httpError = asHttpErrorResponse(error);
  const method = request.method ? request.method.toUpperCase() : 'HTTP';
  const url = request.urlWithParams ?? request.url;
  const statusPart = status !== undefined ? ` ${status}` : '';
  const reason = httpError?.statusText ?? httpError?.message ?? '';
  const reasonPart = reason ? ` ${reason}` : '';
  return new Error(`${method} ${url}${statusPart}${reasonPart}`.trim());
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(value, (_key, v: unknown) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]';
        seen.add(v);
      }
      if (typeof v === 'function') return '[function]';
      if (typeof v === 'bigint') return v.toString();
      return v;
    });
    return json ?? String(value);
  } catch {
    return '[unserializable]';
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
