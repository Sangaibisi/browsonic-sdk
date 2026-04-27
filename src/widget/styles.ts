/**
 * Widget Styles (scoped inside Shadow DOM)
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

export const WIDGET_STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #e2e8f0;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  .browsonic-widget {
    position: fixed;
    z-index: 2147483647;
    max-width: 380px;
    width: calc(100vw - 32px);
    pointer-events: auto;
  }

  .browsonic-widget--bottom-right {
    bottom: 20px;
    right: 20px;
  }

  .browsonic-widget--bottom-left {
    bottom: 20px;
    left: 20px;
  }

  /* Notification Card */
  .notification {
    background: #1a1e2e;
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.1);
    animation: slideIn 0.3s ease-out;
    position: relative;
    overflow: hidden;
  }

  .notification::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
  }

  .notification--error::before {
    background: linear-gradient(90deg, #ef4444, #f97316, #ef4444);
  }

  .notification--warning::before {
    background: linear-gradient(90deg, #f59e0b, #eab308, #f59e0b);
  }

  .notification--info::before {
    background: linear-gradient(90deg, #6366f1, #06b6d4, #6366f1);
  }

  /* Header */
  .notification-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 8px;
  }

  .notification-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
  }

  .notification--error .notification-icon {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  .notification--warning .notification-icon {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .notification--info .notification-icon {
    background: rgba(99, 102, 241, 0.15);
    color: #6366f1;
  }

  .notification-icon svg {
    width: 18px;
    height: 18px;
  }

  .notification-content {
    flex: 1;
    min-width: 0;
  }

  .notification-title {
    font-size: 14px;
    font-weight: 600;
    color: #f1f5f9;
    margin-bottom: 4px;
  }

  .notification-message {
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.5;
  }

  /* Close Button */
  .notification-close {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: #64748b;
    cursor: pointer;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .notification-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
  }

  .notification-close svg {
    width: 14px;
    height: 14px;
  }

  /* Action */
  .notification-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    color: #818cf8;
    background: rgba(99, 102, 241, 0.1);
    border: 1px solid rgba(99, 102, 241, 0.2);
    border-radius: 6px;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s;
  }

  .notification-action:hover {
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
  }

  .notification-action svg {
    width: 12px;
    height: 12px;
  }

  /* Branding */
  .notification-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .notification-brand {
    font-size: 10px;
    color: #475569;
    text-decoration: none;
    transition: color 0.15s;
  }

  .notification-brand:hover {
    color: #64748b;
  }

  /* Animations */
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .notification--exit {
    animation: slideOut 0.2s ease-in forwards;
  }

  @keyframes slideOut {
    to {
      opacity: 0;
      transform: translateY(10px) scale(0.96);
    }
  }
`;
