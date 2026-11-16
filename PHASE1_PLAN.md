# TailorPro — PHASE1_PLAN.md

**Status:** PROPOSED, awaiting product-owner approval. No Phase 1 code has been written.
**Controlling spec:** `PRD.md` §14 "Phase 1 — Foundation", plus approved decisions in `PHASE0_REVIEW.md` (R-1…R-17, Z-1…Z-9). Region: **eu-west-3 (Paris)**, to be confirmed as selectable on the free plan.
**Spike evidence this plan relies on:** `spikes/*/README.md` (commit `714e4af`). Each README lists what was *not* proven.

---

## 1. Scope (PRD §14, Phase 1) and what it means

| PRD item | What Phase 1 delivers | Tracker IDs |
|---|---|---|
| Project initialization | Next.js (static export) + TypeScript app at repo root, lint, unit/e2e tooling, CI, repo layout from `ARCHITECTURE.md` §4 | OPS-1 |
| Design system | Tokens, core components, mobile-first shell, accessible contrast, English string catalog | UI-1, I18N-1 |
| Authentication | Google sign-in (primary), optional email code, session, log out, profile, account-recovery path | AUTH-1, AUTH-3, AUTH-5 (partial) |
| Business registration | The 8 PRD fields, unique workspace ID, MWK, owner membership, audited, idempotent | AUTH-2 |
| Multi-tenant architecture | Membership model, roles and server-enforced permissions from day one, platform admin separated with no data access | TEN-1, TEN-3, TEN-5, TEN-6 |
| Database migrations | M1 and M2 from `DATABASE_SCHEMA.md` §6, forward SQL with rollback notes | TEN-1 |
| RLS policies | ENABLE + FORCE RLS, explicit grants, composite-FK pattern, helper functions | TEN-2, TEN-7 (Phase 1 tables) |
| Basic dashboard | Real shell with empty state and recent activity (see decision D1) | DSH-1 (partial) |

**Deliberately not in Phase 1:** customers, measurements, orders, payments, sync engine, gateway Worker, staff-invite UI (Phase 6), subscription limits (Phase 6), PIN lock (with the offline engine, Phase 5).

---

## 2. Spike findings that change the build (all carried into the tasks below)

1. **Default grants are open.** Supabase gives `anon`/`authenticated` ALL (incl. TRUNCATE) on every new `public` table. Every migration revokes and re-grants minimally; a catalog test fails the build if any table deviates.
2. **Service worker takes over open tabs silently** (`skipWaiting` + `clients.claim`). Phase 1 adds an "update available, reload" flow and a Dexie `versionchange` handler; destructive schema changes are tested (the spike only tested an additive one).
3. **Gateway cold starts cost 4–13 ms CPU** against the 10 ms free limit (warm: p50 0–1 ms). No gateway is built in Phase 1 (decision D3); the finding shapes Phase 5.
4. **Local Supabase:** edit `config.toml` only while the stack is stopped; stray processes on a port can silently invalidate a test run.
5. **Local Auth signs JWTs with ES256 + JWKS**, not a shared secret. Any server-side verification must use the key set.

---

## 3. Work breakdown (ordered; each ends with tests passing before the next starts)

