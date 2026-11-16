import { Hono } from 'hono';
import { jwtVerify, createLocalJWKSet } from 'jose';
const app = new Hono();
const buckets = new Map();
app.post('/ping', (c) => c.text('ok'));
app.post('/parse', async (c) => { const j = await c.req.json(); return c.json({ n: j.ops.length }); });
app.onError((e, c) => (e?.code?.startsWith?.('ERR_J') ? c.text('unauthorized', 401) : c.text('error', 500)));
let jwks;
app.post('/sync', async (c) => {
  jwks ??= createLocalJWKSet(await (await fetch(c.env.JWKS_URL)).json()); // cached per isolate
  const token = c.req.header('authorization')?.slice(7);
  const { payload } = await jwtVerify(token, jwks, { audience: 'authenticated' });
  const now = Date.now(); const b = buckets.get(payload.sub) ?? { n: 0, t: now };
  if (now - b.t > 60000) { b.n = 0; b.t = now; } b.n++; buckets.set(payload.sub, b);
  const json = await c.req.json();
  if (!Array.isArray(json.ops) || json.ops.length > 100) return c.text('bad batch', 413);
  return c.json({ ok: true, n: json.ops.length });
});
export default app;
