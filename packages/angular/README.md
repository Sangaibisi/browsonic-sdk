# @browsonic/angular

Angular adapter for [`@browsonic/sdk`](https://www.npmjs.com/package/@browsonic/sdk) — `ErrorHandler` drop-in, `BrowsonicService` injectable, standalone `provideBrowsonic()` factory, Router instrumentation, HttpClient companion.

> **Status:** 0.3 surface — Angular 17+ standalone style. Module-NgModule apps work via the same providers (see [Quickstart — NgModule](#quickstart--ngmodule-angular-pre-standalone)). Pure TypeScript: no Angular / RxJS runtime dependency in this package's bundle (`@angular/core`, `@angular/router`, `@angular/common/http`, and `rxjs` all stay peer-only type imports).

## Install

```bash
npm install @browsonic/sdk @browsonic/angular
```

`@browsonic/sdk` and `@angular/core` (≥17) are peer dependencies.

## Quickstart — Angular 17+ standalone

```ts
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { ErrorHandler } from '@angular/core';
import { getBrowsonic } from '@browsonic/sdk';
import { provideBrowsonic, BrowsonicErrorHandler } from '@browsonic/angular';
import { AppComponent } from './app/app.component';

const sdk = getBrowsonic();
sdk.init({ apiEndpoint: 'https://your-ingest-endpoint.test/v1/events' });

bootstrapApplication(AppComponent, {
  providers: [
    ...provideBrowsonic({ sdk }),
    { provide: ErrorHandler, useExisting: BrowsonicErrorHandler },
  ],
});
```

## Inject the service anywhere

```ts
import { Component, inject } from '@angular/core';
import { BrowsonicService } from '@browsonic/angular';

@Component({ selector: 'app-buy', template: '<button (click)="buy()">Buy</button>' })
export class BuyComponent {
  private readonly browsonic = inject(BrowsonicService);

  buy(): void {
    try {
      // …purchase logic
    } catch (err) {
      this.browsonic.captureError(err as Error);
    }
  }
}
```

## Quickstart — NgModule (Angular pre-standalone)

`provideBrowsonic()` is a standalone provider factory, but the values it returns are plain `Provider[]` — they work in `AppModule.providers` unchanged. Apps still on `@NgModule({ ... })` bootstrap the same way:

```ts
// src/app/app.module.ts
import { NgModule, ErrorHandler } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { getBrowsonic } from '@browsonic/sdk';
import { provideBrowsonic, BrowsonicErrorHandler } from '@browsonic/angular';
import { AppComponent } from './app.component';

const sdk = getBrowsonic();
sdk.init({ apiEndpoint: 'https://your-ingest-endpoint.test/v1/events' });

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule],
  providers: [
    ...provideBrowsonic({ sdk }),
    { provide: ErrorHandler, useExisting: BrowsonicErrorHandler },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

Same provider tokens, same `BrowsonicService` injection sites. The only difference is where the providers array lives — `bootstrapApplication` for standalone, `AppModule.providers` for NgModule.

## Router instrumentation

`installRouterInstrumentation(router, options?)` subscribes to `Router.events`, filters for `NavigationEnd` (via the `urlAfterRedirects` structural discriminator), and emits a `category: 'navigation'` breadcrumb on every successful route change. Returns an `unsubscribe()` callable for HMR-friendly teardown.

```ts
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { Router } from '@angular/router';
import { installRouterInstrumentation } from '@browsonic/angular';

@Component({ selector: 'app-root', template: '<router-outlet/>' })
export class AppComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private off?: () => void;

  ngOnInit(): void {
    this.off = installRouterInstrumentation(this.router);
  }

  ngOnDestroy(): void {
    this.off?.();
  }
}
```

The structural `RouterLike` shape only requires an `events` Observable, so test doubles work without `@angular/router`.

## HttpClient companion

`createBrowsonicHttpReporter(options?)` returns a `(request, error) => void` callback that captures HttpClient failures to the SDK. Wire it into your own `HttpInterceptor` so the adapter stays peer-only on `@angular/common/http` and `rxjs`:

```ts
// src/app/browsonic-http.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpHandler, HttpRequest, HttpEvent } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { createBrowsonicHttpReporter } from '@browsonic/angular';

@Injectable()
export class BrowsonicHttpInterceptor implements HttpInterceptor {
  private readonly report = createBrowsonicHttpReporter({
    // Skip Browsonic's own ingest URL so a failed report can't trigger
    // another report (would loop).
    ignoreUrls: [/\/v1\/events$/],
    // Suppress 401 / 404 — surfaced at the UI layer, not in the dashboard.
    ignoreStatuses: [401, 404],
  });

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(req).pipe(
      catchError((err: unknown) => {
        this.report(req, err);
        return throwError(() => err);
      }),
    );
  }
}
```

Register it via `HTTP_INTERCEPTORS` — standalone or NgModule, both shapes work:

```ts
// Standalone (app.config.ts)
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
providers: [
  provideHttpClient(withInterceptorsFromDi()),
  { provide: HTTP_INTERCEPTORS, useClass: BrowsonicHttpInterceptor, multi: true },
];

// NgModule (AppModule.providers)
import { HTTP_INTERCEPTORS } from '@angular/common/http';
providers: [{ provide: HTTP_INTERCEPTORS, useClass: BrowsonicHttpInterceptor, multi: true }];
```

The reporter tags the active scope with `angular.http.method` + `angular.http.status`, attaches `httpUrl` (capped at 256 chars) and a truncated `httpResponseBody` (`maxBodyLength: 0` disables body capture entirely). See [`http-interceptor.ts`](src/http-interceptor.ts) for all options.

## API

### `BrowsonicErrorHandler`

Drop-in for Angular's `ErrorHandler` provider. Implements the framework's duck-typed `handleError(error: unknown): void` shape. Calls `sdk.captureError`, then forwards to `console.error` so the Angular default dev-tools experience is preserved (`consoleFallback: false` to disable).

### `BrowsonicService`

Injectable wrapper around the SDK. Methods: `setUser`, `clearUser`, `captureError`, `captureMessage`, `addBreadcrumb`, `setTag`, `getSdk`.

### `provideBrowsonic(options?)`

Standalone-style provider factory. Returns the providers array that registers `BrowsonicErrorHandler` and `BrowsonicService` as singletons. Wire the framework's `ErrorHandler` token to `useExisting: BrowsonicErrorHandler` separately so consumers control whether the handler also relays to a custom upstream handler (we don't chain by default — Angular's `ErrorHandler` is single-binding).

### `installRouterInstrumentation(router, options?)`

Subscribes to a `RouterLike.events` Observable and emits a `category: 'navigation'` breadcrumb on every `NavigationEnd`. Returns an `unsubscribe()` callable. Structural `RouterLike` / `RouterEventLike` types — no `@angular/router` runtime import. See [Router instrumentation](#router-instrumentation).

### `createBrowsonicHttpReporter(options?)`

Returns a `(request, error) => void` callback that captures HttpClient failures. Filters by `ignoreUrls` (string or RegExp) and `ignoreStatuses`. Tags the scope with `<ns>.method` + `<ns>.status`, attaches `httpUrl` + truncated `httpResponseBody`. Designed to be wired into a consumer-owned `HttpInterceptor` so the adapter stays peer-only on `@angular/common/http` and `rxjs`. See [HttpClient companion](#httpclient-companion).

## Defensive contract

- The host app must never crash because reporting failed.
- All SDK calls are wrapped in `try { … } catch {}`.
- `BrowsonicErrorHandler.handleError` never throws — even when both the SDK and `console.error` raise, the method returns silently.
- All forwarders are no-ops when the SDK is unreachable.

## What this package does NOT do

- **`@Injectable({ providedIn: 'root' })` decorator entry-point.** Adding the decorator to `BrowsonicService` would force `@angular/core` into the runtime graph and break the type-only-import contract. Tracked for a follow-up `@browsonic/angular/decorated` entry-point that opts in to the runtime dep — for now, register `BrowsonicService` via `provideBrowsonic()` (it's a singleton in the providers array).
- **NgZone-aware error capture.** The default Angular zone catches errors; our `ErrorHandler` runs inside the zone. If your app uses `NgZone.runOutsideAngular`, errors there don't reach `ErrorHandler` — call `browsonic.captureError(err)` from your `try/catch` block manually.
- **Server-side rendering capture.** Angular SSR runs in Node; the SDK is browser-only. Wire your own server-side telemetry.

## License

Apache-2.0. See the repo root [`LICENSE`](../../LICENSE) and the package [`NOTICE`](./NOTICE).
