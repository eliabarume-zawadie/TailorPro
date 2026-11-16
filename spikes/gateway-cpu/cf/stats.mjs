// Usage: node cf/stats.mjs <tail.jsonl> [urlSubstring]
// `wrangler tail --format json` prints pretty-printed objects; each top-level object closes with "}" at column 0.
import { readFileSync } from 'node:fs';
const txt = readFileSync(process.argv[2], 'utf8');
const only = process.argv[3] ?? '/sync';
const evs = [];
for (const chunk of txt.split(/^\}\s*$/m)) {
  const t = chunk.trim();
  if (!t.startsWith('{')) continue;
  try { evs.push(JSON.parse(t + '\n}')); } catch { /* ignore a truncated tail */ }
}
const rows = evs.filter((e) => e.event?.request?.url?.includes(only));
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
const cpu = rows.map((e) => e.cpuTime).sort((a, b) => a - b);
const wall = rows.map((e) => e.wallTime).sort((a, b) => a - b);
const outcomes = {};
rows.forEach((e) => (outcomes[e.outcome] = (outcomes[e.outcome] ?? 0) + 1));
const hist = {};
cpu.forEach((c) => (hist[c] = (hist[c] ?? 0) + 1));
console.log(`events matching "${only}": ${rows.length} (of ${evs.length} total); outcomes`, outcomes);
console.log(`cpuTime ms: min ${cpu[0]}  p50 ${q(cpu, 0.5)}  p90 ${q(cpu, 0.9)}  p99 ${q(cpu, 0.99)}  max ${cpu.at(-1)}  mean ${(cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(2)}`);
console.log(`wallTime ms: p50 ${q(wall, 0.5)}  p99 ${q(wall, 0.99)}`);
console.log('cpu histogram (ms:count)', JSON.stringify(hist));

// group by request body size (identifies the batch-size run)
const by = {};
for (const e of rows) { const k = e.event.request.headers['content-length']; (by[k] ??= []).push(e); }
for (const [k, g] of Object.entries(by)) {
  const c = g.map((e) => e.cpuTime).sort((a, b) => a - b); const o = {}; g.forEach((e) => (o[e.outcome] = (o[e.outcome] ?? 0) + 1));
  console.log(`body ${k} bytes: n=${g.length} cpu p50 ${q(c, .5)} p90 ${q(c, .9)} max ${c.at(-1)} outcomes ${JSON.stringify(o)}`);
}

// first vs later requests per deployed version (cold start vs warm)
const byVer = {};
for (const e of rows.sort((a, b) => a.eventTimestamp - b.eventTimestamp)) (byVer[e.scriptVersion.id] ??= []).push(e);
for (const [v, g] of Object.entries(byVer)) console.log(`version ${v.slice(0, 8)}: n=${g.length} cpu by arrival order: ${g.slice(0, 6).map((e) => e.cpuTime).join(',')}${g.length > 6 ? ',...' : ''}`);
