# @browsonic/vue — Roadmap

## Later (parking lot)

- A built-in default fallback component (CSS-scoped) for plug-and-play
  error screens. Likely needs an SFC; we'd add `@vue/compiler-sfc` to
  the build chain at that point.

## Out of scope

- **Server-side rendering capture.** Vue SSR + Nuxt run on Node; this
  adapter is browser-only. Nuxt/SSR will be a separate adapter or
  guidance, not a feature here.
- **Vue 2 / Options-API-only consumers.** 3.3+ Composition API is the
  contract. Vue 2 has reached end-of-life; we are not back-porting.
