# `@browsonic/react` — Vite + React 19 demo

Minimal app exercising every public surface of `@browsonic/react`:

- **`<BrowsonicErrorBoundary>`** with a function fallback that renders the captured error and a reset button.
- **`useBrowsonic()`** — shows whether the SDK singleton is reachable.
- **`useUser({ ... })`** — sets a demo user context on mount.
- **`useCaptureError()`** — fired from an event-handler `try/catch`.
- **`withBrowsonic(LegacyClassPanel)`** — class-component HOC injection example.

## Run it locally

This example uses `file:../..` to consume the parent adapter package, so
no npm publish is required to try it.

```bash
# from the repo root, build the adapter so the dist/ that file: links
# resolves to is fresh
npm run build

# then in the demo:
cd examples/react-vite
npm install
npm run dev          # http://localhost:5173
```

The `apiEndpoint` in `src/main.tsx` points at a placeholder host. Either
swap it for a real Browsonic ingest endpoint to see events arrive, or
keep `debug: true` and watch the console — every captured event is
logged locally before the (failing) network POST is attempted.

## What this demo deliberately does NOT do

- No router. React Router instrumentation lands in `@browsonic/react@0.3` (see [`../../ROADMAP.md`](../../ROADMAP.md)).
- No production build / deployment guidance — Vite's defaults are sufficient.
- No styling system — inline styles only, so the focus stays on the SDK surface.

## Extending the demo

If you add a new public surface to the adapter, mirror it here. The
demo doubles as documentation: every export should appear at least
once, used the way a real app would use it. Update the bullet list
above to keep this README in sync.
