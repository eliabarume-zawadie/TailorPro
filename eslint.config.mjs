import next from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default [
  ...next,
  ...nextTs,
  {
    // i18n (Decision K, AD-6): user-facing text lives in src/i18n, never in components. Text children of JSX elements
    // must come from the catalog. Attribute values are not covered; reviewers still check aria-label and similar.
    files: ['app/**/*.tsx', 'src/**/*.tsx'],
    rules: { 'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }] },
  },
  { ignores: ['out/**', '.next/**', 'spikes/**', 'node_modules/**', 'next-env.d.ts'] },
];
