import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { type AuthAdapter, AuthAdapterError, type AuthSession } from './adapter';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** How long to wait for the library to produce a session (it may be retrying a token refresh) before using the saved one. */
const SESSION_WAIT_MS = 4000;

function toSession(s: Pick<Session, 'access_token' | 'user'>): AuthSession {
  const meta = (s.user.user_metadata ?? {}) as Record<string, unknown>;
  const name = (meta.full_name ?? meta.name ?? '') as string;
  return { accessToken: s.access_token, user: { id: s.user.id, email: s.user.email ?? null, fullName: typeof name === 'string' ? name : '' } };
}

type SupaError = { name?: string; status?: number; code?: string; message?: string };
function mapError(e: SupaError, during: 'request' | 'verify'): AuthAdapterError {
  const code = e.code ?? '';
  if (e.status === 429 || code.includes('rate_limit')) return new AuthAdapterError('rate_limited');
  if (e.name === 'AuthRetryableFetchError' || e.status === 0 || e.status === undefined) return new AuthAdapterError('network');
  if (during === 'verify' && (code === 'otp_expired' || code === 'invalid_credentials' || e.status === 403 || e.status === 400)) return new AuthAdapterError('invalid_code');
  if (during === 'request' && (code === 'email_address_invalid' || code === 'validation_failed')) return new AuthAdapterError('invalid_email');
  // Never put the provider's message in logs or UI by default: it can echo the email address.
  return new AuthAdapterError('unknown');
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export class SupabaseAuthAdapter implements AuthAdapter {
  /** `storageKey` is where the client keeps the session, so the adapter can read it when the network is unavailable. */
  constructor(private readonly client: SupabaseClient, private readonly storageKey?: string) {}

  /** The session as saved on this device. It may have an expired access token; the library refreshes it once online. */
  private readStored(): AuthSession | null {
    if (!this.storageKey || typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const s = JSON.parse(raw) as Partial<Session>;
      return s.access_token && s.user ? toSession(s as Session) : null;
    } catch { return null; }
  }

  async getSession() {
    // Offline there is nothing to refresh against: waiting would just hold the screen on "Loading".
    if (isOffline()) return this.readStored();

    const live = this.client.auth.getSession().then(({ data }) => (data.session ? toSession(data.session) : null), () => null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<'slow'>((resolve) => { timer = setTimeout(() => resolve('slow'), SESSION_WAIT_MS); });
    const result = await Promise.race([live, slow]);
    clearTimeout(timer);
    if (result === 'slow') return this.readStored();
    // The library returns no session both when it was rejected (it then removes the stored one) and when the network
    // failed during a refresh (the stored one stays). Only the second case should keep the user signed in.
    return result ?? this.readStored();
  }

  onChange(listener: (session: AuthSession | null) => void) {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => listener(session ? toSession(session) : null));
    return () => data.subscription.unsubscribe();
  }

  async signInWithGoogle(redirectTo: string) {
    const { error } = await this.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw mapError(error, 'request');
  }

  async requestEmailCode(email: string) {
    const e = email.trim();
    if (!EMAIL.test(e)) throw new AuthAdapterError('invalid_email');
    const { error } = await this.client.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } });
    if (error) throw mapError(error, 'request');
  }

  async verifyEmailCode(email: string, code: string) {
    const { data, error } = await this.client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error || !data.session) throw error ? mapError(error, 'verify') : new AuthAdapterError('invalid_code');
    return toSession(data.session);
  }

  async signOut() {
    // Revoke on the server when possible; if the server cannot be reached, still end the session on this device.
    const { error } = isOffline() ? { error: new Error('offline') } : await this.client.auth.signOut();
    if (error) await this.client.auth.signOut({ scope: 'local' });
  }
}
