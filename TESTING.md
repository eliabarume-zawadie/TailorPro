# TailorPro — TESTING.md

Actual commands and actual results only. Anything not run is listed under "Not run". Last updated: Phase 1, Checkpoint B (2026-11-17).

## How to run (local, needs Docker)
```
npm install
npm run db:start          # local Supabase stack (Postgres, Auth, REST, mail catcher)
npm run db:reset          # apply all migrations from scratch
npm run db:test           # pgTAP database tests
npm run test:integration  # Vitest: unit + integration (integration needs the stack)
npm run typecheck
npm run lint
npm run e2e               # builds the static export, then runs Playwright against it
npm audit
npm run db:stop
```
`supabase/.env` holds dummy Google values for local runs (git-ignored; see `.env.example`). `npm run build` writes `.env.local` (git-ignored) from the running stack.

## Results at Checkpoint B
| Suite | Command | Result |
|---|---|---|
| Database (pgTAP): catalog, tenancy, functions | `npm run db:test` | **100 tests, 3 files, PASS** |
| Unit: business schema 23, profile schema and catalog 9 | `npx vitest run tests/unit` | **32 tests, PASS** |
| Integration: registration/isolation over HTTP 21, client-vs-database parity 27, email-code sign-in 6 | `npx vitest run tests/integration` | **54 tests, PASS** |
| End-to-end (Playwright, Chromium, static export + local stack) | `npm run e2e` | **7 tests, PASS** |
| Type check | `npm run typecheck` | PASS |
| Lint (ESLint, Next.js rules) | `npm run lint` | PASS (after fixing 3 real React-effect findings) |
| Dependency audit | `npm audit` | 0 vulnerabilities |

### What the Checkpoint B tests cover
- **Parity (`parity.test.ts`)**: 7 valid and 13 invalid business-registration vectors are run through the client Zod schema and the real `create_business` function. Both must accept and normalise identically, and both must reject the same inputs. The database is also called with raw input directly, as a malicious client could.
- **Email code (`email-code.test.ts`)**: the real flow through the local mail catcher: a new user receives a 6-digit code, signs in, and gets a profile; wrong code rejected; used code rejected; second request within 60 seconds is `rate_limited`; malformed email rejected; sign-out clears the session.
- **End-to-end (`onboarding.spec.ts`)**: new user signs in with an emailed code, is sent to registration, sees all field errors at once, registers (a **double tap creates exactly one business**), lands on the dashboard, stays signed in after reload, signs out and is locked out of `/app/`; returning user goes straight to the dashboard; wrong code message and retry; resend-too-fast message; **markup in the business name renders as text and does not run** (no `window.__xss`, no `<img>` created); Google button navigates to Google; profile edit persists after reload.
- **Catalog test**: every validation message either schema can emit exists in the English catalog.

### Defects found by the tests and fixed (cumulative)
1. `update_business` crashed on `array || 'literal'` (SQL test, Checkpoint A).
2. A stale-version update returned HTTP 500; now `PT409` and HTTP 409 (integration test, Checkpoint A).
3. Type error in the shared Zod helper that Vitest does not check (caught by `tsc`).
4. Lint: three components set React state directly inside effects (callback page, registration prefill, auth provider). Rewritten so the owner-name prefill is derived, the account is keyed by user id, and async loading has a cancel guard.

### Evidence that tests can fail
Checkpoint A mutation checks (database layer, run once):

| Deliberate weakening | Result |
|---|---|
| `GRANT UPDATE ON businesses TO authenticated` | caught: catalog test 12 and tenancy tests 9 and 10 failed |
| Replace the business-read policy with `USING (true)` | caught: 6 tenancy and function tests failed |
| Before the migrations existed | all suites failed for the expected reasons, and tests 14 to 18 confirmed Supabase's open default grants |

Every Checkpoint B test was written first and run red: the unit tests failed with a missing module, the adapter tests failed with a missing module, and all 7 end-to-end tests failed against an empty app before the screens were built. **No mutation check was run on the Checkpoint B tests**, so their sensitivity beyond the red-first run is not independently demonstrated.

## Manual checklist: real Google sign-in (cannot be automated; NOT yet performed)
Prerequisite: the owner creates a Google Cloud OAuth client and its client id and secret are set as `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` (never committed).
1. Open the hosted staging site on a phone-sized browser. Tap **Continue with Google**.
2. Choose a Google account. Expect to return to the app and land on **Set up your business** (new account) or the dashboard (existing).
3. Check the owner-name field is prefilled with the Google name.
4. Reload the page: still signed in. Sign out: back at sign-in.
5. Sign in again with the same Google account: same business appears (no duplicate profile).
6. Cancel at the Google screen: expect the "did not complete" message with a link back to sign-in.
7. Record browser, device, date and result here.

## Not run (do not read as passed)
- **GitHub Actions CI**: the workflow now also runs lint, build and the end-to-end suite, but it has never been executed.
- **Real Google sign-in**: manual checklist above, needs the owner's OAuth client.
- **Email delivery** through a real SMTP sender; only the local mail catcher is tested.
- **Email-code expiry (10 minutes)**, **per-IP verification limits** and **hosted rate limits**: configured, not tested (see `SECURITY.md` section 12.2).
- **Real phone or low-end device, iOS, installed-app mode**: only desktop Chromium was used.
- **Accessibility**: labels, focus order and contrast were designed for but not audited (no axe or manual screen-reader pass yet; planned in Checkpoint C).
- **Offline behaviour of the product app**, service worker and update banner: Checkpoint C. Spike results in `spikes/*/README.md` are not product tests.
- **Cross-tenant tests for storage, sync and later tables**: those tables do not exist yet.
- **Hosted (staging) Supabase and Cloudflare**: not created yet.
