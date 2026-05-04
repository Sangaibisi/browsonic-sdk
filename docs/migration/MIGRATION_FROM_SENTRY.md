# Migrating from `@sentry/browser` (or `@sentry/<framework>`) to Browsonic

This guide covers the API surface that has direct one-to-one mapping. Where Browsonic intentionally diverges from Sentry, the divergence is documented inline so teams can decide whether the difference matters for their use case.

> **Scope reminder.** Browsonic is a focused, privacy-first browser error tracking SDK. We deliberately do **not** ship distributed tracing, session replay, profiling, multi-runtime SDKs, AI SDK instrumentation, or feature-flag integrations — those are excellent reasons to stay on `@sentry/*`. If your team needs the everything-platform surface, this migration is not for you.

## TL;DR — the API maps almost one-to-one

| Sentry                                  | Browsonic                            | Notes                                                                             |
| --------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `Sentry.init({ dsn })`                  | `Browsonic.init({ apiEndpoint })`    | DSN URL → ingest endpoint URL. Both accept additional options.                    |
| `Sentry.captureException(error)`        | `sdk.captureError(error)`            | `error` must be an `Error` instance (or coerced to one).                          |
| `Sentry.captureMessage(msg, level)`     | `sdk.captureMessage(msg, level)`     | Identical signature. Levels: `'info' \| 'warn' \| 'error' \| 'fatal'`.            |
| `Sentry.addBreadcrumb({ category, … })` | `sdk.addBreadcrumb({ category, … })` | Identical shape. Defaults: `level: 'info'`, auto-`timestamp`.                     |
| `Sentry.setTag(key, value)`             | `sdk.setTag(key, value)`             | Same shape. Browsonic also keeps the legacy `addMetadata(k, v)` alias.            |
| `Sentry.setContext(name, ctx)`          | `sdk.setContext(name, ctx)`          | Same shape. `ctx` is shallow-copied on write.                                     |
| `Sentry.setExtra(key, value)`           | `sdk.setExtra(key, value)`           | Same shape. Stored by reference (Sentry parity).                                  |
| `Sentry.setUser(user)`                  | `sdk.setUser(user)`                  | Same shape; `user.id` is the recommended identifier.                              |
| `Sentry.configureScope(scope => …)`     | `sdk.withScope(scope => …)`          | Browsonic uses the modern `withScope` name; sync + async overloads.               |
| `Sentry.withScope(scope => …)`          | `sdk.withScope(scope => …)`          | Identical.                                                                        |
| `Sentry.getCurrentHub().getScope()`     | _(not exposed)_                      | Browsonic does not expose the hub abstraction; use `withScope` instead.           |
| `Sentry.startTransaction()`             | _(not in scope)_                     | Distributed tracing is intentionally out of scope. Stay on Sentry if you need it. |
| `Sentry.replayIntegration()`            | _(not in scope)_                     | Session replay is intentionally out of scope.                                     |
| `Sentry.startSpan()`                    | _(not in scope)_                     | Distributed tracing is intentionally out of scope.                                |

## Step-by-step migration

### 1. Init

**Sentry**

```ts
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "https://xxx@yyy.ingest.sentry.io/12345",
  environment: "production",
  release: "app@1.2.3",
  tracesSampleRate: 0.1, // distributed tracing
});
```

**Browsonic**

```ts
import { getBrowsonic } from "@browsonic/sdk";

const sdk = getBrowsonic();
sdk.init({
  apiEndpoint: "https://your-ingest-endpoint.test/v1/events",
  environment: "production",
  clientVersion: "app@1.2.3", // version-aware analytics ("Versions" panel)
  // tracesSampleRate has no equivalent — distributed tracing is out of scope
});
```

### 2. Capture an error

```diff
- Sentry.captureException(err);
+ sdk.captureError(err);
```

### 3. Capture a message

```diff
- Sentry.captureMessage('checkout step 2', 'info');
+ sdk.captureMessage('checkout step 2', 'info');
```

### 4. Tags / contexts / extras

```diff
- Sentry.setTag('plan', 'pro');
+ sdk.setTag('plan', 'pro');

- Sentry.setContext('order', { id: 1, total: 99 });
+ sdk.setContext('order', { id: 1, total: 99 });

- Sentry.setExtra('debug-snapshot', largeBlob);
+ sdk.setExtra('debug-snapshot', largeBlob);
```

### 5. User identity

