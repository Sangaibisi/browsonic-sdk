// SPDX-License-Identifier: Apache-2.0

/**
 * SDK identity — pinned to the published package name + version.
 * Batch payloads carry these in `batch.sdk`; backend uses them for
 * version adoption dashboards + rejection of unsupported clients.
 *
 * Keep in sync with package.json — bumped together by release tooling.
 */

export const SDK_NAME = '@browsonic/sdk';
export const SDK_VERSION = '2.2.0';
