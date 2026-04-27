/**
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import { uuid, timestamp } from '../utils';

/**
 * Telemetry entry categories
 */
export type TelemetryCategory = 'console' | 'network' | 'navigation' | 'visitor';

/**
 * Base telemetry entry
 */
export interface TelemetryEntry {
  id: string;
  timestamp: string;
  category: TelemetryCategory;
  data: unknown;
}

/**
 * Console telemetry entry data
 */
export interface ConsoleTelemetryData {
  level: 'log' | 'debug' | 'info' | 'warn' | 'error';
  message: string;
  stack?: string | null;
}

/**
 * Network telemetry entry data
 */
export interface NetworkTelemetryData {
  method: string;
  url: string;
  statusCode: number;
  statusText: string;
  duration: number;
  type: 'fetch' | 'xhr';
}

/**
 * Navigation telemetry entry data
 */
export interface NavigationTelemetryData {
  from: string;
  to: string;
  type: 'pushState' | 'replaceState' | 'popstate' | 'hashchange';
}

/**
 * Visitor telemetry entry data
 */
export interface VisitorTelemetryData {
  action: 'click' | 'input';
  element: {
    tag: string;
    /** Element text content (for buttons, links) - max 500 chars */
    text?: string;
    /** Element attributes (up to 10, excludes sensitive values) */
    attributes: Record<string, string>;
    value?: {
      length: number;
      pattern:
        | 'empty'
        | 'email'
        | 'numeric'
        | 'alpha'
        | 'alphanumeric'
        | 'whitespace'
        | 'characters';
    };
  };
}

/**
 * Telemetry timeline snapshot for event payload
 */
export interface TelemetryTimeline {
  console: Array<{ timestamp: string } & ConsoleTelemetryData>;
  network: Array<{ timestamp: string } & NetworkTelemetryData>;
  navigation: Array<{ timestamp: string } & NavigationTelemetryData>;
  visitor: Array<{ timestamp: string } & VisitorTelemetryData>;
}

/**
 * Telemetry Store interface.
 *
 * `pause()`/`resume()` were added in 0.3.0 to support Critical Path mode
 * (PERFORMANS-STRATEJISI.md §5). While paused, `add()` is a no-op —
 * breadcrumbs are not accumulated. Existing entries are retained and
 * remain queryable via `getTimeline()`.
 */
export interface TelemetryStore {
  add(entry: Omit<TelemetryEntry, 'id' | 'timestamp'>): void;
  getRecent(count?: number): TelemetryEntry[];
  getTimeline(): TelemetryTimeline;
  clear(): void;
  size(): number;
  /** Pause breadcrumb accumulation (Critical Path mode). */
  pause(): void;
  /** Resume breadcrumb accumulation. */
  resume(): void;
  /** Query pause state. */
  isPaused(): boolean;
}

/**
 * Create a telemetry store with ring buffer implementation
 * FIFO (First In, First Out) - oldest entries are dropped when maxSize is reached
 */
export function createTelemetryStore(maxSize: number = 30): TelemetryStore {
  // Ring buffer implementation
  const buffer: TelemetryEntry[] = [];
  let head = 0; // Points to the oldest entry (next to be overwritten)
  let count = 0;
  let paused = false;

  return {
    /**
     * Add a new telemetry entry.
     * O(1) time complexity. No-op when the store is paused (Critical Path).
     */
    add(entry: Omit<TelemetryEntry, 'id' | 'timestamp'>): void {
      if (paused) return;

      const fullEntry: TelemetryEntry = {
        id: uuid(),
        timestamp: timestamp(),
        ...entry,
      };

      if (count < maxSize) {
        // Buffer not full yet, just push
        buffer.push(fullEntry);
        count++;
      } else {
        // Buffer full, overwrite oldest entry
        buffer[head] = fullEntry;
        head = (head + 1) % maxSize;
      }
    },

    /**
     * Get recent entries (newest first)
     * @param limit - max entries to return (default: all)
     */
    getRecent(limit?: number): TelemetryEntry[] {
      if (count === 0) return [];

      const result: TelemetryEntry[] = [];
      const actualLimit = limit !== undefined ? Math.min(limit, count) : count;

      if (count < maxSize) {
        // Buffer not full, entries are in order
        for (let i = count - 1; i >= 0 && result.length < actualLimit; i--) {
          result.push(buffer[i]);
        }
      } else {
        // Buffer is full, need to handle wrap-around
        // Newest entry is at (head - 1 + maxSize) % maxSize
        let idx = (head - 1 + maxSize) % maxSize;
        for (let i = 0; i < actualLimit; i++) {
          result.push(buffer[idx]);
          idx = (idx - 1 + maxSize) % maxSize;
        }
      }

      return result;
    },

    /**
     * Get telemetry timeline grouped by category
     * For inclusion in event payload
     */
    getTimeline(): TelemetryTimeline {
      const entries = this.getRecent();

      const timeline: TelemetryTimeline = {
        console: [],
        network: [],
        navigation: [],
        visitor: [],
      };

      // Entries are in reverse order (newest first), we want chronological (oldest first)
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        const baseData = { timestamp: entry.timestamp };

        switch (entry.category) {
          case 'console':
            timeline.console.push({
              ...baseData,
              ...(entry.data as ConsoleTelemetryData),
            });
            break;
          case 'network':
            timeline.network.push({
              ...baseData,
              ...(entry.data as NetworkTelemetryData),
            });
            break;
          case 'navigation':
            timeline.navigation.push({
              ...baseData,
              ...(entry.data as NavigationTelemetryData),
            });
            break;
          case 'visitor':
            timeline.visitor.push({
              ...baseData,
              ...(entry.data as VisitorTelemetryData),
            });
            break;
        }
      }

      return timeline;
    },

    /**
     * Clear all entries
     */
    clear(): void {
      buffer.length = 0;
      head = 0;
      count = 0;
    },

    /**
     * Get current entry count
     */
    size(): number {
      return count;
    },

    pause(): void {
      paused = true;
    },

    resume(): void {
      paused = false;
    },

    isPaused(): boolean {
      return paused;
    },
  };
}