```diff
- Sentry.setUser({ id: 'u1', email: 'a@b.test' });
+ sdk.setUser({ id: 'u1', email: 'a@b.test' });

- Sentry.setUser(null);
+ sdk.clearUser();
```

### 6. Breadcrumbs

```diff
- Sentry.addBreadcrumb({ category: 'navigation', message: '/checkout' });
+ sdk.addBreadcrumb({ category: 'navigation', message: '/checkout' });
```

### 7. Scoped capture

```diff
- Sentry.withScope((scope) => {
-   scope.setTag('order_id', '123');
-   Sentry.captureException(err);
- });
+ sdk.withScope((scope) => {
+   scope.setTag('order_id', '123');
+   sdk.captureError(err);
+ });
```

The async path also works:

```ts
await sdk.withScope(async (scope) => {
  scope.setUser({ id: "inner" });
  scope.setExtra("orderSnapshot", snapshot);
  await sendToBackend();
  return { ok: true };
});
```

### 8. Framework adapters

| Sentry adapter        | Browsonic adapter                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@sentry/react`       | `@browsonic/react`                                                                                                |
| `@sentry/vue`         | `@browsonic/vue`                                                                                                  |
| `@sentry/svelte`      | `@browsonic/svelte`                                                                                               |
| `@sentry/sveltekit`   | `@browsonic/svelte` (SvelteKit support is part of the same package)                                               |
| `@sentry/nextjs`      | `@browsonic/nextjs`                                                                                               |
| `@sentry/astro`       | `@browsonic/astro`                                                                                                |
| `@sentry/angular`     | `@browsonic/angular`                                                                                              |
| `@sentry/angular-ivy` | `@browsonic/angular`                                                                                              |
| `@sentry/remix`       | `@browsonic/remix`                                                                                                |
| `@sentry/gatsby`      | _(not shipped)_ — Gatsby uses React under the hood; install `@browsonic/react` and wrap your root component.      |
| `@sentry/electron`    | _(not shipped)_ — Electron renderer is browser-runtime; SDK works there. The main process is Node — out of scope. |

### 9. ErrorBoundary mapping

| Sentry                                                    | Browsonic                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| `<Sentry.ErrorBoundary fallback={…}>` (`@sentry/react`)   | `<BrowsonicErrorBoundary fallback={…}>` (`@browsonic/react`) |
| `<Sentry.ErrorBoundary>` Vue plugin                       | `<BrowsonicErrorBoundary>` (`@browsonic/vue`)                |
| `Sentry.handleErrorWithSentry()` (SvelteKit)              | `handleErrorWithBrowsonic()` (`@browsonic/svelte`)           |
| `Sentry.captureRouterTransitionStart()` (Next.js / Remix) | _(not equivalent — tracing-only feature)_                    |

### 10. Plugin / config differences worth knowing

| Sentry                             | Browsonic                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `beforeSend(event, hint)`          | `onError(event)` config field                                                                                                              |
| `denyUrls: [/regex/]`              | `ignoreUrls: ['substring']` (substring match, not regex)                                                                                   |
| `ignoreErrors: ['Script error.']`  | `ignoreScriptErrors: true` (default true) + `ignoreMessages: ['…']`                                                                        |
| `tracesSampleRate`                 | _(not applicable)_                                                                                                                         |
| `replaysSessionSampleRate`         | _(not applicable)_                                                                                                                         |
| `integrations: [breadcrumbs(), …]` | Browsonic ships breadcrumbs unconditionally; opt-out per collector via config flags (`captureXHR: false`, `trackNavigation: false`, etc.). |

## Things Browsonic deliberately does NOT do

If you depend on any of these, **stay on Sentry** — they're excellent at all of them and we are not racing to match the surface:

- Distributed tracing / spans / W3C Trace Context propagation
- Session replay (rrweb-style DOM recording)
- CPU profiling
- Server runtimes: Node, Deno, Bun, Cloudflare Workers, Vercel Edge, AWS Lambda
- AI SDK instrumentation (Anthropic, OpenAI, Google GenAI, LangChain)
- Feature-flag integrations (LaunchDarkly, OpenFeature, Unleash, GrowthBook, Statsig)
- Vendor-specific client wrappers (GraphQL, Supabase, tRPC)

## Optional codemod (`jscodeshift`)

A `jscodeshift` codemod that automates the steps above is **planned but not yet shipped** in 0.1. The mapping table is the source of truth in the meantime — most teams report the manual migration takes under an hour for a single-file SDK init plus a project-wide find/replace on the call sites listed in §1–§7.
