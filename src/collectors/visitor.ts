// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { VisitorTelemetryData } from '../telemetry';
import { safeExecute } from '../utils';

type ValuePattern =
  | 'empty'
  | 'email'
  | 'numeric'
  | 'alpha'
  | 'alphanumeric'
  | 'whitespace'
  | 'characters';

interface VisitorCollectorOptions {
  onTelemetry: (data: VisitorTelemetryData) => void;
  debugLog: (message: string, ...args: unknown[]) => void;
  /** Track click events (default: true) */
  trackClicks?: boolean;
  /** Track input events (default: true) */
  trackInputs?: boolean;
  /** Throttle period for input events in ms (default: 500) */
  inputThrottleMs?: number;
}

/**
 * Visitor collector - tracks user interactions (clicks, inputs)
 * Privacy-aware: Never stores actual input values, only patterns and lengths
 */
export function createVisitorCollector(options: VisitorCollectorOptions) {
  const {
    onTelemetry,
    debugLog,
    trackClicks = true,
    trackInputs = true,
    inputThrottleMs = 500,
  } = options;

  let isInstalled = false;
  const inputThrottles = new Map<EventTarget, number>();

  // AbortController for event listeners cleanup
  let abortController: AbortController | null = null;

  /**
   * Determine value pattern without storing actual value (privacy-safe)
   */
  function getValuePattern(value: string): ValuePattern {
    if (!value || value.length === 0) return 'empty';
    if (/^\s+$/.test(value)) return 'whitespace';
    if (/^[\w.-]+@[\w.-]+\.\w+$/.test(value)) return 'email';
    if (/^\d+$/.test(value)) return 'numeric';
    if (/^[a-zA-Z]+$/.test(value)) return 'alpha';
    if (/^[a-zA-Z0-9]+$/.test(value)) return 'alphanumeric';
    return 'characters';
  }

  /** Sensitive attribute names to exclude */
  const EXCLUDED_ATTRS = [
    'value',
    'data-value',
    'password',
    'data-password',
    'token',
    'data-token',
  ];
  const MAX_ATTRIBUTES = 10;
  const MAX_TEXT_LENGTH = 500;
  const MAX_ATTR_VALUE_LENGTH = 100;

  /**
   * Extract element info (tag, attributes, text) - TrackJS style
   * Privacy-aware: excludes sensitive attributes and values
   */
  function getElementInfo(element: Element): VisitorTelemetryData['element'] {
    const attributes: Record<string, string> = {};

    // Capture up to MAX_ATTRIBUTES attributes (like TrackJS)
    const attrs = element.attributes;
    const attrCount = Math.min(attrs.length, MAX_ATTRIBUTES);

    for (let i = 0; i < attrCount; i++) {
      const attr = attrs[i];
      const name = attr.name.toLowerCase();

      // Skip sensitive attributes
      if (EXCLUDED_ATTRS.some((excluded) => name.includes(excluded))) {
        continue;
      }

      // Truncate long attribute values
      attributes[attr.name] = attr.value.slice(0, MAX_ATTR_VALUE_LENGTH);
    }

    const result: VisitorTelemetryData['element'] = {
      tag: element.tagName.toLowerCase(),
      attributes,
    };

    // Capture innerText for ALL clickable elements (like TrackJS)
    // This helps identify elements by their visible text
    if (element instanceof HTMLElement && element.innerText) {
      const text = element.innerText.trim();
      if (text && text.length > 0) {
        result.text = text.slice(0, MAX_TEXT_LENGTH);
      }
    }

    return result;
  }

  /**
   * Handle click events
   */
  function handleClick(event: MouseEvent) {
    if (!trackClicks) return;

    safeExecute(
      () => {
        const target = event.target as Element | null;
        if (!target) return;

        onTelemetry({
          action: 'click',
          element: getElementInfo(target),
        });

        debugLog(`Visitor click: <${target.tagName.toLowerCase()}>`);
      },
      undefined,
      (error) => debugLog('Visitor click handler error:', error)
    );
  }

  /**
   * Handle input events with throttling
   */
  function handleInput(event: Event) {
    if (!trackInputs) return;

    safeExecute(
      () => {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
        if (!target) return;

        // Skip password fields entirely (privacy)
        if (target instanceof HTMLInputElement && target.type === 'password') {
          return;
        }

        // Throttle per element
        const lastTime = inputThrottles.get(target);
        const now = Date.now();
        if (lastTime && now - lastTime < inputThrottleMs) {
          return;
        }
        inputThrottles.set(target, now);

        const value = target.value || '';

        onTelemetry({
          action: 'input',
          element: {
            ...getElementInfo(target),
            value: {
              length: value.length,
              pattern: getValuePattern(value),
            },
          },
        });

        debugLog(
          `Visitor input: <${target.tagName.toLowerCase()}> length=${value.length} pattern=${getValuePattern(value)}`
        );
      },
      undefined,
      (error) => debugLog('Visitor input handler error:', error)
    );
  }

  function install() {
    if (isInstalled) return;
    if (typeof document === 'undefined') return;

    safeExecute(
      () => {
        abortController = new AbortController();

        // Listen for clicks (capture phase, passive)
        if (trackClicks) {
          document.addEventListener('click', handleClick, {
            capture: true,
            passive: true,
            signal: abortController.signal,
          });
        }

        // Listen for inputs (capture phase, passive)
        if (trackInputs) {
          document.addEventListener('input', handleInput, {
            capture: true,
            passive: true,
            signal: abortController.signal,
          });
        }

        isInstalled = true;
        debugLog(`Visitor collector installed (clicks: ${trackClicks}, inputs: ${trackInputs})`);
      },
      undefined,
      (error) => debugLog('Failed to install visitor collector:', error)
    );
  }

  function uninstall() {
    if (!isInstalled) return;

    safeExecute(
      () => {
        // Remove event listeners via AbortController
        if (abortController) {
          abortController.abort();
          abortController = null;
        }

        // Clear throttle map
        inputThrottles.clear();

        isInstalled = false;
        debugLog('Visitor collector uninstalled');
      },
      undefined,
      (error) => debugLog('Failed to uninstall visitor collector:', error)
    );
  }

  return {
    install,
    uninstall,
    isInstalled: () => isInstalled,
  };
}
