import { execSync } from 'node:child_process';

// Reads the running local stack's URL and keys from the Supabase CLI. Fails loudly if the stack is not running.
const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as Record<string, string>;
export const API = status.API_URL ?? 'http://127.0.0.1:54321';
export const ANON = status.ANON_KEY as string;
const SERVICE = status.SERVICE_ROLE_KEY as string;

export interface Reply<T = unknown> { status: number; body: T; headers: Headers }
async function parse<T>(r: Response): Promise<Reply<T>> {
  const text = await r.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: r.status, body: body as T, headers: r.headers };
}

export const authHeaders = (token: string) => ({ apikey: ANON, authorization: `Bearer ${token}`, 'content-type': 'application/json' });

/** Creates a confirmed user and signs in through the real email one-time-code path. Returns the access token and user id. */
export async function signInNewUser(label: string, fullName: string): Promise<{ token: string; userId: string; email: string }> {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' };
  const created = await parse<{ id: string }>(await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: svc, body: JSON.stringify({ email, email_confirm: true, user_metadata: { full_name: fullName } }) }));
  if (created.status >= 300) throw new Error(`create user failed: ${created.status} ${JSON.stringify(created.body)}`);
  const link = await parse<{ email_otp: string }>(await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: svc, body: JSON.stringify({ type: 'magiclink', email }) }));
  const session = await parse<{ access_token: string; user: { id: string } }>(await fetch(`${API}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'email', email, token: link.body.email_otp }) }));
  if (session.status !== 200) throw new Error(`sign-in failed: ${session.status} ${JSON.stringify(session.body)}`);
  return { token: session.body.access_token, userId: session.body.user.id, email };
}

export const rest = (token: string | null, path: string, init: RequestInit & { profile?: string } = {}) =>
  fetch(`${API}/rest/v1/${path}`, { ...init, headers: { ...(token ? authHeaders(token) : { apikey: ANON, 'content-type': 'application/json' }), ...(init.profile ? { 'Accept-Profile': init.profile, 'Content-Profile': init.profile } : {}), prefer: 'return=representation', ...((init.headers as Record<string, string>) ?? {}) } }).then(parse);

export const rpc = (token: string | null, fn: string, args: Record<string, unknown>) => rest(token, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

export function jwtHeader(token: string): { alg: string; kid?: string } {
  return JSON.parse(Buffer.from(token.split('.')[0] as string, 'base64url').toString());
}
