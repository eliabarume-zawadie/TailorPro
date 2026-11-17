import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthAdapter } from './adapter';
import { SupabaseAuthAdapter } from './supabase-adapter';

// One browser client per page load. Only the public URL and anon key are ever present here (SECURITY.md section 8).
// The session lives in localStorage so the app opens offline; this is a deliberate offline-first trade-off,
// which makes XSS prevention (no raw HTML rendering, no inline scripts) especially important.
let client: SupabaseClient | null = null;
let adapter: AuthAdapter | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).');
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
  }
  return client;
}

export function getAuth(): AuthAdapter {
  adapter ??= new SupabaseAuthAdapter(getSupabase());
  return adapter;
}
