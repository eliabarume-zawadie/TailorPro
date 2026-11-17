# TailorPro — TESTING.md

Actual commands and actual results only. Anything not run is listed under "Not run". Last updated: Phase 1, Checkpoint C (2026-11-17).

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
npm run docs:erd          # regenerate docs/erd.md (a test fails if it is stale)
npm audit
npm run db:stop
```
`supabase/.env` holds the Google credentials for local runs (git-ignored; see `.env.example`). `npm run build` writes `.env.local` (git-ignored) from the running stack.

## Results at Checkpoint C
| Suite | Command | Result |
|---|---|---|
| Database (pgTAP): catalog, tenancy, functions | `npm run db:test` | **100 tests, PASS** |
| Unit (12 files): schemas, catalog, components, local store, update detection, activity, staging guard | `npx vitest run tests/unit` | **75 tests, PASS** |
| Integration: registration and isolation over HTTP 21, client/database parity 27, email-code sign-in 6, ERD matches schema 3 | `npx vitest run tests/integration` | **57 tests, PASS** |
| End-to-end (Playwright, Chromium, static export + local stack): onboarding 7, accessibility 3, offline 7, security 5 | `npm run e2e` | **22 tests, PASS; three consecutive full runs passed** |
| Type check | `npm run typecheck` | PASS |
| Lint (ESLint, Next.js rules, no literal text in components) | `npm run lint` | PASS |
| Dependency audit | `npm audit` | 0 vulnerabilities |
| **Total automated tests** | | **254** |

### What Checkpoint C tests cover
- **Design system (`ui.test.tsx`, 17)**: label, hint and error wiring; invalid state; busy buttons; banner roles; badges state meaning in words; empty state; decorative seam; dialog is named, closes on Escape and its button, moves focus in and returns it to the opener; toast announces in a polite live region and expires; an axe run over a composed form.
- **Accessibility in a real browser (`a11y.spec.ts`, 3)**: axe with WCAG 2.1 A and AA rules **including colour contrast** on sign-in (email, code and error states), registration (empty and all errors), dashboard and settings; phone-width layout without sideways scrolling; every control at least 44 px tall.
- **Offline and updates (`offline.spec.ts`, 7)**: after one online visit a brand-new page opens with no network and shows the cached business, profile and recent activity with an "Offline" badge; client-side navigation requests no missing files; an **expired access token does not lock the user out offline**; the sign-in page opens offline and a code request fails with a clear message; sign-out clears the device both online and **offline**; **a new version waits: the banner appears, nothing reloads by itself, reloading applies it and removes the old cache**.
- **Local store (`local-store.test.ts`, 8)**: save, read, overwrite, per-user separation, survives reopening, `clearAll`, activity ordering and per-workspace separation, and the `versionchange` handler closing the connection and notifying the app.
- **Security (`security.spec.ts`, 5)**: every page carries a strict policy (script hashes only, no `unsafe-inline` or `unsafe-eval`, framing and object blocked) and security headers; hashed assets are immutable and the worker file is never cached; the **whole journey runs with zero policy violations**; **injected inline script and inline event handlers are blocked online and when the page is served from the offline cache**.
- **Hosted-build guard (`staging-env.test.ts`, 9)**: refuses a service-role key, a new-style secret key, local or non-HTTPS URLs, missing values and malformed keys, never echoing a key; accepts anon and publishable keys.
- **ERD (`erd.test.ts`, 3)**: `docs/erd.md` equals the diagram generated from the live database and shows all tables, tenancy relationships and keys.
- **Activity (`activity.test.ts`, 4)**: plain-language labels, neutral fallback for unknown actions, times shown in the business timezone with British date order.

(Checkpoint A and B coverage, 100 database, 32+ unit, parity, email-code and onboarding tests, is unchanged and still passing.)

### Defects found by the tests and fixed (cumulative)
1. `update_business` crashed on `array || 'literal'` (SQL test, A).
2. A stale-version update returned HTTP 500; now `PT409` and HTTP 409 (integration test, A).
3. Type error in a shared Zod helper that Vitest does not check (typecheck, B).
4. Three components set React state directly inside effects (lint, B).
5. **Dashboard top bar wrapped Sign out onto its own line at phone width** (found by reading screenshots, C1).
6. **Offline start hung on "Loading" for many seconds**: the Supabase client retries failed requests with back-off, and its session lookup blocks while retrying a token refresh. Fixed with no automatic retries, a cached-first offline path, and an adapter that falls back to the saved session (offline tests, C3).
7. **Signing out offline did nothing**: the library did not end the local session when the server was unreachable. Fixed with a local sign-out fallback (offline test, C3).
8. Date order: plain English gave US-style dates; Malawi uses day-month-year (unit test, C4).
9. **A page served from the offline cache had no security policy**: the worker cached pages under a file path that headers are not attached to, so an injected handler ran offline. Fixed by caching pages under their served address (security test, C5).
10. Zod's validator compilation uses `eval`, which the policy forbids; the browser reported a violation on every page that validated. Fixed with Zod's non-compiling mode (security test, C5).
11. Route-payload requests (`__next.app.__PAGE__.txt`) returned 404 because the export stores them under a different name; the worker now maps them (offline test, C2).
12. Test infrastructure: a Windows path-separator bug in my own switchable test server; a race between page reload and worker activation (reload before the worker is ready can start an uncontrolled page; tests now wait for the worker). Neither was an application defect.

### Evidence that tests can fail (mutation checks, each run once)
| Deliberate weakening | Result |
|---|---|
| `GRANT UPDATE ON businesses TO authenticated` (A) | caught: catalog test 12 and tenancy tests 9, 10 |
| Business-read policy replaced with `USING (true)` (A) | caught: 6 tenancy and function tests |
| Label association broken in `TextField` (C1) | caught by 5 component tests, including the axe check |
| Muted text colour made too pale (C1) | caught: axe `color-contrast` failed the accessibility test |
| A column added to the live database (C7) | caught: ERD test failed; passes again after removal |
| Staging guard changed to accept `service_role` (C6) | caught by 2 guard tests |
| (before implementation) every Checkpoint B and C test | written first and run red for the expected reason |

**No mutation check was run** on the Checkpoint B tests or on the offline, local-store and update-flow tests; those were run red first (they failed before the feature existed), but their sensitivity beyond that is not independently shown.

## Manual checklists (NOT yet performed)
### Real Google sign-in (cannot be automated; credentials are loaded locally)
1. Run `npm run build`, then `node scripts/serve-out.mjs`, and open `http://localhost:3000` (your Google account must be a test user while the consent screen is in Testing).
2. Tap **Continue with Google** and choose the account. Expect to return to the app on **Set up your business** (new) or the dashboard (existing).
3. Check the owner-name field is prefilled with the Google name.
4. Reload: still signed in. Sign out: back at sign-in.
5. Sign in again: the same business appears, no duplicate.
6. Cancel at the Google screen: the "did not complete" message with a way back.
7. Record browser, device, date and result here: *(not yet done)*.

