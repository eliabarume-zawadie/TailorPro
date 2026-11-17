// Auth boundary (ZERO_BUDGET_REVIEW AuthAdapter). The app depends on this interface, not on Supabase, so the
// provider can be replaced later (Neon migration playbook) without touching screens or business rules.

export interface AuthUser { id: string; email: string | null; fullName: string }
export interface AuthSession { accessToken: string; user: AuthUser }

export type AuthErrorKind = 'invalid_code' | 'rate_limited' | 'invalid_email' | 'network' | 'unknown';
export class AuthAdapterError extends Error {
  constructor(public readonly kind: AuthErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'AuthAdapterError';
  }
}

export interface AuthAdapter {
  getSession(): Promise<AuthSession | null>;
  /** Subscribes to sign-in and sign-out. Returns an unsubscribe function. */
  onChange(listener: (session: AuthSession | null) => void): () => void;
  /** Starts Google sign-in (navigates away in the browser). */
  signInWithGoogle(redirectTo: string): Promise<void>;
  requestEmailCode(email: string): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<AuthSession>;
  signOut(): Promise<void>;
}
