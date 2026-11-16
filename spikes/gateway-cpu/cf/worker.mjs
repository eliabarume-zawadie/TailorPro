// Spike gateway for the REAL Cloudflare CPU check. Same work as the production gateway would do:
// JWT verify (ES256 via JWKS) + per-user rate-limit bookkeeping + parse/validate a sync batch. No forwarding.
import { Hono } from 'hono';
import { jwtVerify, createLocalJWKSet } from 'jose';
import jwksJson from './jwks.json';
const jwks = createLocalJWKSet(jwksJson);
const buckets = new Map();
const app = new Hono();
app.onError((e, c) => (e?.code?.startsWith?.('ERR_J') ? c.text('unauthorized', 401) : c.text('error', 500)));
app.post('/ping', (c) => c.text('ok'));
app.post('/sync', async (c) => {
  const token = c.req.header('authorization')?.slice(7);
  const { payload } = await jwtVerify(token, jwks, { audience: 'authenticated' });
  const now = Date.now(); const b = buckets.get(payload.sub) ?? { n: 0, t: now };
  if (now - b.t > 60000) { b.n = 0; b.t = now; } b.n++; buckets.set(payload.sub, b);
  const json = await c.req.json();
  if (!Array.isArray(json.ops) || json.ops.length > 500) return c.text('bad batch', 413);
  let amount = 0; for (const op of json.ops) { if (typeof op.op_id !== 'string') return c.text('bad op', 400); amount += op.payload?.amount_minor ?? 0; }
  return c.json({ ok: true, n: json.ops.length, amount });
});
export default app;
