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

// ---- local mail catcher (Mailpit, started by `npm run db:start`) ----
const MAIL_API = 'http://127.0.0.1:54324/api/v1';
/** Waits for a message to `email` and returns the 6-digit sign-in code in it. */
export async function waitForCode(email: string, notBefore = 0): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const list = (await (await fetch(`${MAIL_API}/messages`)).json()) as { messages: { ID: string; To: { Address: string }[]; Created: string }[] };
    const mine = list.messages.filter((m) => m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()) && Date.parse(m.Created) >= notBefore);
    if (mine[0]) {
      const msg = (await (await fetch(`${MAIL_API}/message/${mine[0].ID}`)).json()) as { Text: string };
      const code = /\b(\d{6})\b/.exec(msg.Text)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no sign-in email with a 6-digit code arrived for ${email}`);
}

/** Creates a confirmed user (password grant, so no email is sent and no resend window starts) and registers a business for them. */
export async function seedUserWithBusiness(label: string, businessName: string): Promise<{ email: string; businessId: string }> {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `Pw-${crypto.randomUUID()}`;
  const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' };
  const created = await parse<{ id: string }>(await fetch(`${API}/auth/v1/admin/users`, { method: 'POST', headers: svc, body: JSON.stringify({ email, password, email_confirm: true }) }));
  if (created.status >= 300) throw new Error(`seed user failed: ${created.status}`);
  const tok = await parse<{ access_token: string }>(await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }));
  const businessId = crypto.randomUUID();
  const r = await rpc(tok.body.access_token, 'create_business', { p_id: businessId, p_name: businessName, p_owner_name: 'Seed Owner', p_phone: '+265999000111', p_email: null, p_location: 'Blantyre', p_country: 'MW', p_currency: 'MWK', p_business_type: 'tailoring_shop' });
  if (r.status !== 200) throw new Error(`seed business failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { email, businessId };
}
