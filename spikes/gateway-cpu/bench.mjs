// Spike 3: estimate CPU cost of the thin gateway's per-request work.
// CAVEAT: Node on a dev PC, not workerd on Cloudflare. This is an ESTIMATE, not the 10 ms limit test.
import { SignJWT, jwtVerify, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import { Hono } from 'hono';

const N = 2000;
const enc = new TextEncoder();
const claims = { sub: crypto.randomUUID(), role: 'authenticated', aud: 'authenticated' };

const hsKey = enc.encode('super-secret-jwt-token-with-at-least-32-characters-long');
const hsJwt = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(hsKey);

const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
const jwks = createLocalJWKSet({ keys: [jwk] });
const esJwt = await new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setExpirationTime('1h').sign(privateKey);

// A realistic sync batch: 50 operations (orders, payments, measurements)
const batch = { device_id: crypto.randomUUID(), ops: Array.from({ length: 50 }, (_, i) => ({
  op_id: crypto.randomUUID(), table: 'payments', entity_id: crypto.randomUUID(),
  payload: { order_id: crypto.randomUUID(), amount_minor: 1500000 + i, currency: 'MWK', method: 'cash', note: 'x'.repeat(80) } })) };
const body = JSON.stringify(batch);

const buckets = new Map();
const app = new Hono();
let currentKey;
app.use('*', async (c, next) => { c.set('verify', currentKey); await next(); });
app.post('/sync', async (c) => {
  const auth = c.req.header('authorization')?.slice(7);
  const { payload } = await jwtVerify(auth, c.get('verify'), { audience: 'authenticated' });
  const key = payload.sub; const now = Date.now();
  const b = buckets.get(key) ?? { n: 0, t: now };
  if (now - b.t > 60000) { b.n = 0; b.t = now; }
  if (++b.n > 1e9) return c.text('rate', 429);
  buckets.set(key, b);
  const json = await c.req.json();
  if (json.ops.length > 100) return c.text('too big', 413);
  return c.json({ ok: true, n: json.ops.length }); // real gateway would forward via fetch (I/O, not CPU)
});

async function measure(label, verifyKey, jwt) {
  const mk = () => new Request('http://x/sync', { method: 'POST', headers: { authorization: 'Bearer ' + jwt, 'content-type': 'application/json' }, body });
  const run = (req) => app.fetch(req, {}, { }); 
  currentKey = verifyKey;
  for (let i = 0; i < 200; i++) await run(mk()); // warmup
  const t0 = process.cpuUsage(); const w0 = performance.now();
  for (let i = 0; i < N; i++) { const r = await run(mk()); if (r.status !== 200) throw new Error(label + ' status ' + r.status); }
  const cpu = process.cpuUsage(t0); const wall = performance.now() - w0;
  console.log(`${label}: CPU ${((cpu.user + cpu.system) / 1000 / N).toFixed(3)} ms/request, wall ${(wall / N).toFixed(3)} ms/request (50-op batch, ${body.length} bytes)`);
}
await measure('HS256 (shared secret)', hsKey, hsJwt);
await measure('ES256 (JWKS asymmetric)', jwks, esJwt);
