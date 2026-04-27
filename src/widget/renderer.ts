/**
 * Widget Renderer - Shadow DOM based notification UI
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { WidgetNotification, WidgetPosition, WidgetSeverity } from '../types';
import { WIDGET_STYLES } from './styles';
import { sanitizeNotification } from './sanitize';

const HOST_ID = 'browsonic-widget-host';

// SVG icons (inline to avoid external deps)
const ICONS: Record<WidgetSeverity, string> = {
  error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  warning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

const EXTERNAL_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

export interface WidgetRenderer {
  /** Show a notification */
  show(notification: WidgetNotification): void;
  /** Dismiss the current notification */
  dismiss(): void;
  /** Remove the widget from DOM entirely */
  destroy(): void;
  /** Whether a notification is currently visible */
  isVisible(): boolean;
}

export function createWidgetRenderer(
  position: WidgetPosition,
  cspNonce: string | null = null
): WidgetRenderer {
  let hostEl: HTMLElement | null = null;
  let shadowRoot: ShadowRoot | null = null;
  let visible = false;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  function ensureHost(): ShadowRoot {
    if (shadowRoot) return shadowRoot;

    // Create host element
    hostEl = document.createElement('div');
    hostEl.id = HOST_ID;
    // Prevent host app styles from leaking in
    hostEl.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';

    shadowRoot = hostEl.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    // Sprint P15 (F3.1.C): when the host app runs a strict CSP with
    // nonces, apply it to our <style> element. Shadow DOM normally
    // encapsulates styles, but some CSP enforcement chains still check
    // inline styles at attachment time — the nonce is the safest bet.
    if (cspNonce) {
      style.setAttribute('nonce', cspNonce);
    }
    style.textContent = WIDGET_STYLES;
    shadowRoot.appendChild(style);

    document.body.appendChild(hostEl);
    return shadowRoot;
  }

  function show(notification: WidgetNotification): void {
    // SECURITY: sanitize caps title/message length and filters the actionUrl
    // to only http(s)/mailto/tel — prevents `javascript:` XSS from a compromised
    // widget-rules endpoint. See TEKNIK-IYILESTIRME-PLANI.md §1.1.
    const safe = sanitizeNotification(notification);
    if (!safe) return; // notification had no renderable content

    const root = ensureHost();
    const severity: WidgetSeverity = safe.severity ?? 'error';

    // Clear any existing notification
    const existing = root.querySelector('.browsonic-widget');
    if (existing) existing.remove();
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }

    // Build notification HTML
    const widget = document.createElement('div');
    widget.className = `browsonic-widget browsonic-widget--${position}`;

    const actionHtml = safe.actionUrl
      ? `<a class="notification-action" href="${escapeHtml(safe.actionUrl)}" target="_blank" rel="noopener noreferrer">
           ${escapeHtml(safe.actionLabel ?? 'Learn more')}
           ${EXTERNAL_ICON}
         </a>`
      : '';

    widget.innerHTML = `
      <div class="notification notification--${severity}">
        <div class="notification-header">
          <div class="notification-icon">${ICONS[severity]}</div>
          <div class="notification-content">
            <div class="notification-title">${escapeHtml(safe.title)}</div>
            <div class="notification-message">${escapeHtml(safe.message)}</div>
            ${actionHtml}
          </div>
          <button class="notification-close" aria-label="Close">${CLOSE_ICON}</button>
        </div>
        <div class="notification-footer">
          <span class="notification-brand">Powered by Browsonic</span>
        </div>
      </div>
    `;

    // Close button handler
    const closeBtn = widget.querySelector('.notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => dismiss());
    }

    root.appendChild(widget);
    visible = true;

    // Auto dismiss
    if (safe.autoDismissMs && safe.autoDismissMs > 0) {
      dismissTimer = setTimeout(() => dismiss(), safe.autoDismissMs);
    }
  }

  function dismiss(): void {
    if (!shadowRoot || !visible) return;

    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }

    const widget = shadowRoot.querySelector('.browsonic-widget');
    if (!widget) return;

    // Add exit animation
    const notification = widget.querySelector('.notification');
    if (notification) {
      notification.classList.add('notification--exit');
      setTimeout(() => {
        widget.remove();
        visible = false;
      }, 200);
    } else {
      widget.remove();
      visible = false;
    }
  }

  function destroy(): void {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    if (hostEl && hostEl.parentNode) {
      hostEl.parentNode.removeChild(hostEl);
    }
    hostEl = null;
    shadowRoot = null;
    visible = false;
  }

  function isVisible(): boolean {
    return visible;
  }

  return { show, dismiss, destroy, isVisible };
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