### Checkpoint A — Foundation and tenant isolation
- **A1 Repo bootstrap.** Next.js 16 static export, TypeScript strict, ESLint, Vitest, Playwright, `.env.example`, secret-scan in CI. GitHub Actions workflow (remote exists: `origin`). Layout per `ARCHITECTURE.md` §4.
- **A2 Supabase project.** `/supabase` with config, seeds, `supabase test db` (pgTAP). Local Docker stack.
- **A3 Migration M1.** Extensions; `private` schema; `profiles`, `businesses`, `business_members` (one active owner via partial unique index; `permissions jsonb`), `platform_admins` (no tenant policies), `audit_logs` (insert-only trigger, redacted). `private.is_member`, `private.has_permission` (`SECURITY DEFINER`, empty `search_path`). Client-generated UUID keys, `version`, timestamps, `archived_at`; no DELETE grant or policy.
- **A4 Migration M2.** `subscription_plans`, `subscriptions` skeleton, `platform_settings`, `currencies` (MWK only). Plan limits are **configurable placeholders, clearly marked** until you approve numbers (R-15). New workspaces start on the Free plan.
- **A5 Functions (AD-1).** `create_business(op_id, …)` (idempotent: replay returns the same business), `update_profile`, `update_business`. `authenticated` gets SELECT (RLS-filtered) and EXECUTE only.
- **A6 Isolation tests (mandatory, real Postgres as `authenticated`):** for every Phase 1 table, A cannot read, insert (with B's workspace), update, delete B's rows; membership removal revokes access immediately; platform admin gets no tenant access; catalog tests (RLS enabled and forced on all tables, grants minimal, no table without a policy).

### Checkpoint B — Authentication and registration
- **B1 Auth adapter** (`AuthAdapter` interface; Supabase implementation). Google sign-in, session persistence, log out, profile edit.
- **B2 Email-code path** built and tested locally (Mailpit). Hosted enablement waits on a verified free SMTP route (decision D4).
- **B3 Registration flow UI + validation** (shared Zod schemas client and server-side function checks): 8 fields, MWK default, country, business type.
- **B4 Recovery:** Google/email-code recovery documented; manual-support procedure is a draft for your approval (R-9).
- **B5 Auth abuse controls:** Supabase auth rate limits configured and tested; redaction tests for logs.

### Checkpoint C — Design system, shell, dashboard, documentation
- **C1 Design system:** tokens (colour, type, spacing, 44 px touch targets, WCAG AA contrast checked), Button, Input, Select, Card, Badge, Banner, EmptyState, Dialog, Toast, form-error patterns, loading/offline/failure states.
- **C2 App shell:** responsive, mobile-first; offline-capable (hand-written service worker proven in Spike 1; precache app shell only, never API or storage). Update-available banner and `versionchange` handling.
- **C3 Local data layer (AD-3):** repository interface + Dexie for profile and business cache; UUIDs client-side. No outbox yet (Phase 5), and the UI never claims "synced".
- **C4 Dashboard:** welcome/empty state for a new business, quick-action area, recent activity from real `audit_logs`. Metric tiles arrive with the tables that back them (D1).
- **C5 i18n scaffolding:** typed English catalog, `Intl` formatting; lint rule against string literals in components.
- **C6 Staging deployment:** Supabase project (eu-west-3) + Cloudflare static hosting, **no real data** (Z-4 gate unchanged).
- **C7 Documentation:** update `IMPLEMENTATION_TRACKER.md`, `ARCHITECTURE.md` (fold in Revision 2), `DATABASE_SCHEMA.md` (as-built M1/M2 + ERD export), `SECURITY.md`, `TESTING.md` (actual results), `DEPLOYMENT.md`, `CHANGELOG.md`.

---

## 4. Test plan (what must pass before Phase 1 is declared complete)

| Level | Cases |
|---|---|
| Unit | Registration validation (missing/invalid fields, phone/email format, currency/country), permission helper, string-catalog lint |
| Database | Cross-tenant R/W/U/D on all tables; composite-FK rejection; audit insert-only; one-owner rule; **catalog tests: RLS enabled+forced, grants minimal** |
| Integration (real local stack) | `create_business` idempotent replay and duplicate submission; invalid input; unauthenticated/anon rejection; foreign IDs on every function; session expiry |
| E2E (Playwright) | Register, create business, reach dashboard, log out. Google cannot be automated: tests use the email-code path locally and a **manual checklist** covers real Google sign-in |
| Offline / update | Shell cold-starts offline after install; business and profile available offline; SW update banner; old-tab behaviour; destructive Dexie upgrade with an old tab open |
| Security | Secret scan, log redaction, XSS payloads in business fields, rate-limit behaviour |
| Manual | WCAG contrast check; phone-width layout review; real Google login on the hosted staging site |

Anything I cannot run will be reported as not run, never as passed.

---

## 5. Acceptance criteria for Phase 1
1. A new user signs in with Google, registers a business with all 8 fields, receives a unique workspace ID and MWK currency, and lands on the dashboard empty state.
2. Business A cannot read or modify Business B's data by any path tested in §4; platform admin has no tenant access.
3. Every table has RLS enabled and forced, and grants verified by an automated test.
4. Replaying a registration request creates exactly one business.
5. After first load, the app shell opens offline and shows the cached business and profile.
6. Update-available flow works with an open old tab; local data survives.
7. CI runs lint, type-check, unit, DB and integration tests on every push.
8. End-of-phase report per CLAUDE.md §4, then **I stop and wait for approval**.

---

## 6. Decisions needed from you

| ID | Question | My recommendation |
|---|---|---|
| **D1** | PRD 4.8 lists nine dashboard metrics, but customers and orders do not exist until Phases 2–3, and mock data is not allowed. What does the Phase 1 dashboard show? | (a) Empty state + quick actions + real recent activity; each metric tile ships with its backing table. Alternative: create customers/orders tables early (breaks phase order). |
| **D2** | PRD 9 lists six navigation items. Show all six now (dead screens) or only built ones? | Only built ones (Dashboard, Settings); add the rest as built. Avoids placeholder screens. |
| **D3** | Build the Worker gateway in Phase 1? | No. Nothing to gate yet except registration. Mark Z-3 as "viable, cold-start risk" and build it in Phase 5 with the real sync endpoint; direct RPC remains the fallback. |
| **D4** | Email-code sign-in on the hosted site needs a verified free SMTP sender (Brevo or Resend). | Ship Google-only on staging; email-code built and tested locally; enable hosted once SMTP is verified. |
| **D5** | Revision 2 schema adjustments (`ZERO_BUDGET_REVIEW.md` §8.2: `private.current_user_id()` wrapper, deferred `export_jobs`, etc.). Z-1 was approved but these were not itemised. | Treat as approved with Z-1; tell me if not. |

**Minor implementation decisions I will make and document unless you object:** hand-written service worker (proven) instead of Serwist; pgTAP for DB tests plus Vitest for integration; small typed string catalog instead of an i18n library for now; Zod for shared validation.

## 7. What I need from you (not blocking Checkpoint A)
- **Google Cloud OAuth client** (for real Google sign-in testing at Checkpoint B). I will provide step-by-step instructions.
- **Supabase account / hosted project** in eu-west-3 (for C6), and confirmation the region is selectable on the free plan.
- **Pilot-tailor Google/email access check** (Z-2 condition; risk Z7). Please ask early.
- **R-9 recovery procedure** approval (draft comes at B4).
- **Still gating real data, not Phase 1:** Z-4 vendor confirmation, R-17 counsel, R-11 Android device (before Phase 5).

## 8. Risks specific to Phase 1
| Risk | Mitigation |
|---|---|
| Google-only login excludes some tailors (Z7) | Validate with pilot tailors now; email code is the second path; funded phone OTP stays the trigger option |
| Next.js static export + Turbopack and service-worker tooling quirks | Spike 1 already proved the pattern; keep SW hand-written and tested |
| Hosted free-tier behaviour differs from local (pausing, limits, region) | Staging deployment is in scope (C6); limits re-verified there |
| Cold-start CPU on the future gateway | Deferred to Phase 5 with monitoring plan |
| Windows dev environment friction (Docker, ports) | Documented in `DEPLOYMENT.md`; CI runs on Linux |

## 9. Reporting
I will report at the end of Checkpoints A, B and C (short, no approval needed to continue) and give the full CLAUDE.md §4 end-of-phase report after C. **I will not start Phase 2 without your approval.**
