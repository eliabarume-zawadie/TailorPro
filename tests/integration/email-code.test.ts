// The real email one-time-code path through the AuthAdapter, using the local mail catcher.
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { AuthAdapterError } from '../../src/auth/adapter';
import { SupabaseAuthAdapter } from '../../src/auth/supabase-adapter';
import { ANON, API, rest, waitForCode } from './helpers';

const newAdapter = () => new SupabaseAuthAdapter(createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
const freshEmail = (l: string) => `${l}-${crypto.randomUUID().slice(0, 8)}@example.test`;
const kindOf = async (p: Promise<unknown>) => { try { await p; return 'no error'; } catch (e) { return e instanceof AuthAdapterError ? e.kind : `unexpected: ${String(e)}`; } };

describe('email one-time-code sign-in', () => {
  it('signs a new user in with the emailed code and creates their profile', async () => {
    const a = newAdapter();
    const email = freshEmail('new');
    const t0 = Date.now() - 1000;
    await a.requestEmailCode(email);
    const code = await waitForCode(email, t0);
    expect(code).toMatch(/^\d{6}$/);
    const session = await a.verifyEmailCode(email, code);
    expect(session.user.email).toBe(email);
    expect(session.accessToken.split('.')).toHaveLength(3);
    expect((await a.getSession())?.user.id).toBe(session.user.id);
    const profile = await rest(session.accessToken, `profiles?id=eq.${session.user.id}&select=email`);
    expect(profile.body).toEqual([{ email }]);
  });

  it('rejects a wrong code', async () => {
    const a = newAdapter();
    const email = freshEmail('wrong');
    const t0 = Date.now() - 1000;
    await a.requestEmailCode(email);
    const real = await waitForCode(email, t0);
    const wrong = real === '000000' ? '111111' : '000000';
    expect(await kindOf(a.verifyEmailCode(email, wrong))).toBe('invalid_code');
    expect(await a.getSession()).toBeNull();
  });

  it('rejects a code that was already used', async () => {
    const a = newAdapter();
    const email = freshEmail('reuse');
    const t0 = Date.now() - 1000;
    await a.requestEmailCode(email);
    const code = await waitForCode(email, t0);
    await a.verifyEmailCode(email, code);
    expect(await kindOf(newAdapter().verifyEmailCode(email, code))).toBe('invalid_code');
  });

  it('rate-limits repeated code requests to the same address', async () => {
    const a = newAdapter();
    const email = freshEmail('limit');
    await a.requestEmailCode(email);
    expect(await kindOf(a.requestEmailCode(email))).toBe('rate_limited');
  });

  it('rejects a malformed email before or at the server', async () => {
    expect(await kindOf(newAdapter().requestEmailCode('not-an-email'))).toBe('invalid_email');
  });

  it('signs out', async () => {
    const a = newAdapter();
    const email = freshEmail('out');
    const t0 = Date.now() - 1000;
    await a.requestEmailCode(email);
    await a.verifyEmailCode(email, await waitForCode(email, t0));
    await a.signOut();
    expect(await a.getSession()).toBeNull();
  });
});
