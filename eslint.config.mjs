import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts']),
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="eval"]',
          message: 'eval() is forbidden: it defeats the CSP and enables injection.',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  {
    // The structured logger is the one place allowed to write to stdout; every other
    // module must use it so redaction and formatting cannot be bypassed.
    files: ['src/lib/log.ts'],
    rules: { 'no-console': 'off' },
  },
]);
