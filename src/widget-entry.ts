/**
 * Widget entry — notification plugin + types + sanitize constants.
 *
 * 1.0 onwards, the widget is a plugin. The core SDK bundle does not
 * import widget code; you opt in explicitly:
 *
 *   import { getBrowsonic } from '@browsonic/sdk/core';
 *   import { widgetPlugin, type WidgetRule } from '@browsonic/sdk/widget';
 *
 *   const sdk = getBrowsonic();
 *   sdk.register(widgetPlugin());
 *   sdk.init({ apiEndpoint: '...', appKey: '...', widgetRules: [...] });
 *
 * Apps that don't need the widget omit this import and pay zero bytes
 * for widget code.
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md for terms
 */

// Plugin factory — the primary integration point.
export { widgetPlugin, type WidgetPluginOptions } from './widget/plugin';

// Widget public types
export type {
  WidgetRule,
  WidgetRuleMatch,
  WidgetNotification,
  WidgetSeverity,
  WidgetPosition,
} from './types';

// Sanitization constants (useful for admin UIs building widget rules
// that want to match the client's accepted limits / allow-lists).
export { MAX_TITLE_LENGTH, MAX_MESSAGE_LENGTH, MAX_ACTION_LABEL_LENGTH } from './widget/sanitize';
export { MAX_PATTERN_LENGTH } from './widget/safe-regex';
