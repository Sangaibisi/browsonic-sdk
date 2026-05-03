/**
 * ESLint flat config (ESLint 9+).
 *
 * Scoping:
 *   - Type-checked rules apply ONLY to `src/**\/*.ts`.
 *   - Tests / bench / scripts / e2e use the non-type-checked preset
 *     (faster, and they freely use `any` / `!` / etc.).
 *   - Artifacts (dist, coverage, bundles, reports) are ignored entirely.
 *
 * Banned patterns in src (regression-proof):
 *   - non-null assertion (`!`)
 *   - `any`
 *   - unused vars
 */
import tseslint from 'typescript-eslint';
import js from '@eslint/js';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'bench-results.json',
      'bench-baseline.json',
      'e2e/fixtures/demo-app/sdk.bundle.js',
      'e2e/fixtures/demo-app/sdk.bundle.min.js',
      'e2e/fixtures/demo-app/*.map',
      'playwright-report/**',
      'test-results/**',
      'e2e-results/**',
      '**/*.html',
    ],
  },

  js.configs.recommended,

  // Type-checked preset — SRC ONLY.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Sprint 5 promoted: non-null assertions are a banned pattern
      // (regression source in 0.2.x — see CRIT-001). All existing sites
      // refactored to capture-into-local-const pattern in src/collectors/
      // and src/sentinel.ts. New occurrences fail CI.
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Sprint 6 promote: src/ has zero `any` usage; gate catches new ones.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Pragmatic relaxations for browser-API wrapping code.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-this-alias': 'off', // xhr collector uses `const xhr = this`
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',

      // Tone down non-critical noise.
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // Non-type-checked preset for everything else.
  {
    files: [
      'src/**/*.test.ts',
      'bench/**/*.ts',
      'scripts/**/*.{ts,mjs,js}',
      'e2e/**/*.ts',
      'e2e/**/*.mjs',
    ],
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  }
);
