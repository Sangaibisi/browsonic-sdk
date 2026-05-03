// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * Dependency detection - identifies JavaScript libraries loaded on the page
 */

export interface DependencyInfo {
  name: string;
  version: string | null;
}

interface LibraryConfig {
  global: string;
  versionPath?: string;
}

const KNOWN_LIBRARIES: Record<string, LibraryConfig> = {
  react: { global: 'React', versionPath: 'version' },
  'react-dom': { global: 'ReactDOM', versionPath: 'version' },
  vue: { global: 'Vue', versionPath: 'version' },
  angular: { global: 'angular', versionPath: 'version' },
  jquery: { global: 'jQuery', versionPath: 'fn.jquery' },
  lodash: { global: '_', versionPath: 'VERSION' },
  underscore: { global: '_', versionPath: 'VERSION' },
  moment: { global: 'moment', versionPath: 'version' },
  dayjs: { global: 'dayjs', versionPath: 'version' },
  axios: { global: 'axios', versionPath: 'VERSION' },
  backbone: { global: 'Backbone', versionPath: 'VERSION' },
  ember: { global: 'Ember', versionPath: 'VERSION' },
  d3: { global: 'd3', versionPath: 'version' },
  three: { global: 'THREE', versionPath: 'REVISION' },
  gsap: { global: 'gsap', versionPath: 'version' },
};

/**
 * Get nested value from object using dot notation path
 */
function getNestedValue(obj: unknown, path: string): string | null {
  try {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') {
        return null;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return typeof current === 'string'
      ? current
      : typeof current === 'number'
        ? String(current)
        : null;
  } catch {
    return null;
  }
}

/**
 * Detect JavaScript libraries loaded on the page
 */
export function detectDependencies(): DependencyInfo[] {
  if (typeof window === 'undefined') return [];

  const detected: DependencyInfo[] = [];
  const windowObj = window as unknown as Record<string, unknown>;

  for (const [name, config] of Object.entries(KNOWN_LIBRARIES)) {
    const lib = windowObj[config.global];

    if (lib) {
      let version: string | null = null;

      if (config.versionPath) {
        version = getNestedValue(lib, config.versionPath);
      }

      detected.push({ name, version });
    }
  }

  return detected;
}

/**
 * Get dependencies as a simple key-value record
 */
export function getDependenciesRecord(): Record<string, string> {
  const deps = detectDependencies();
  const record: Record<string, string> = {};

  for (const dep of deps) {
    if (dep.version) {
      record[dep.name] = dep.version;
    } else {
      record[dep.name] = 'detected';
    }
  }

  return record;
}
