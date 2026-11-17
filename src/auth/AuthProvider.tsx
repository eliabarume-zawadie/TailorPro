'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthSession } from './adapter';
import { getAuth, getSupabase } from './client';

export interface Workspace { id: string; name: string; version: number; role: 'owner' | 'staff' }
export interface Profile { fullName: string; phone: string | null; email: string | null; locale: string }

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: AuthSession; workspace: Workspace | null; profile: Profile | null; loadError: boolean };

interface AuthContextValue { state: AuthState; reload: () => Promise<void>; signOut: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | null>(null);

type MemberRow = { role: 'owner' | 'staff'; businesses: { id: string; name: string; version: number } | { id: string; name: string; version: number }[] | null };

// Reads the caller's workspace and profile. Row level security guarantees only their own rows come back.
async function loadAccount(userId: string): Promise<{ workspace: Workspace | null; profile: Profile | null }> {
  const sb = getSupabase();
  const [members, profile] = await Promise.all([
    sb.from('business_members').select('role, businesses(id, name, version)').eq('status', 'active').order('created_at').limit(1),
    sb.from('profiles').select('full_name, phone_e164, email, locale').eq('id', userId).maybeSingle(),
  ]);
  if (members.error) throw members.error;
  if (profile.error) throw profile.error;
  const row = (members.data as unknown as MemberRow[])[0];
  const b = row ? (Array.isArray(row.businesses) ? row.businesses[0] : row.businesses) : null;
  return {
    workspace: row && b ? { id: b.id, name: b.name, version: b.version, role: row.role } : null,
    profile: profile.data ? { fullName: profile.data.full_name, phone: profile.data.phone_e164, email: profile.data.email, locale: profile.data.locale } : null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  const [account, setAccount] = useState<{ userId: string; workspace: Workspace | null; profile: Profile | null; loadError: boolean } | null>(null);

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
  type Account = { userId: string; workspace: Workspace | null; profile: Profile | null; loadError: boolean };
  // A failed load keeps whatever was known for the same user (so the UI does not blank out) and flags the error.
  const apply = useCallback((id: string, result: { workspace: Workspace | null; profile: Profile | null } | null) => {
    setAccount((prev: Account | null) => {
      if (result) return { userId: id, ...result, loadError: false };
      const same = prev?.userId === id;
      return { userId: id, workspace: same ? prev.workspace : null, profile: same ? prev.profile : null, loadError: true };
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    loadAccount(userId).then((r) => { if (alive) apply(userId, r); }, () => { if (alive) apply(userId, null); });
    return () => { alive = false; };
  }, [userId, apply]);

  const reload = useCallback(async () => {
    if (!userId) return;
    try { apply(userId, await loadAccount(userId)); } catch { apply(userId, null); }
  }, [userId, apply]);

  const signOut = useCallback(async () => { await getAuth().signOut(); }, []);

  const state: AuthState = useMemo(() => {
    if (session === undefined) return { status: 'loading' };
    if (session === null) return { status: 'signed-out' };
    // signed in but this user's account data is not loaded yet: still loading
    if (account === null || account.userId !== session.user.id) return { status: 'loading' };
    return { status: 'signed-in', session, workspace: account.workspace, profile: account.profile, loadError: account.loadError };
  }, [session, account]);

  const value = useMemo(() => ({ state, reload, signOut }), [state, reload, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthState() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthState must be used inside AuthProvider');
  return ctx;
}
