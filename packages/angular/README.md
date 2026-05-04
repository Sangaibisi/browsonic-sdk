# @browsonic/angular

Angular adapter for [`@browsonic/sdk`](https://www.npmjs.com/package/@browsonic/sdk) — `ErrorHandler` drop-in, `BrowsonicService` injectable, standalone `provideBrowsonic()` factory.

> **Status:** 0.1 surface — Angular 17+ standalone style. Module-NgModule-style apps work via the same providers. Pure TypeScript: no Angular runtime dependency in this package's bundle (`@angular/core` is a peer-only type import).

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

## API

### `BrowsonicErrorHandler`

Drop-in for Angular's `ErrorHandler` provider. Implements the framework's duck-typed `handleError(error: unknown): void` shape. Calls `sdk.captureError`, then forwards to `console.error` so the Angular default dev-tools experience is preserved (`consoleFallback: false` to disable).

### `BrowsonicService`

Injectable wrapper around the SDK. Methods: `setUser`, `clearUser`, `captureError`, `captureMessage`, `addBreadcrumb`, `setTag`, `getSdk`.

### `provideBrowsonic(options?)`

Standalone-style provider factory. Returns the providers array that registers `BrowsonicErrorHandler` and `BrowsonicService` as singletons. Wire the framework's `ErrorHandler` token to `useExisting: BrowsonicErrorHandler` separately so consumers control whether the handler also relays to a custom upstream handler (we don't chain by default — Angular's `ErrorHandler` is single-binding).

## Defensive contract

- The host app must never crash because reporting failed.
- All SDK calls are wrapped in `try { … } catch {}`.
- `BrowsonicErrorHandler.handleError` never throws — even when both the SDK and `console.error` raise, the method returns silently.
- All forwarders are no-ops when the SDK is unreachable.

## What this package does NOT do

- **Router instrumentation.** Coming in 0.2 — `withRouterInstrumentation()` will subscribe to `Router.events` and emit navigation breadcrumbs. Wire it manually for now: `inject(Router).events.subscribe(e => browsonic.addBreadcrumb(...))`.
- **NgZone-aware error capture.** The default Angular zone catches errors; our `ErrorHandler` runs inside the zone. If your app uses `NgZone.runOutsideAngular`, errors there don't reach `ErrorHandler` — call `browsonic.captureError(err)` from your `try/catch` block manually.
- **Server-side rendering capture.** Angular SSR runs in Node; the SDK is browser-only. Wire your own server-side telemetry.

## License

Apache-2.0. See the repo root [`LICENSE`](../../LICENSE) and the package [`NOTICE`](./NOTICE).
