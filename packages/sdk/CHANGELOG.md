# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Future entries are generated automatically by [semantic-release](https://semantic-release.gitbook.io) from Conventional Commits — please do not edit them by hand.

## [2.2.0] — 2026-04-27 — Initial public release

This is the first public release. The SDK was previously distributed privately as `@leguides/browsonic-sdk` (latest internal version: 2.1.1). The public API and the `/v1/events` wire format are unchanged from 2.1.1; the version bump to 2.2.0 marks the open-source release and the supporting changes around it.

### Added

- Apache 2.0 licence ([`LICENSE`](./LICENSE), [`NOTICE`](./NOTICE)).
- Public-facing documentation set: [`README.md`](./README.md), [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md), [`SECURITY.md`](./SECURITY.md), [`BENCHMARKS.md`](./BENCHMARKS.md).
- GitHub issue and pull-request templates.
- npm provenance via [sigstore](https://www.sigstore.dev) on every published version.

### Changed

- npm package name: `@leguides/browsonic-sdk` → `@browsonic/sdk`.
- Registry: GitHub Packages → public npm registry (`registry.npmjs.org`).
- Repository: `leguides/browsonic-sdk` → `Sangaibisi/browsonic-sdk`.
- License: proprietary → Apache 2.0.

### Migration from `@leguides/browsonic-sdk@2.1.1`

```diff
- npm install @leguides/browsonic-sdk
+ npm install @browsonic/sdk
```

```diff
- import { Browsonic } from '@leguides/browsonic-sdk';
+ import { Browsonic } from '@browsonic/sdk';
```

No code changes are needed beyond the import rename. Configuration, callbacks, and runtime behaviour are unchanged. The previous package on GitHub Packages will be deprecated with a pointer to this release.
