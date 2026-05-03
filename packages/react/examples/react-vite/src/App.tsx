// SPDX-License-Identifier: Apache-2.0

import { useState, type ReactNode } from 'react';
import {
  BrowsonicErrorBoundary,
  useBrowsonic,
  useCaptureError,
  useUser,
  withBrowsonic,
  type WithBrowsonicInjectedProps,
} from '@browsonic/react';
import { Component } from 'react';

export function App() {
  // Demo: set a fixed user context so reported events carry identity.
  // In a real app this comes from your auth state.
  useUser({ id: 'demo-user-1', email: 'demo@example.com', plan: 'pro' });

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720 }}>
      <h1>@browsonic/react demo</h1>
      <p>Open the browser DevTools console — every surface logs there in debug mode.</p>

      <BrowsonicErrorBoundary
        fallback={(error, reset) => (
          <div
            role="alert"
            style={{
              padding: '1rem',
              border: '1px solid #c00',
              background: '#fff5f5',
              borderRadius: 4,
            }}
          >
            <strong>Boundary caught:</strong> {error.message}
            <div style={{ marginTop: '0.5rem' }}>
              <button onClick={reset}>Reset boundary</button>
            </div>
          </div>
        )}
      >
        <DemoFeatures />
      </BrowsonicErrorBoundary>

      <hr style={{ margin: '2rem 0' }} />
      <LegacyClassPanelWrapped />
    </main>
  );
}

function DemoFeatures() {
  const sdk = useBrowsonic();
  const captureError = useCaptureError();
  const [boom, setBoom] = useState(false);

  // useBrowsonic is mount-stable; this is a render-time check.
  if (boom) {
    throw new Error('intentional render-time crash for demo');
  }

  const onEventHandlerError = () => {
    try {
      throw new Error('intentional event-handler error for demo');
    } catch (err) {
      captureError(err as Error);
    }
  };

  return (
    <section>
      <p>
        SDK reachable: <strong>{sdk ? 'yes' : 'no'}</strong>
      </p>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button onClick={() => setBoom(true)}>Trigger render error</button>
        <button onClick={onEventHandlerError}>Trigger event-handler error</button>
      </div>
    </section>
  );
}

// HOC demo — class component that opts into SDK access via withBrowsonic.
class LegacyClassPanel extends Component<WithBrowsonicInjectedProps> {
  componentDidMount(): void {
    this.props.sdk?.captureMessage('LegacyClassPanel mounted');
  }
  render(): ReactNode {
    return (
      <p style={{ fontStyle: 'italic', color: '#555' }}>
        Class component panel — captureMessage fired on mount via <code>withBrowsonic</code>.
      </p>
    );
  }
}

const LegacyClassPanelWrapped = withBrowsonic(LegacyClassPanel);
