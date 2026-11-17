import next from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default [...next, ...nextTs, { ignores: ['out/**', '.next/**', 'spikes/**', 'node_modules/**', 'next-env.d.ts'] }];