### Accessibility beyond automated checks
Automated rules find only part of the problems. Still to do by a person: keyboard-only walkthrough of every screen; a screen-reader pass (TalkBack on Android); text enlarged to 200 percent; bright-sunlight legibility on a real phone; right-to-left and long-name behaviour. *(not yet done)*

### Real devices
A real mid-range Android phone: install-to-home-screen behaviour, offline after a phone restart, storage eviction, slow and flaky networks (R-11, before Phase 5). *(not yet done)*

## Not run (do not read as passed)
- **GitHub Actions CI**: updated (lint, build, e2e) but never executed.
- **Real Google sign-in**, **email delivery through a real sender**, **code expiry (10 min)**, **per-IP limits and hosted rate limits**: see `SECURITY.md` section 12.2.
- **Anything on hosted Supabase or Cloudflare**: nothing is deployed (`DEPLOYMENT.md`).
- **Backup restore drill**: not done; backups must not be called reliable until it passes.
- **Browsers other than desktop Chromium**; iOS Safari; installed-app mode; service-worker behaviour after a phone restart or under storage pressure.
- **Sign-out with unsynced work**: not applicable yet (no outbox); Phase 5 must warn before clearing the device.
- **Destructive local-database upgrades with an old tab open**: only the close-and-notify behaviour is tested, not a data migration.
- **Cross-tenant tests for storage, sync and later tables**: those tables do not exist yet.
- **Business-settings edit screen**: the `update_business` function is tested, but no screen uses it yet.
