// SPDX-License-Identifier: Apache-2.0

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    // Build artefacts + config files + examples that should not run
    // through the type-aware lint preset (they are not part of the
    // typed src graph; including them forces tsconfig.project to
    // widen and breaks "lint everything" with parser-services errors).
    //
    // `examples/**` is the demo workspace — it has its own tsconfig
    // and its own dependency tree, lives outside the adapter's lint
    // contract.
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'eslint.config.mjs',
      'vitest.config.ts',
      '*.config.{js,mjs,ts}',
      'examples/**',
      'scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      ...reactHooksPlugin.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
);
