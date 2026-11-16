# Spike 1: offline app shell on a Next.js static export

Throwaway proof for ARCHITECTURE.md AD-2 / ZERO_BUDGET_REVIEW.md Z-1. Not product code.

Run: `npm install`, `npx playwright install chromium`, `npm run build`, `npm test`.

## Result (2026-11-16)
PASS in headless Chromium on Windows, with these checks: service worker installs; offline cold start in a fresh page; customer written to IndexedDB (Dexie) with an outbox row in one transaction; hard navigation to a second exported route offline; all pages closed and reopened offline with the data intact; unknown deep link offline falls back to the shell.

## Finding fixed during the spike
Exported routes are stored as `/route/index.html` but requested as `/route/`. The first service worker version served the home page for `/customers/` while offline. Fixed by mapping a trailing-slash path to `index.html` in the fetch handler.

## Not proven (do not over-claim)
- Desktop headless Chromium only. PRD section 11 requires a real mid-range Android device before any offline-reliability claim.
- No installed-PWA (standalone) test, no iOS test, no device restart, no storage-eviction test.
- Unknown deep links currently fall back to the home page; a proper offline "not found" screen is Phase 1 work.
- Service worker update flow (new version while old tabs are open) is untested.

## Update: service-worker update flow and schema upgrade with an old tab open (2026-11-16) — `tests/update.spec.ts`
Method: build v1 (`dist-v1`) and v2 (`dist-v2`: new heading + Dexie `version(2)` adding an index); a switchable static server stands in for "deploy v2 while a user has v1 open"; headless Chromium.
Results (PASS, with these observed behaviours):
- The new service worker installs on `registration.update()` and, because the worker calls `skipWaiting()` + `clients.claim()`, **takes over the already-open v1 tab immediately** (`controllerchange`). The old tab keeps running v1 JS while the cache is now v2. No prompt, no consistent-version guarantee.
- Old shell cache is deleted on activate; a fresh offline cold start serves v2 with data intact.
- **Additive Dexie upgrade with an old tab open works:** a v2 tab upgraded IndexedDB 1 -> 2 (verified: DB version 20, new `createdAt` index present) while the v1 tab held a connection; the v1 tab then saved a customer successfully (count 2, outbox 2, visible from the fresh tab). No page errors.
## Not proven / risks for Phase 1
- Only an **additive** schema change was tested. A destructive change (removing/renaming a store, data migration) with an old tab open was not; assume it can fail and design for it: a `versionchange` handler that closes the DB and forces a reload, plus a visible "update available, reload" banner instead of silent takeover.
- The old tab running v1 JS after the cache switch was not tested for lazy-loaded chunks or client-side navigation (hashed chunk names from v1 no longer exist in the v2 cache; offline this would fail). Needs a test with a multi-route app.
- Behind a CDN, `sw.js` must be served with `Cache-Control: no-cache`; real Cloudflare caching behaviour untested.
- Update while the outbox has pending operations and a sync in flight: untested.
