import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { type AuthAdapter, AuthAdapterError, type AuthSession } from './adapter';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function toSession(s: Session): AuthSession {
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

export class SupabaseAuthAdapter implements AuthAdapter {
  constructor(private readonly client: SupabaseClient) {}

  async getSession() {
    const { data } = await this.client.auth.getSession();
    return data.session ? toSession(data.session) : null;
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
    await this.client.auth.signOut();
  }
}
