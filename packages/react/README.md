# @browsonic/react

[![npm version](https://img.shields.io/npm/v/@browsonic/react.svg?color=cb3837)](https://www.npmjs.com/package/@browsonic/react)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-3178c6.svg)](./LICENSE)
[![CI](https://github.com/Sangaibisi/browsonic-react/actions/workflows/ci.yml/badge.svg)](https://github.com/Sangaibisi/browsonic-react/actions/workflows/ci.yml)

> **React adapter for [@browsonic/sdk](https://github.com/Sangaibisi/browsonic-sdk).** Catches the render errors that `window.onerror` cannot see.

React's reconciler swallows render-time exceptions and shows a fallback tree — the error never bubbles to `window`, so a plain `@browsonic/sdk` install reports nothing. This adapter wires React's Error Boundary primitive to Browsonic so those errors get reported, with the React component stack attached.

```bash
npm install @browsonic/sdk @browsonic/react
```

```tsx
import { Browsonic } from '@browsonic/sdk';
import { BrowsonicErrorBoundary } from '@browsonic/react';

const sdk = new Browsonic();
sdk.init({
  apiEndpoint: 'https://your-ingest.example.com',
  appKey: 'your-app-key',
});

function App() {
  return (
    <BrowsonicErrorBoundary
      sdk={sdk}
      fallback={(error, reset) => (
        <div role="alert">
          <p>Something went wrong: {error.message}</p>
          <button onClick={reset}>Try again</button>
        </div>
      )}
    >
      <YourApp />
    </BrowsonicErrorBoundary>
  );
}
```

## What this adapter ships

- **`<BrowsonicErrorBoundary>`** — render-time error capture with reset support.
- **`useBrowsonic()`** — singleton instance hook (lazy at mount, stable for the lifetime of the component).
- **`useUser(user | null)`** — sets / clears user context as the component mounts and updates when the user fields change.
- **`useCaptureError()`** — stable callback for try/catch sites and event handlers.
- **`withBrowsonic(Component)`** — HOC that injects `sdk` as a prop, for class components that cannot consume hooks.
- **React Router instrumentation** _(coming in 0.3)_ — automatic page-view events.

```tsx
import { BrowsonicErrorBoundary, useBrowsonic, useUser, useCaptureError } from '@browsonic/react';

function App({ currentUser }) {
  // Set user context for every event captured while this component is mounted.
  useUser(currentUser); // pass `null` to clear

  return (
    <BrowsonicErrorBoundary fallback={<ErrorScreen />}>
      <Checkout />
    </BrowsonicErrorBoundary>
  );
}

function Checkout() {
  const captureError = useCaptureError();
  const sdk = useBrowsonic();

  const buy = async () => {
    try {
      await api.buy();
    } catch (err) {
      // Event handlers don't reach Error Boundaries — capture manually.
      captureError(err as Error);
    }
  };

  return <button onClick={buy}>Buy</button>;
}
```

The roadmap above mirrors [`ROADMAP.md`](./ROADMAP.md). The package follows the [@browsonic/sdk](https://github.com/Sangaibisi/browsonic-sdk) release cadence; SemVer strict.

## Compatibility

| Surface           | Versions   |
| ----------------- | ---------- |
| React             | 18.x, 19.x |
| `@browsonic/sdk`  | ≥ 2.2.1    |
| Node (build/test) | ≥ 20       |

## Privacy

The adapter does **not** collect data on its own — it forwards to the SDK, which carries Browsonic's privacy-first defaults. See [`PRIVACY.md`](https://github.com/Sangaibisi/browsonic-sdk/blob/main/PRIVACY.md) in the SDK repo.

The adapter attaches a truncated React **component stack** (≤ 1024 chars) as event metadata when reporting a render error. This is React's own `componentStack` string — the same one React already shows in dev console — and never includes prop or state values.

## License

Apache License 2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
