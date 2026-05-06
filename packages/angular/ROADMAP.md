# @browsonic/angular — Roadmap

## Later (parking lot)

- SSR / Angular Universal capture path. Currently out of scope
  (server runtime is in the project's intentional non-goals).

## Out of scope

- **Server-side rendering capture.** Angular Universal runs in
  Node; the SDK is browser-only.
- **Angular pre-17 (NgModule-only).** Standalone is the primary
  target. NgModule consumers can still wire the providers in
  `AppModule` providers array — same shape works.
