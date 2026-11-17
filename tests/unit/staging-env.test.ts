// The staging/production build embeds NEXT_PUBLIC_* values into code that every visitor downloads.
// The guard must refuse anything that would leak a secret or point the hosted app at a developer machine.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const jwt = (role: string) => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64url')}.signature`;
// a deliberately minimal environment (only PATH plus what the case sets), so nothing from this machine leaks in
const run = (env: Record<string, string | undefined>) => {
  const r = spawnSync('node', ['scripts/staging-env.mjs'], { env: { PATH: process.env.PATH, ...env } as unknown as NodeJS.ProcessEnv, encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const url = 'https://abcdefghijklmnopqrst.supabase.co';

describe('staging environment guard', () => {
  it('accepts a hosted URL with a public anon key', () => {
    expect(run({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }).code).toBe(0);
  });
  it('accepts a new-style publishable key', () => {
    expect(run({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_abc123' }).code).toBe(0);
  });
  it('refuses a service-role key: it would give every visitor full database access', () => {
    const r = run({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('service_role') });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/service_role/i);
    expect(r.out).not.toContain(jwt('service_role')); // never echo the key
  });
  it('refuses a new-style secret key', () => {
    const r = run({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_abc123' });
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('sb_secret_abc123');
  });
  it.each([['http://127.0.0.1:54321'], ['http://localhost:54321'], ['http://abcdefghijklmnopqrst.supabase.co']])('refuses a non-hosted or non-HTTPS URL: %s', (u) => {
    expect(run({ NEXT_PUBLIC_SUPABASE_URL: u, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt('anon') }).code).toBe(1);
  });
  it('refuses missing values', () => {
    expect(run({}).code).toBe(1);
    expect(run({ NEXT_PUBLIC_SUPABASE_URL: url }).code).toBe(1);
  });
  it('refuses a key that is neither a JWT nor a publishable key', () => {
    expect(run({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'hello' }).code).toBe(1);
  });
});
