// The entity-relationship diagram (PRD section 6) is generated from the live database, so it cannot drift from the
// migrations. This test fails when the schema changes and docs/erd.md was not regenerated (`npm run docs:erd`).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const generated = () => execFileSync('node', ['scripts/erd.mjs', '--stdout'], { encoding: 'utf8' });

describe('docs/erd.md', () => {
  it('matches the current database schema', () => {
    const onDisk = readFileSync('docs/erd.md', 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(generated().replace(/\r\n/g, '\n'));
  });

  it('shows every public table and the tenancy relationships', () => {
    const erd = generated();
    for (const table of ['profiles', 'businesses', 'business_members', 'platform_admins', 'audit_logs', 'currencies', 'platform_settings', 'subscription_plans', 'subscriptions']) {
      expect(erd, table).toMatch(new RegExp(`\\n  ${table} \\{`));
    }
    expect(erd).toMatch(/business_members \}o--\|\| businesses/);
    expect(erd).toMatch(/subscriptions \}o--\|\| businesses/);
    expect(erd).toMatch(/audit_logs \}o--\|\| businesses/);
    expect(erd).toMatch(/businesses \}o--\|\| currencies/);
  });

  it('marks primary and foreign keys', () => {
    const erd = generated();
    expect(erd).toMatch(/uuid id PK/);
    expect(erd).toMatch(/uuid workspace_id FK/);
  });
});
