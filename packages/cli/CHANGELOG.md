## [1.1.0](https://github.com/Sangaibisi/browsonic-sdk/compare/cli@v1.0.0...cli@v1.1.0) (2026-05-07)

### Features

- **astro:** trigger initial @browsonic/astro publish ([e3c8896](https://github.com/Sangaibisi/browsonic-sdk/commit/e3c88964e8d5e7f5f3f24a7f985f50e11c71fc25))
- **cli:** trigger initial @browsonic/cli publish ([4d4f1c6](https://github.com/Sangaibisi/browsonic-sdk/commit/4d4f1c63a09c9b22ad91a91a337cd11ae3244675))
- **nextjs:** trigger initial @browsonic/nextjs publish ([6e440cb](https://github.com/Sangaibisi/browsonic-sdk/commit/6e440cb6cf0705e0f1f0b201d788a41e3cb3597a))
- **react:** trigger initial @browsonic/react publish ([4a6d0f1](https://github.com/Sangaibisi/browsonic-sdk/commit/4a6d0f15a2e3080cd79cd620663d4763c56359ec))
- **remix:** trigger initial @browsonic/remix publish ([51190cb](https://github.com/Sangaibisi/browsonic-sdk/commit/51190cbecc4e0184cc63f74f078c89299aefa6ac))
- **svelte:** trigger initial @browsonic/svelte publish ([6c90909](https://github.com/Sangaibisi/browsonic-sdk/commit/6c909095d28515daeb2debcc8e086a050b001abb))
- **vue:** trigger initial @browsonic/vue publish ([9d304b2](https://github.com/Sangaibisi/browsonic-sdk/commit/9d304b270e0447924cfe2cb2b0ccca272d58b470))

## 1.0.0 (2026-05-07)

### ⚠ BREAKING CHANGES

- **sdk:** @browsonic/sdk/umd and @browsonic/sdk/umd/unminified subpath
  imports are no longer published. Customers using the UMD bundle from a CDN
  (jsDelivr, unpkg) must migrate to "npm install @browsonic/sdk" + a bundler.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

### Features

- **angular:** /decorated entry-point with @Injectable service + user signal ([9a16b88](https://github.com/Sangaibisi/browsonic-sdk/commit/9a16b88f0907707c30ae90a2d42e9f72120dfec1))
- **angular:** bootstrap @browsonic/angular 0.1 adapter (S10 M1) ([ff106f7](https://github.com/Sangaibisi/browsonic-sdk/commit/ff106f70649a1ffded4f83450c8496f295995ab2))
- **angular:** HttpClient companion via reporter factory ([c11382a](https://github.com/Sangaibisi/browsonic-sdk/commit/c11382a8c2251ef02d53720d6bfbe3f615d02d9c))
- **angular:** ship 0.2 — Router instrumentation (NavigationEnd → breadcrumb) ([72c7995](https://github.com/Sangaibisi/browsonic-sdk/commit/72c7995d275f3755cdce1ab3f67a6fa8277737e0))
- **api:** add Sentry-compatible setTag / setContext / setExtra surface ([cd7f53f](https://github.com/Sangaibisi/browsonic-sdk/commit/cd7f53f8e4e0a1165438cc19c2f08591a91c85d3))
- **astro:** Astro Actions error wrapper ([a983e17](https://github.com/Sangaibisi/browsonic-sdk/commit/a983e17eda041021f737ce6858b979028321fad4))
- **astro:** bootstrap @browsonic/astro 0.1 adapter (S7 M2) ([0ebfeaa](https://github.com/Sangaibisi/browsonic-sdk/commit/0ebfeaa5dd4e8cb1e58aed51da11a6f556307a4c))
- **astro:** Content Collections breadcrumb bridge ([d9c11fb](https://github.com/Sangaibisi/browsonic-sdk/commit/d9c11fb0b193d4f74898ba67ce9d407872527d1b))
- **astro:** ship 0.2 — Astro Integration + intent breadcrumbs ([6a8ec0b](https://github.com/Sangaibisi/browsonic-sdk/commit/6a8ec0b5acd6cda0ae22ead6a5aed8ec358646c5))
- **astro:** tagAsAstroIsland helper for partial-hydration awareness ([525c46d](https://github.com/Sangaibisi/browsonic-sdk/commit/525c46dddd0f88d8c823ed4a6669c8ab1dbf35e5))
- **cli:** @browsonic/cli upload-sourcemaps with --dry-run ([67f9ff2](https://github.com/Sangaibisi/browsonic-sdk/commit/67f9ff29d96cd6188cf86a2a2235742582696f80))
- **cli:** trigger initial 0.1.0 publish ([46ba1be](https://github.com/Sangaibisi/browsonic-sdk/commit/46ba1be81f673bbefad442dd54ee1b6f0d5082b0))
- **error-tracking:** frame-aware fingerprint + queueMicrotask wrap ([8020600](https://github.com/Sangaibisi/browsonic-sdk/commit/80206004906fc09febc3284ab27d3ed0173032a8))
- **error-tracking:** wire stack parser + Error.cause unwinding into events ([931f198](https://github.com/Sangaibisi/browsonic-sdk/commit/931f19882c2ee110e3e706ba98e647e18461a81b))
- **monorepo:** import @browsonic/react into packages/react (S5.5 M2) ([29bc288](https://github.com/Sangaibisi/browsonic-sdk/commit/29bc288e986b62d989301069c35d0ad18b522bd5))
- **nextjs:** @browsonic/nextjs/instrumentation sub-entry helper ([33a9c58](https://github.com/Sangaibisi/browsonic-sdk/commit/33a9c5829e57296bb018d61b0f50c842522c26de))
- **nextjs:** bootstrap @browsonic/nextjs 0.1 adapter (S7 M1) ([db213f9](https://github.com/Sangaibisi/browsonic-sdk/commit/db213f9f1b89d9fe9b85713c7535de4e825cb290))
- **nextjs:** ship 0.2 — Pages Router companions + App Router metadata enrichment ([a115a41](https://github.com/Sangaibisi/browsonic-sdk/commit/a115a417a93d3831c02b55755bcb37b2dea8a51a))
- **remix:** bootstrap @browsonic/remix 0.1 adapter (S10 M2) ([c134b89](https://github.com/Sangaibisi/browsonic-sdk/commit/c134b89b7b250c76b3bcaf51cef36104e99fc031))
- **remix:** route hierarchy navigation breadcrumbs ([5f9f2ea](https://github.com/Sangaibisi/browsonic-sdk/commit/5f9f2eab54aa2ae658fa5fced751e790116002e2))
- **remix:** ship 0.2 — bootstrapBrowsonic + loader instrumentation + vite/legacy parity ([4fc0862](https://github.com/Sangaibisi/browsonic-sdk/commit/4fc0862f9fa7a80dd87958aa866d36e74590667d))
- **sdk:** add public addBreadcrumb API + telemetry breadcrumb channel (S8 M2) ([2f2517a](https://github.com/Sangaibisi/browsonic-sdk/commit/2f2517a8a0d71b151503be732229e0c3d491eacc))
- **sdk:** add public withScope transient scope API + close S8 (M3) ([d91fd88](https://github.com/Sangaibisi/browsonic-sdk/commit/d91fd886e656f10895b99cdc6a7c5308ea3d94bf)), closes [#9](https://github.com/Sangaibisi/browsonic-sdk/issues/9) [#1](https://github.com/Sangaibisi/browsonic-sdk/issues/1)
- **sdk:** drop UMD distribution + monorepo-wide doc cleanup ([87822af](https://github.com/Sangaibisi/browsonic-sdk/commit/87822af3781eb3b534a216314fb6573b9b05b70f))
- **sdk:** runtime environment guards + session health (S9 M1+M2; M3 deferred) ([37405ea](https://github.com/Sangaibisi/browsonic-sdk/commit/37405eac90fedfc474f52eec6f17cbd8bb8729f1))
- **stack-parser:** add multi-engine browser stack frame parser ([bbff724](https://github.com/Sangaibisi/browsonic-sdk/commit/bbff7249be71027592e47a3d4d94617fab13b20d)), closes [#1](https://github.com/Sangaibisi/browsonic-sdk/issues/1)
- **svelte:** bootstrap @browsonic/svelte 0.1 adapter (S6 M2) ([3c2a9df](https://github.com/Sangaibisi/browsonic-sdk/commit/3c2a9df0dcb0808e89308045ec2521e042999b79))
- **svelte:** ship 0.2 navigation instrumentation + generic App.Error typing ([ad85836](https://github.com/Sangaibisi/browsonic-sdk/commit/ad858361e58eaad809894348ac3264b2822ed3b1))
- **svelte:** SvelteKit form-action wrapper + +error.svelte helper ([a4b4a2a](https://github.com/Sangaibisi/browsonic-sdk/commit/a4b4a2ab051ea8bf07213a6ff0879d603db5fbb1))
- **vue:** beforeEach intent breadcrumbs in router instrumentation ([88e36eb](https://github.com/Sangaibisi/browsonic-sdk/commit/88e36eb56f42412de21119dbcb38d13d0e5a4a4e))
- **vue:** bootstrap @browsonic/vue 0.1 adapter (S6 M1) ([b83c1bf](https://github.com/Sangaibisi/browsonic-sdk/commit/b83c1bf115ec0f2a7b876785f8b34c8f4209095b))
- **vue:** Pinia integration stamps action errors with store context ([bf814a5](https://github.com/Sangaibisi/browsonic-sdk/commit/bf814a5200e77f9193d01cca02776195ce738895))
- **vue:** ship 0.2 — Vue Router instrumentation, useBreadcrumb, errorCaptured tag ([4fb62d9](https://github.com/Sangaibisi/browsonic-sdk/commit/4fb62d959f705ae91ddb6f0baebc897f3ab19e70))

### Bug Fixes

- **adapters:** widen @browsonic/sdk peer + dev range to cover 3.x ([cafe032](https://github.com/Sangaibisi/browsonic-sdk/commit/cafe0320b7a0c00ff9dc4445a4e99e9a2b91672c))
- **ci:** expose NODE_AUTH_TOKEN to semantic-release for npm auth ([034a8d2](https://github.com/Sangaibisi/browsonic-sdk/commit/034a8d2730951a78469ab5be34081e95a5fdffde))
- **ci:** point bench/size jobs at packages/sdk + bump release node to 22 ([8a95900](https://github.com/Sangaibisi/browsonic-sdk/commit/8a959005e5f4c6b31b98adc29bc6d4e4d093d075))
- **ci:** topological workspace build order to unbreak release/E2E/lint ([51df4af](https://github.com/Sangaibisi/browsonic-sdk/commit/51df4af83c016c96858c8f346c6ba76f6c55d80d))
- **packaging:** refresh README on npm to match repo ([e42c18e](https://github.com/Sangaibisi/browsonic-sdk/commit/e42c18ee6807f7dff0a95e25c97dc9c939634f0a))
- **release:** explicit cross-package scope filters in releaseRules ([155c972](https://github.com/Sangaibisi/browsonic-sdk/commit/155c972090f40a599d88d8567826f1a638ef460e))
- **release:** pin semantic-release to ^24.2.7 + fix react package URL + scope SBOM to root ([19cde33](https://github.com/Sangaibisi/browsonic-sdk/commit/19cde3368373104c9f306aef779715599266b5e4))
- **release:** scope-filter + namespaced tag formats so adapters publish independently ([ad26a5e](https://github.com/Sangaibisi/browsonic-sdk/commit/ad26a5e77ac4e34897d90418be0272dec5acbaf1))
