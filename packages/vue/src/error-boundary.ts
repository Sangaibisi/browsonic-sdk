// SPDX-License-Identifier: Apache-2.0

/**
 * BrowsonicErrorBoundary — Vue 3 component that wires the framework's
 * `errorCaptured` lifecycle hook into the Browsonic SDK's
 * `captureError`. Mirrors `@browsonic/react`'s class-component boundary
 * so adapters speak the same shape across frameworks.
 *
 * Vue's reconciler captures render-time and lifecycle exceptions in
 * descendant components and forwards them to the nearest ancestor that
 * declares `errorCaptured`. The plain `@browsonic/sdk` install therefore
 * does not see them — only `app.config.errorHandler` does (and only
 * after the boundary has handled them, when the boundary returns
 * non-`false`). This component closes that gap.
 *
 * Defensive contract
 * ------------------
 * - SDK calls are wrapped in try/catch — a thrown `captureError` cannot
 *   crash the host app.
 * - `componentStack` is truncated to 1024 chars before being forwarded
 *   as metadata, so a deeply-nested tree cannot inflate event payloads.
 * - Returns `false` from `errorCaptured` to stop further propagation
 *   when the boundary is the chosen handler — matching React's
 *   `componentDidCatch` semantics.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import {
  defineComponent,
  getCurrentInstance,
  h,
  ref,
  onErrorCaptured,
  type Component,
  type PropType,
} from 'vue';
import type { Browsonic } from '@browsonic/sdk';
import { useBrowsonic } from './composables';

const MAX_COMPONENT_STACK_LENGTH = 1024;

/**
 * Fallback render strategy: either a Vue component to render with
 * `{ error, reset }` props, or a function that returns a VNode given
 * the same context.
 */
export type BrowsonicErrorBoundaryFallback =
  | Component
  | ((ctx: { error: Error; reset: () => void }) => unknown);

export const BrowsonicErrorBoundary = defineComponent({
  name: 'BrowsonicErrorBoundary',
  props: {
    /**
     * Browsonic SDK instance to report errors to. When omitted, the
     * boundary uses `useBrowsonic()` — the plugin-provided instance
     * or the global `window.Browsonic.getBrowsonic()` singleton. If
     * neither is reachable the boundary still renders fallback but
     * no report is sent.
     */
    sdk: { type: Object as PropType<Browsonic>, default: null },
    /**
     * What to render after a child component throws. Either a Vue
     * component or a render function. The fallback receives `error`
     * and `reset()` either as props (component) or as the function
     * argument.
     */
    fallback: {
      type: [Object, Function] as PropType<BrowsonicErrorBoundaryFallback>,
      required: true,
    },
    /**
     * Optional hook called after the SDK has been notified. Useful for
     * adding custom telemetry, navigating away, or showing a toast.
     */
    onError: {
      type: Function as PropType<(error: Error, info: string) => void>,
      default: null,
    },
  },
  emits: {
    error: (_error: Error, _info: string) => true,
  },
  setup(props, { slots, emit }) {
    const error = ref<Error | null>(null);
    const provided = useBrowsonic();
    const vueVersion = getCurrentInstance()?.appContext.app.version;

    const reset = (): void => {
      error.value = null;
    };

    onErrorCaptured((err, instance, info) => {
      const sdk = props.sdk ?? provided;
      const errorObj = err instanceof Error ? err : new Error(String(err));

      if (sdk) {
        try {
          // 0.2: surface Vue's `info` string as a structured tag
          // BEFORE captureError, so the tag is on the active scope and
          // rides along with the event. Common values:
          //   'render function', 'setup function', 'errorCaptured hook',
          //   'created hook', 'mounted hook', 'updated hook', etc.
          // Tags are truncated to 64 chars to fit dashboard column
          // budgets — the full string still lands as metadata below.
          if (info && typeof info === 'string' && info.length > 0) {
            const tagValue = info.length > 64 ? info.slice(0, 64) : info;
            try {
              sdk.setTag('vue.errorCaptured.info', tagValue);
            } catch {
              // Tag failures don't block the captureError below.
            }
          }
          // Mirror onto the `vue` context bucket so the dashboard's
          // VueCard renders Vue version + lifecycle hook + component
          // name. Tags are scope-only and dropped at ingest today;
          // the context bucket is what reaches the event payload.
          const vueCtx: Record<string, unknown> = {};
          if (vueVersion) vueCtx.version = vueVersion;
          if (info && typeof info === 'string' && info.length > 0) {
            vueCtx.lifecycleHook = info.length > 64 ? info.slice(0, 64) : info;
          }
          const componentName =
            (instance as { type?: { name?: string; __name?: string } } | null)?.type?.name ??
            (instance as { type?: { name?: string; __name?: string } } | null)?.type?.__name;
          if (componentName) vueCtx.componentName = componentName;
          if (Object.keys(vueCtx).length > 0) {
            try {
              sdk.setContext('vue', vueCtx);
            } catch {
              // Context failures must not block captureError.
            }
          }
          sdk.captureError(errorObj);
          if (info && typeof info === 'string' && info.length > 0) {
            sdk.addMetadata('componentStack', info.slice(0, MAX_COMPONENT_STACK_LENGTH));
          }
        } catch {
          // SDK reporting failures must never bubble.
        }
      }

      try {
        props.onError?.(errorObj, info);
        emit('error', errorObj, info);
      } catch {
        // User-supplied onError follows the same defensive contract.
      }

      error.value = errorObj;
      // Returning `false` stops the error from propagating further up
      // the tree — the boundary owns it from here.
      return false;
    });

    return () => {
      const captured = error.value;
      if (captured !== null) {
        const fallback = props.fallback;
        if (typeof fallback === 'function') {
          // The union widens fallback to a non-callable constituent
          // through TS narrowing, so cast back to our render-fn shape.
          // Vue functional components share the same `(props) => VNode`
          // signature, so passing a FunctionalComponent here works too.
          const renderFn = fallback as (ctx: { error: Error; reset: () => void }) => unknown;
          return renderFn({ error: captured, reset });
        }
        return h(fallback, { error: captured, reset });
      }
      return slots.default?.();
    };
  },
});
