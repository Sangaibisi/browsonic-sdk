# @browsonic/remix — Roadmap

## Later (parking lot)

- **`<RemoteCatch>` integration.** Pre-Remix-v2 `CatchBoundary` is
  going away; if community demand surfaces, ship a back-port
  helper.
- Edge runtime support — currently out of scope (multi-runtime is
  in the project's intentional non-goals).

## Out of scope

- **Server-runtime capture.** Remix actions / loaders run in Node
  / Edge; the SDK is browser-only.
- **Auto-injection of the SDK script.** Consumers add the init
  manually to `entry.client.tsx`.
