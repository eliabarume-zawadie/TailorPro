'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getLocalStore } from '../data/local-store';
import type { Profile, Workspace } from '../domain/account';
import type { AuthSession } from './adapter';
import { getAuth, getSupabase } from './client';

export type { Profile, Workspace };

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  // stale: the data shown came from this device because the server could not be reached
  | { status: 'signed-in'; session: AuthSession; workspace: Workspace | null; profile: Profile | null; loadError: boolean; stale: boolean };

interface AuthContextValue { state: AuthState; reload: () => Promise<void>; signOut: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | null>(null);

const REQUEST_TIMEOUT_MS = 15_000;
// If the server has not answered after this long, show the saved copy while waiting (flaky connections report "online").
const SLOW_AFTER_MS = 2_000;

type BusinessRow = { id: string; name: string; version: number; location: string; business_type: string; currency: string; timezone: string };
type MemberRow = { role: 'owner' | 'staff'; businesses: BusinessRow | BusinessRow[] | null };

// Reads the caller's workspace and profile. Row level security guarantees only their own rows come back.
async function loadAccount(userId: string): Promise<{ workspace: Workspace | null; profile: Profile | null }> {
  const sb = getSupabase();
  // No automatic retries (they hold the screen for many seconds on a bad connection) and a hard cap on hung requests.
  const cap = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const [members, profile] = await Promise.all([
    sb.from('business_members').select('role, businesses(id, name, version, location, business_type, currency, timezone)').eq('status', 'active').order('created_at').limit(1).retry(false).abortSignal(cap()),
    sb.from('profiles').select('full_name, phone_e164, email, locale').eq('id', userId).retry(false).abortSignal(cap()).maybeSingle(),
  ]);
  if (members.error) throw members.error;
  if (profile.error) throw profile.error;
  const row = (members.data as unknown as MemberRow[])[0];
  const b = row ? (Array.isArray(row.businesses) ? row.businesses[0] : row.businesses) : null;
  return {
    workspace: row && b ? { id: b.id, name: b.name, version: b.version, role: row.role, location: b.location, businessType: b.business_type, currency: b.currency, timezone: b.timezone } : null,
    profile: profile.data ? { fullName: profile.data.full_name, phone: profile.data.phone_e164, email: profile.data.email, locale: profile.data.locale } : null,
  };
}

type Resolved = { account: { workspace: Workspace | null; profile: Profile | null }; stale: boolean } | null;

const fromCache = (c: { workspace: Workspace | null; profile: Profile | null } | undefined): Resolved =>
  c ? { account: { workspace: c.workspace, profile: c.profile }, stale: true } : null;

/**
 * Offline: the saved copy at once. Online: the server's answer (which also refreshes the saved copy); if the server is
 * slow, `onProvisional` receives the saved copy after a couple of seconds and the fresh answer replaces it later.
 * If the server fails, the saved copy is the result. Returns null only when nothing is available.
 * Touches no React state.
 */
async function resolveAccount(userId: string, onProvisional: (r: Resolved) => void): Promise<Resolved> {
  const store = getLocalStore();
  const cachedP = Promise.resolve(store?.getAccount(userId)).catch(() => undefined);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return fromCache(await cachedP);

  let settled = false;
  const freshP: Promise<Resolved> = loadAccount(userId).then(
    (fresh) => { settled = true; void store?.saveAccount({ userId, ...fresh }).catch(() => undefined); return { account: fresh, stale: false }; },
    async () => { settled = true; return fromCache(await cachedP); },
  );
  setTimeout(() => {
    if (settled) return;
    void cachedP.then((c) => { const r = fromCache(c); if (r && !settled) onProvisional(r); });
  }, SLOW_AFTER_MS);
  return freshP;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  const [account, setAccount] = useState<{ userId: string; workspace: Workspace | null; profile: Profile | null; loadError: boolean; stale: boolean } | null>(null);

  // Session: initial read plus changes. The listener only stores the session; it never calls the API
  // (calling Supabase inside the auth callback can deadlock).
  useEffect(() => {
    const auth = getAuth();
    let alive = true;
    void auth.getSession().then((s) => { if (alive) setSession(s); });
    const off = auth.onChange((s) => { if (alive) setSession(s); });
    return () => { alive = false; off(); };
  }, []);

  const userId = session?.user.id;
  type Account = { userId: string; workspace: Workspace | null; profile: Profile | null; loadError: boolean; stale: boolean };
  const apply = useCallback((id: string, resolved: Resolved) => {
    setAccount((prev: Account | null) => {
      if (resolved) return { userId: id, ...resolved.account, loadError: false, stale: resolved.stale };
      // nothing available: keep whatever was known for the same user and flag the error
      const same = prev?.userId === id;
      return { userId: id, workspace: same ? prev.workspace : null, profile: same ? prev.profile : null, loadError: true, stale: false };
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void resolveAccount(userId, (p) => { if (alive) apply(userId, p); }).then((r) => { if (alive) apply(userId, r); });
    return () => { alive = false; };
  }, [userId, apply]);

  const reload = useCallback(async () => {
    if (userId) apply(userId, await resolveAccount(userId, (p) => apply(userId, p)));
  }, [userId, apply]);

  // No session (signed out, or the server rejected the refresh token): remove everything cached on this device.
  useEffect(() => {
    if (session === null) void getLocalStore()?.clearAll().catch(() => undefined);
  }, [session]);

  const signOut = useCallback(async () => { await getAuth().signOut(); }, []);

  const state: AuthState = useMemo(() => {
    if (session === undefined) return { status: 'loading' };
    if (session === null) return { status: 'signed-out' };
    // signed in but this user's account data is not loaded yet: still loading
    if (account === null || account.userId !== session.user.id) return { status: 'loading' };
    return { status: 'signed-in', session, workspace: account.workspace, profile: account.profile, loadError: account.loadError, stale: account.stale };
  }, [session, account]);

  const value = useMemo(() => ({ state, reload, signOut }), [state, reload, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthState() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthState must be used inside AuthProvider');
  return ctx;
}
