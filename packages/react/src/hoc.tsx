// SPDX-License-Identifier: Apache-2.0

/**
 * `withBrowsonic` higher-order component.
 *
 * Class components cannot consume hooks directly. This HOC injects
 * the Browsonic SDK instance as a `sdk` prop so legacy class
 * components (or third-party class components you do not own) can
 * reach the SDK without converting to function components.
 *
 * In modern React codebases, prefer `useBrowsonic()` from
 * `./hooks.ts`. The HOC exists for the long tail of class-based
 * code that cannot be rewritten in the timescale of an SDK upgrade.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { ComponentType } from 'react';
import type { Browsonic } from '@browsonic/sdk';
import { useBrowsonic } from './hooks';

/**
 * Props injected by `withBrowsonic`. The wrapped component sees
 * `sdk` as `Browsonic | null` — null when the SDK has not been
 * initialised on the page.
 */
export interface WithBrowsonicInjectedProps {
  sdk: Browsonic | null;
}

/**
 * Wrap a component so it receives a `sdk` prop. Existing props pass
 * through; the consumer can override `sdk` from outside if a
 * different instance is desired (testing, multi-SDK setups).
 *
 * @example
 * ```tsx
 * class LegacyDashboard extends React.Component<Props & WithBrowsonicInjectedProps> {
 *   componentDidMount(): void {
 *     this.props.sdk?.captureMessage('dashboard mounted');
 *   }
 *   render(): ReactNode { return <div>...</div>; }
 * }
 *
 * export default withBrowsonic(LegacyDashboard);
 * ```
 */
export function withBrowsonic<P extends WithBrowsonicInjectedProps>(
  Component: ComponentType<P>,
): ComponentType<Omit<P, keyof WithBrowsonicInjectedProps>> {
  function WithBrowsonic(props: Omit<P, keyof WithBrowsonicInjectedProps>) {
    const sdk = useBrowsonic();
    // The cast is safe: P = Omit<P, sdk> & WithBrowsonicInjectedProps,
    // and we are providing `sdk` ourselves on top of the caller's
    // remaining props.
    const merged = { ...props, sdk } as unknown as P;
    return <Component {...merged} />;
  }
  WithBrowsonic.displayName = `withBrowsonic(${Component.displayName ?? Component.name ?? 'Component'})`;
  return WithBrowsonic;
}
