# Spike 3: gateway CPU estimate (Z-3, ZB-5)

Throwaway. Run: `npm install`, `node bench.mjs`.

## Result (2026-11-16): ESTIMATE ONLY
Hono handler doing JWT verify + per-user rate-limit check + parse/validate a 50-op, 16 KB sync batch, measured in Node on a dev PC (2000 requests, after warmup):
- HS256: ~1.34 ms CPU/request
- ES256 via JWKS: ~1.58 ms CPU/request (the algorithm local Supabase Auth actually uses)

## Not proven
- This is Node, not workerd on Cloudflare, and the Worker's 10 ms CPU limit was **not** tested. A real check requires deploying to the owner's Cloudflare account and reading CPU time from Workers metrics.
- Excludes the forwarding `fetch` to Supabase (I/O, normally not billed as CPU) and JWKS fetch/caching.
- Rate limiting here is an in-memory toy; real limits need a Cloudflare feature or DB-side limits.
- Indicates headroom (~6x) but does not settle Z-3.

## Update: attempt on workerd via `wrangler dev --local` (2026-11-16) � INCONCLUSIVE for the absolute number
Files: `worker.mjs`, `wrangler.toml`, `workerd-bench.mjs`. Real ES256 JWTs from local Supabase Auth, JWKS fetched and cached per isolate.
- No-op `/ping`: ~8.6 ms CPU/request. `/sync` (JWT + rate limit + 50-op parse): ~9.3 ms. Garbage token correctly returns 401 after a fix (it first returned 500).
- **The absolute figures are not usable.** The no-op route alone costs ~8.6 ms, so they measure the local setup (Miniflare's entry worker and proxying, summed over ~8 workerd processes via Windows `Get-Process`), not the user Worker. I did not find a way to isolate the user Worker locally.
- **Only usable signal:** the marginal cost of the gateway's own work over a no-op is about **0.7 ms** per request, consistent with the Node estimate.
- **Z-3 is still not settled.** The 10 ms CPU limit can only be checked on Cloudflare itself (Workers metrics, CPU time). Do not read the ~9 ms figure as "close to the limit": it is an artefact. Equally, do not read the 1.6 ms Node figure as proof.
- Gotchas: stray `wrangler dev` instances kept listening on the same port and silently answered, which invalidated one run; kill by command line, not by port.

## RESULT: real Cloudflare Workers Free measurement (2026-11-16) — `cf/`
Throwaway Worker deployed to the owner's Cloudflare account (workers.dev), then **deleted** (verified 404). Same work as the planned gateway: ES256 JWT verify via JWKS (throwaway key), per-user rate-limit bookkeeping, parse/validate a sync batch of 50 to 500 ops. No forwarding to Supabase. Source of CPU numbers: `cpuTime` (integer ms) in Cloudflare's own `wrangler tail --format json` events, not client timings.
Load: about 1,000 requests total from Malawi; **tail sampling captured only 197 events**, so the figures below describe that sample.

| Case | n | CPU p50 | p90 | max |
|---|---|---|---|---|
| Warm, 50 ops (15 KB) | 93 | 0 ms | 1 ms | 7 (cold first request) |
| Warm, 100 ops (31 KB) | 19 | 0 | 1 | 1 |
| Warm, 250 ops (78 KB) | 29 | 1 | 1 | 1 |
| Warm, 500 ops (156 KB) | 44 | 1 | 2 | 9 |
| **First requests on a freshly deployed version (cold)** | ~12 | — | — | observed 10, 8, 7, 3, 10, 13, 4, 10 (ms) |

- **Warm path: comfortably inside the 10 ms limit** (p50 0–1 ms, p90 1–2 ms), even at 500-op batches. All 1,000 client requests returned HTTP 200.
- **Cold starts are the risk:** several were 7 to 13 ms of CPU, **above the 10 ms free-tier limit**, yet every captured event had outcome `ok` and returned 200. I do not know whether Cloudflare treats the first request in a new isolate leniently or simply did not enforce it in this sample, so **do not rely on it**. Cold-start cost is mostly the first ES256 key import and module initialisation; a real gateway with more code, rate-limit bindings and forwarding will cost more on first request.
- Conclusion for Z-3: thin gateway is viable for steady-state load. Keep it minimal (no heavy libraries; import the key lazily once per isolate), monitor `exceededCpu` outcomes in Workers metrics during the pilot, and keep the direct-RPC-with-database-limits fallback documented and tested. Sampling and sample size limit confidence; re-measure with the real gateway code before the pilot.
- Supersedes the inconclusive local workerd attempt above.
