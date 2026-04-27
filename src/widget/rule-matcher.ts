/**
 * Widget Rule Matcher
 * Evaluates events against widget rules and tracks occurrence counts.
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { BrowsonicEvent, WidgetRule, WidgetNotification } from '../types';
import { createRegexCache } from './safe-regex';

interface RuleState {
  /** Timestamps of matching events (for withinMs window) */
  hits: number[];
  /** Last time this rule triggered a notification */
  lastTriggeredAt: number;
}

export interface RuleMatchResult {
  rule: WidgetRule;
  notification: WidgetNotification;
}

export interface RuleMatcher {
  /** Check an event against all rules. Returns matched rule or null. */
  check(event: BrowsonicEvent, currentUrl: string): RuleMatchResult | null;
  /** Add rules (e.g. from server) */
  addRules(rules: WidgetRule[]): void;
  /** Get current rule count */
  ruleCount(): number;
  /** Reset all state (counters, cooldowns) */
  reset(): void;
}

const DEFAULT_WITHIN_MS = 60_000; // 1 minute
const DEFAULT_COOLDOWN_MS = 300_000; // 5 minutes

export function createRuleMatcher(initialRules: WidgetRule[] = []): RuleMatcher {
  let rules: WidgetRule[] = [...initialRules];
  const state = new Map<string, RuleState>();

  // Compiled regex cache — prevents ReDoS-prone patterns from reaching the
  // engine and prevents re-compilation on every event (hot path).
  // See TEKNIK-IYILESTIRME-PLANI.md §1.2.
  const compileRegex = createRegexCache((pattern, reason) => {
    console.warn('[Browsonic] Widget rule regex rejected:', reason, '/', pattern);
  });

  function getState(ruleId: string): RuleState {
    let s = state.get(ruleId);
    if (!s) {
      s = { hits: [], lastTriggeredAt: 0 };
      state.set(ruleId, s);
    }
    return s;
  }

  function matchesRule(event: BrowsonicEvent, currentUrl: string, rule: WidgetRule): boolean {
    const { match } = rule;

    // Type filter
    if (match.type && match.type.length > 0) {
      if (!match.type.includes(event.type)) return false;
    }

    // Level filter
    if (match.level && match.level.length > 0) {
      if (!match.level.includes(event.level)) return false;
    }

    // Message pattern (regex) — safe compile + cache
    if (match.messagePattern) {
      const re = compileRegex(match.messagePattern);
      if (!re || !re.test(event.message)) return false;
    }

    // URL pattern (regex) — safe compile + cache
    if (match.urlPattern) {
      const re = compileRegex(match.urlPattern);
      if (!re || !re.test(currentUrl)) return false;
    }

    return true;
  }

  function check(event: BrowsonicEvent, currentUrl: string): RuleMatchResult | null {
    const now = Date.now();

    for (const rule of rules) {
      // Skip disabled rules
      if (rule.enabled === false) continue;

      // Check cooldown — don't re-trigger too soon
      const ruleState = getState(rule.id);
      const cooldown = rule.cooldownMs ?? DEFAULT_COOLDOWN_MS;
      if (cooldown > 0 && ruleState.lastTriggeredAt > 0) {
        if (now - ruleState.lastTriggeredAt < cooldown) continue;
      }

      // Check if event matches rule conditions
      if (!matchesRule(event, currentUrl, rule)) continue;

      // Record hit
      ruleState.hits.push(now);

      // Prune old hits outside the time window
      const withinMs = rule.match.withinMs ?? DEFAULT_WITHIN_MS;
      const windowStart = now - withinMs;
      ruleState.hits = ruleState.hits.filter((t) => t >= windowStart);

      // Check minCount threshold
      const minCount = rule.match.minCount ?? 1;
      if (ruleState.hits.length >= minCount) {
        // Triggered!
        ruleState.lastTriggeredAt = now;
        ruleState.hits = []; // Reset hits after trigger

        return {
          rule,
          notification: rule.notification,
        };
      }
    }

    return null;
  }

  function addRules(newRules: WidgetRule[]): void {
    // Merge: replace existing rules by id, add new ones
    const ruleMap = new Map(rules.map((r) => [r.id, r]));
    for (const r of newRules) {
      ruleMap.set(r.id, r);
    }
    rules = Array.from(ruleMap.values());
  }

  function ruleCount(): number {
    return rules.length;
  }

  function reset(): void {
    state.clear();
  }

  return { check, addRules, ruleCount, reset };
}
