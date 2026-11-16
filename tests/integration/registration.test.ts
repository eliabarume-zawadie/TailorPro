// Integration tests over the real HTTP path: Supabase Auth -> JWT -> PostgREST -> Postgres (RLS + functions).
// Requires the local stack: `npm run db:start`. These complement the SQL tests in supabase/tests/database,
// which cannot see what the API actually exposes.
import { beforeAll, describe, expect, it } from 'vitest';
import { ANON, API, jwtHeader, rest, rpc, signInNewUser } from './helpers';

type Person = Awaited<ReturnType<typeof signInNewUser>>;
const biz = (id: string, over: Record<string, unknown> = {}) => ({
  p_id: id, p_name: 'Banda Tailoring', p_owner_name: 'Amina Banda', p_phone: '+265 999 123 456', p_email: null,
  p_location: 'Area 25, Lilongwe', p_country: 'MW', p_currency: 'MWK', p_business_type: 'tailor', ...over,
});

let alice: Person;
let bob: Person;
const aliceBiz = crypto.randomUUID();
const bobBiz = crypto.randomUUID();

beforeAll(async () => {
  alice = await signInNewUser('alice', 'Alice Phiri');
  bob = await signInNewUser('bob', 'Bob Mwale');
});

describe('authentication', () => {
  it('issues a verifiable asymmetric JWT after email one-time-code sign-in', () => {
    const h = jwtHeader(alice.token);
    expect(h.alg).toBe('ES256');
    expect(h.kid).toBeTruthy();
  });

  it('creates a profile automatically from the sign-in metadata', async () => {
    const r = await rest(alice.token, `profiles?id=eq.${alice.userId}&select=full_name,email`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ full_name: 'Alice Phiri', email: alice.email }]);
  });

  it('rejects a tampered token', async () => {
    const parts = alice.token.split('.');
    const forged = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: bob.userId, role: 'authenticated', aud: 'authenticated', exp: 9999999999 })).toString('base64url')}.${parts[2]}`;
    const r = await rest(forged, 'businesses');
    expect(r.status).toBe(401);
  });

  it('redirects Google sign-in to Google (wiring only; real login needs a Google OAuth client)', async () => {
    const r = await fetch(`${API}/auth/v1/authorize?provider=google`, { redirect: 'manual', headers: { apikey: ANON } });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.com\//);
  });
});

describe('business registration through the API', () => {
  it('registers a business with MWK, owner membership and a free subscription', async () => {
    const r = await rpc(alice.token, 'create_business', biz(aliceBiz));
    expect(r.status).toBe(200);
    expect(r.body).toBe(aliceBiz);

    const b = await rest(alice.token, `businesses?id=eq.${aliceBiz}&select=name,phone,currency,country,status`);
    expect(b.body).toEqual([{ name: 'Banda Tailoring', phone: '+265999123456', currency: 'MWK', country: 'MW', status: 'active' }]);
    const s = await rest(alice.token, `subscriptions?workspace_id=eq.${aliceBiz}&select=status,subscription_plans(code)`);
    expect(s.body).toEqual([{ status: 'active', subscription_plans: { code: 'free' } }]);
  });

  it('is idempotent: a duplicate submission returns the same workspace and creates nothing new', async () => {
    const again = await Promise.all([1, 2, 3].map(() => rpc(alice.token, 'create_business', biz(aliceBiz))));
    expect(again.map((r) => r.status)).toEqual([200, 200, 200]);
    const all = await rest(alice.token, 'businesses?select=id');
    expect((all.body as unknown[]).length).toBe(1);
    const members = await rest(alice.token, `business_members?workspace_id=eq.${aliceBiz}&select=user_id`);
    expect((members.body as unknown[]).length).toBe(1);
    const created = await rest(alice.token, `audit_logs?workspace_id=eq.${aliceBiz}&action=eq.business.created&select=id`);
    expect((created.body as unknown[]).length).toBe(1);
  });

  it('rejects an unauthenticated registration', async () => {
    const r = await rpc(null, 'create_business', biz(crypto.randomUUID()));
    expect([401, 403]).toContain(r.status);
  });

  it.each([
    ['empty name', { p_name: '' }],
    ['bad phone', { p_phone: '12' }],
    ['bad email', { p_email: 'nope' }],
    ['unsupported currency', { p_currency: 'USD' }],
    ['missing location', { p_location: '   ' }],
  ])('rejects %s with a clear validation error', async (_label, over) => {
    const r = await rpc(bob.token, 'create_business', biz(crypto.randomUUID(), over));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/required|phone|email|currency|enabled/);
  });

  it('keeps markup in business fields as inert text', async () => {
    const r = await rpc(bob.token, 'create_business', biz(bobBiz, { p_name: '<img src=x onerror=alert(1)>' }));
    expect(r.status).toBe(200);
    const b = await rest(bob.token, `businesses?id=eq.${bobBiz}&select=name`);
    expect(b.body).toEqual([{ name: '<img src=x onerror=alert(1)>' }]);
  });
});

describe('tenant isolation through the API', () => {
  it('lets each owner see only their own business', async () => {
    expect(((await rest(alice.token, 'businesses?select=id')).body as { id: string }[]).map((x) => x.id)).toEqual([aliceBiz]);
    expect(((await rest(bob.token, 'businesses?select=id')).body as { id: string }[]).map((x) => x.id)).toEqual([bobBiz]);
  });

  it("cannot read another business by id, nor its members, subscription or audit log", async () => {
    for (const path of [`businesses?id=eq.${bobBiz}`, `business_members?workspace_id=eq.${bobBiz}`, `subscriptions?workspace_id=eq.${bobBiz}`, `audit_logs?workspace_id=eq.${bobBiz}`]) {
      const r = await rest(alice.token, path);
      expect(r.status).toBe(200);
      expect(r.body).toEqual([]);
    }
  });

  it('cannot write tables directly (insert, update, delete)', async () => {
    const ins = await rest(alice.token, 'businesses', { method: 'POST', body: JSON.stringify({ name: 'x', owner_name: 'x', phone: '+265999000', location: 'x', business_type: 'x', created_by: alice.userId }) });
    const upd = await rest(alice.token, `businesses?id=eq.${aliceBiz}`, { method: 'PATCH', body: JSON.stringify({ name: 'renamed' }) });
    const del = await rest(alice.token, `businesses?id=eq.${bobBiz}`, { method: 'DELETE' });
    expect([ins.status, upd.status, del.status]).toEqual([403, 403, 403]);
    const still = await rest(bob.token, `businesses?id=eq.${bobBiz}&select=name`);
    expect(still.body).toEqual([{ name: '<img src=x onerror=alert(1)>' }]);
  });

  it("cannot update or take over another user's workspace through the functions", async () => {
    const upd = await rpc(alice.token, 'update_business', { p_id: bobBiz, p_expected_version: 1, p_name: 'hacked', p_owner_name: 'x', p_phone: '+265999000', p_email: null, p_location: 'x', p_business_type: 'x' });
    expect(upd.status).toBe(403);
    const steal = await rpc(alice.token, 'create_business', biz(bobBiz, { p_name: 'Hijack' }));
    expect(steal.status).toBe(403);
    const intact = await rest(bob.token, `businesses?id=eq.${bobBiz}&select=name,created_by`);
    expect(intact.body).toEqual([{ name: '<img src=x onerror=alert(1)>', created_by: bob.userId }]);
  });

  it('exposes neither the private schema nor platform administrators', async () => {
    const priv = await rest(alice.token, 'is_member', { profile: 'private' });
    expect(priv.status).toBeGreaterThanOrEqual(400);
    const admins = await rest(alice.token, 'platform_admins');
    expect(admins.status).toBe(403);
    const anonRead = await rest(null, 'businesses');
    expect([401, 403]).toContain(anonRead.status);
  });

  it('does not let a user read or edit audit logs', async () => {
    const mine = await rest(alice.token, `audit_logs?workspace_id=eq.${aliceBiz}&select=action,diff`);
    expect((mine.body as { action: string }[]).map((x) => x.action)).toContain('business.created');
    expect(JSON.stringify(mine.body)).not.toMatch(/999/);
    const edit = await rest(alice.token, `audit_logs?workspace_id=eq.${aliceBiz}`, { method: 'PATCH', body: JSON.stringify({ action: 'tampered' }) });
    const wipe = await rest(alice.token, `audit_logs?workspace_id=eq.${aliceBiz}`, { method: 'DELETE' });
    expect([edit.status, wipe.status]).toEqual([403, 403]);
  });
});

describe('business and profile updates', () => {
  it('updates with the current version and rejects a stale one', async () => {
    const args = { p_id: aliceBiz, p_name: 'Banda & Sons', p_owner_name: 'Amina Banda', p_phone: '+265999123456', p_email: 'amina@example.test', p_location: 'Area 25, Lilongwe', p_business_type: 'tailor' };
    const ok = await rpc(alice.token, 'update_business', { ...args, p_expected_version: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body).toBe(2);
    const stale = await rpc(alice.token, 'update_business', { ...args, p_expected_version: 1, p_name: 'stale' });
    expect(stale.status).toBe(409);
    expect(JSON.stringify(stale.body)).toMatch(/version conflict/);
    const now = await rest(alice.token, `businesses?id=eq.${aliceBiz}&select=name,version`);
    expect(now.body).toEqual([{ name: 'Banda & Sons', version: 2 }]);
  });

  it("updates the caller's own profile only", async () => {
    const r = await rpc(alice.token, 'update_profile', { p_full_name: 'Alice P. Phiri', p_phone: '+265 888 000 111', p_locale: 'en' });
    expect(r.status).toBe(204);
    const mine = await rest(alice.token, `profiles?select=full_name,phone_e164`);
    expect(mine.body).toEqual([{ full_name: 'Alice P. Phiri', phone_e164: '+265888000111' }]);
    const bobs = await rest(bob.token, 'profiles?select=full_name');
    expect(bobs.body).toEqual([{ full_name: 'Bob Mwale' }]);
  });
});
