// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Browsonic } from '@browsonic/sdk';
import { App } from './App';

// Initialise the SDK before mounting the React tree. In a real app
// this happens in your bootstrap module — somewhere everything else
// imports first.
const sdk = new Browsonic();
sdk.init({
  apiEndpoint: 'https://ingest.example.com',
  appKey: 'demo-app-key',
  debug: true, // emits SDK lifecycle logs into the browser console
});

// Expose the singleton on `window.Browsonic` so the adapter's
// `resolveSdk()` helper finds it. The SDK's main entry registers
// this automatically; we do it manually here because this demo
// imports from `@browsonic/sdk` directly (constructor + init) and
// does not rely on the auto-registered global.
(
  window as Window & {
    Browsonic?: { getBrowsonic: () => Browsonic };
  }
).Browsonic = { getBrowsonic: () => sdk };

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
