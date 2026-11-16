# TailorPro — TESTING.md

Actual commands and actual results only. Anything not run is listed under "Not run". Last updated: Phase 1, Checkpoint A (2026-11-16).

## How to run (local, needs Docker)
```
npm install
npm run db:start          # local Supabase stack (Postgres, Auth, REST)
npm run db:reset          # apply all migrations from scratch
npm run db:test           # pgTAP database tests
npm run test:integration  # Vitest over the real HTTP path
npm run typecheck
npm audit
npm run db:stop
```
`supabase/.env` holds dummy Google values for local runs (git-ignored; see `.env.example`).

## Results at Checkpoint A
| Suite | Command | Result |
|---|---|---|
| Database (pgTAP): catalog, tenancy, functions | `npm run db:test` | **100 tests, 3 files, PASS** |
| Integration (Auth -> JWT -> PostgREST -> Postgres) | `npm run test:integration` | **21 tests, PASS** |
| Type check | `npm run typecheck` | PASS |
| Dependency audit | `npm audit` | 0 vulnerabilities (after upgrading vitest 3.2.7 to 5.1.0, which had 2 critical advisories in dev tooling) |

### What the tests cover
- **Catalog (`00_catalog`)**: all Phase 1 tables exist; RLS enabled and forced on every public table; `anon` holds no table privilege; `authenticated` holds SELECT only; `platform_admins` has no API grants; a table or function created later is closed to `anon`/`authenticated` by default; `anon` can execute no function; `authenticated` can execute exactly `create_business`, `update_business`, `update_profile`; `private` schema closed to `anon`; every SECURITY DEFINER function pins an empty `search_path`.
- **Tenancy (`10_tenancy`)**: Business A cannot read, insert into, update, delete from or truncate Business B's data; no direct writes at all; staff without permission cannot read audit logs or update the business; removed membership revokes access immediately; platform admin reads no tenant data; one active owner per workspace; audit log rejects UPDATE/DELETE/TRUNCATE even for the table owner; a business with members cannot be hard-deleted.
- **Functions (`20_business_functions`)**: registration validation (11 invalid-input cases), phone normalisation, defaults (MWK, MW, Africa/Blantyre), owner membership, free subscription, audit entry without phone or email, idempotent replay (no second business, member, subscription or audit row), another user cannot claim an existing id, markup stored as inert text, update with optimistic version (stale write rejected), staff permission via `settings.manage`, profile update for the caller only.
- **Integration (`registration.test.ts`)**: ES256 JWT from email one-time-code sign-in; tampered token rejected (401); Google redirect wiring; registration over HTTP; 3 parallel duplicate submissions create one business; unauthenticated rejected; validation errors return HTTP 400; cross-tenant reads return nothing; direct writes return 403; function-level takeover attempts return 403; `private` schema and `platform_admins` not exposed; audit log cannot be edited; stale version returns HTTP 409.

### Evidence that the tests can fail (mutation checks, run once)
| Deliberate weakening | Result |
|---|---|
| `GRANT UPDATE ON businesses TO authenticated` | caught: catalog test 12 and tenancy tests 9 and 10 failed |
| Replace the business-read policy with `USING (true)` | caught: 6 tenancy and function tests failed (own-only reads, staff, removed member, platform admin, setup count) |
| Before the migrations existed | all suites failed for the expected reasons: missing tables and functions; default privileges open (tests 14 to 18 failed, confirming Supabase's open defaults) |

### Defects found by the tests and fixed
1. `update_business` crashed on `array || 'literal'` (SQL test).
2. A stale-version update returned HTTP 500, indistinguishable from a server error (integration test). It now raises `PT409`, which PostgREST returns as HTTP 409.

## Not run (do not read as passed)
- **GitHub Actions CI**: written (`.github/workflows/ci.yml`) but never executed; the first push will be its first run.
- **Real Google sign-in**: needs an owner-created OAuth client. Only the redirect is tested.
- **Email delivery** through a real SMTP sender; the local one-time code is minted through the admin API.
- **Offline, service-worker and end-to-end (Playwright) tests for the product app**: the app shell does not exist yet (Checkpoint C). Spike results are in `spikes/*/README.md` and are not product tests.
- **Cross-tenant tests for storage, sync and later tables**: those tables do not exist yet.
- **Rate-limit behaviour, XSS rendering in the UI, log-redaction tests**: Checkpoints B and C.
- **Hosted (staging) Supabase and Cloudflare**: not created yet.
