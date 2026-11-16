// Usage: node cf/load.mjs https://<worker>.workers.dev [requests] [opsPerBatch]
import { readFileSync } from 'node:fs';
const [url, N = '300', OPS = '50'] = process.argv.slice(2);
const token = readFileSync('cf/token.txt', 'utf8').trim();
const body = JSON.stringify({ device_id: crypto.randomUUID(), ops: Array.from({ length: +OPS }, (_, i) => ({ op_id: crypto.randomUUID(), table: 'payments', entity_id: crypto.randomUUID(), payload: { order_id: crypto.randomUUID(), amount_minor: 1500000 + i, currency: 'MWK', note: 'x'.repeat(80) } })) });
const codes = {}; const lat = [];
for (let i = 0; i < +N; i++) { const t = performance.now(); const r = await fetch(url + '/sync', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body }); lat.push(performance.now() - t); codes[r.status] = (codes[r.status] ?? 0) + 1; await r.text(); }
lat.sort((a, b) => a - b);
console.log(`ops/batch ${OPS}, ${N} requests, status counts`, codes, `client-side latency p50 ${lat[Math.floor(lat.length / 2)].toFixed(0)} ms, p99 ${lat[Math.floor(lat.length * 0.99)].toFixed(0)} ms (includes network, NOT CPU)`);
