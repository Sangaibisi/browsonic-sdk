## [2.3.0](https://github.com/Sangaibisi/browsonic-sdk/compare/v2.2.1...v2.3.0) (2026-05-04)

### Features

- **angular:** bootstrap @browsonic/angular 0.1 adapter (S10 M1) ([ff106f7](https://github.com/Sangaibisi/browsonic-sdk/commit/ff106f70649a1ffded4f83450c8496f295995ab2))
- **api:** add Sentry-compatible setTag / setContext / setExtra surface ([cd7f53f](https://github.com/Sangaibisi/browsonic-sdk/commit/cd7f53f8e4e0a1165438cc19c2f08591a91c85d3))
- **astro:** bootstrap @browsonic/astro 0.1 adapter (S7 M2) ([0ebfeaa](https://github.com/Sangaibisi/browsonic-sdk/commit/0ebfeaa5dd4e8cb1e58aed51da11a6f556307a4c))
- **error-tracking:** frame-aware fingerprint + queueMicrotask wrap ([8020600](https://github.com/Sangaibisi/browsonic-sdk/commit/80206004906fc09febc3284ab27d3ed0173032a8))
- **error-tracking:** wire stack parser + Error.cause unwinding into events ([931f198](https://github.com/Sangaibisi/browsonic-sdk/commit/931f19882c2ee110e3e706ba98e647e18461a81b))
- **monorepo:** import @browsonic/react into packages/react (S5.5 M2) ([29bc288](https://github.com/Sangaibisi/browsonic-sdk/commit/29bc288e986b62d989301069c35d0ad18b522bd5))
- **nextjs:** bootstrap @browsonic/nextjs 0.1 adapter (S7 M1) ([db213f9](https://github.com/Sangaibisi/browsonic-sdk/commit/db213f9f1b89d9fe9b85713c7535de4e825cb290))
- **remix:** bootstrap @browsonic/remix 0.1 adapter (S10 M2) ([c134b89](https://github.com/Sangaibisi/browsonic-sdk/commit/c134b89b7b250c76b3bcaf51cef36104e99fc031))
- **sdk:** add public addBreadcrumb API + telemetry breadcrumb channel (S8 M2) ([2f2517a](https://github.com/Sangaibisi/browsonic-sdk/commit/2f2517a8a0d71b151503be732229e0c3d491eacc))
- **sdk:** add public withScope transient scope API + close S8 (M3) ([d91fd88](https://github.com/Sangaibisi/browsonic-sdk/commit/d91fd886e656f10895b99cdc6a7c5308ea3d94bf)), closes [#9](https://github.com/Sangaibisi/browsonic-sdk/issues/9) [#1](https://github.com/Sangaibisi/browsonic-sdk/issues/1)
- **sdk:** runtime environment guards + session health (S9 M1+M2; M3 deferred) ([37405ea](https://github.com/Sangaibisi/browsonic-sdk/commit/37405eac90fedfc474f52eec6f17cbd8bb8729f1))
- **stack-parser:** add multi-engine browser stack frame parser ([bbff724](https://github.com/Sangaibisi/browsonic-sdk/commit/bbff7249be71027592e47a3d4d94617fab13b20d)), closes [#1](https://github.com/Sangaibisi/browsonic-sdk/issues/1)
- **svelte:** bootstrap @browsonic/svelte 0.1 adapter (S6 M2) ([3c2a9df](https://github.com/Sangaibisi/browsonic-sdk/commit/3c2a9df0dcb0808e89308045ec2521e042999b79))
- **vue:** bootstrap @browsonic/vue 0.1 adapter (S6 M1) ([b83c1bf](https://github.com/Sangaibisi/browsonic-sdk/commit/b83c1bf115ec0f2a7b876785f8b34c8f4209095b))

### Bug Fixes

- **ci:** point bench/size jobs at packages/sdk + bump release node to 22 ([8a95900](https://github.com/Sangaibisi/browsonic-sdk/commit/8a959005e5f4c6b31b98adc29bc6d4e4d093d075))
- **ci:** topological workspace build order to unbreak release/E2E/lint ([51df4af](https://github.com/Sangaibisi/browsonic-sdk/commit/51df4af83c016c96858c8f346c6ba76f6c55d80d))
