# TailorPro — IMPLEMENTATION_TRACKER.md

**Status as of Phase 1, Checkpoint B (2026-11-17):** sign-in, registration and profile built and tested end to end on the email path (see rows below and `TESTING.md`). Earlier status, Checkpoint A (2026-11-16): database foundation built and tested (M1-M3, 100 SQL + 21 HTTP tests). No requirement is yet marked Tested because none has completed its acceptance criteria (UI, sign-in with real Google, staging). Rows not mentioned below are still Not Started. "Implementation" entries for later phases are **planned** locations.
**Completion rule (CLAUDE.md §3):** a requirement is complete only when implemented, tested, acceptance-verified, security/regression-checked and documented. Nothing is marked Tested or complete in this document without recorded evidence in `TESTING.md`.

**Requirement IDs:** the PRD has none, so I assigned them (`<area>-<n>`). **Source** = PRD section or approved decision letter (Dec. X). Blocked items name the open decision (R-n) in `PHASE0_REVIEW.md`.
**Test types:** U unit · I integration · DB database/pgTAP · SEC security · E2E · OFF offline/sync · MAN manual on real device.

## Auth and tenancy

| ID | Requirement | Source | Planned implementation | Test | Status | Notes |
|---|---|---|---|---|---|---|
| AUTH-1 | Register, log in, log out, profile | PRD 4.1 | `src/auth/*`, `app/sign-in`, `app/app/settings`, `profiles`, `update_profile` | I, E2E | Implemented | Checkpoint B: sign in (Google, emailed code), sign out, profile edit, session persistence; e2e tested on the email path (7 tests). **Not Tested**: real Google login not yet performed (manual checklist in `TESTING.md`) |
| AUTH-2 | Business registration (8 fields), unique workspace ID, MWK | PRD 4.1 | `app/register`, `src/domain/business.ts`, `create_business`, `update_business` | I, DB | Tested | 8 fields, unique workspace ID, MWK, owner membership, free plan, audit; client/database parity (27 tests), e2e incl. double-tap creates one business, XSS payload inert. Verified locally via email sign-in; hosted staging run pending (C6) |
| AUTH-3 | Phone OTP primary, optional email (**Revision 2 proposes Google primary + optional email code; phone OTP deferred as a funded upgrade**) | Dec. D | Supabase Auth Google provider; email code via free SMTP; `AuthAdapter` | I, E2E | In Progress | Email code tested end to end (real mail catcher). Google: redirect wiring tested only; **real login untested** (needs owner OAuth client). Z-2 condition (ask pilot tailors) still open |
| AUTH-4 | Account recovery and phone change procedures | Dec. D | Auth flows + `SECURITY.md` §3.4–3.5 | I, SEC | Blocked | Draft recovery procedure written (`SECURITY.md` section 13); **awaiting owner approval of R-9 parameters**. Nothing built |
| AUTH-5 | OTP rate limiting, CAPTCHA, country allowlist, spend cap | Dec. D | Supabase limits, Vercel Firewall, CAPTCHA | SEC | In Progress | Resend limit (60 s) and wrong/reused code tested; code lifetime 10 min configured, expiry untested; hosted limits unverified; CAPTCHA not applied (`SECURITY.md` section 12.2) |
| TEN-1 | `workspace_id` on all tenant records, composite FKs | PRD 4.2 | Migrations M1–M7 | DB | In Progress | Phase 1 tables only (M1-M3): workspace key on `business_members`, `subscriptions`, `audit_logs`. Composite-FK pattern applies from Phase 2 tenant tables |
| TEN-2 | RLS on every tenant table (ENABLE + FORCE) | PRD 4.2, 7 | `private.is_member`, policies | SEC, DB | In Progress | M1-M2 tables: ENABLE+FORCE RLS verified by catalog test (13 checks) incl. closed-by-default grants. Applies to later tables as they are added |
| TEN-3 | Membership validated on every API/function call | PRD 4.2, 5.5 | Function checks, route middleware | SEC | In Progress | All 3 write functions check caller identity and permission themselves (`auth.uid()`, `private.has_permission`); tested via DB and HTTP. Later functions must follow the same pattern |
| TEN-4 | Storage isolation | PRD 4.2, 4.11 | Private buckets, Storage RLS, signed URLs | SEC | Not Started | |
| TEN-5 | Platform admin has no automatic access; break-glass is logged | PRD 3.1 | `platform_admins`, aggregate functions, `support_access_grants` | SEC | In Progress | `platform_admins` exists with no grants/policies; test proves an admin reads no tenant data. Break-glass and aggregate functions are Phase 6 |
| TEN-6 | Staff permission model enforced server-side from day one | PRD 3.3 | `business_members.permissions`, `has_permission` | SEC, U | In Progress | Permission model + `has_permission` tested (staff denied, `settings.manage` granted). Staff invite UI is Phase 6 (R-4) |
| TEN-7 | Automated cross-tenant R/W/U/D tests on every table | PRD 4.2, CLAUDE 6 | `/supabase/tests`, CI | SEC | In Progress | Phase 1 tables covered: DB tests 100 pass, HTTP isolation tests 21 pass; mutation-checked (weakened grant and policy both caught). Must be extended with every new table |

## Customers and measurements

| ID | Requirement | Source | Planned implementation | Test | Status | Notes |
|---|---|---|---|---|---|---|
| CUS-1 | Customer fields, create/edit/archive/restore | PRD 4.3 | `customers`, functions, UI | I, E2E | Not Started | |
| CUS-2 | Search by name or phone (online and offline) | PRD 4.3, 5.2 | Trigram index; Dexie index | U, OFF, MAN | Not Started | Budget < 300 ms (Dec. O) |
| CUS-3 | Duplicate warning by phone; phone not globally unique | PRD 4.3 | Non-unique index + check function | U, I | Not Started | |
| CUS-4 | Customer history, orders, measurement history | PRD 4.3 | Customer detail views | E2E | Not Started | |
| MEA-1 | Six system templates with fields, units, required, order | PRD 4.4 | Seed migration, `measurement_templates*` | DB, U | Not Started | |
| MEA-2 | Custom, workspace-owned templates; system templates read-only | PRD 4.4, Dec. E | Template CRUD, RLS | SEC, I | Not Started | |
| MEA-3 | Multiple profiles per customer; history preserved | PRD 4.4 | `customer_measurements`, `measurement_revisions` | DB, I | Not Started | |
| MEA-4 | Explicit units; no silent conversion | PRD 4.4 | Unit column; validation | U | Not Started | |
| MEA-5 | Immutable order snapshot; later edits do not change orders | PRD 4.4, 4.5 | `order_measurement_snapshots`, trigger | DB | Not Started | |
| MEA-6 | Template versioning preserves historical field definitions | Dec. E | `measurement_template_versions` immutable | DB | Not Started | |
| MEA-7 | Measurements page: searchable list, template used, history, open customer, create/update | Dec. F | `/app/measurements` | E2E | Not Started | No duplicate records |
| MEA-8 | Copy measurements into new order | PRD 4.4 | Order-creation flow | I, E2E | Not Started | |

## Orders and workflow

| ID | Requirement | Source | Planned implementation | Test | Status | Notes |
|---|---|---|---|---|---|---|
| ORD-1 | Order with all required fields; unique order number | PRD 4.5 | `orders`, `workspace_counters`, `create_order` | I, DB | Not Started | R-1 approved: server-assigned number |
| ORD-2 | Multiple items with description, qty, price, own snapshot | PRD 4.5, Dec. C | `order_items` | I | Not Started | R-14 total/price definition |
| ORD-3 | Order-level status now; schema ready for item-level later | Dec. C | `order_status_history.order_item_id` nullable | DB | Not Started | |
| ORD-4 | Reference images: JPEG/PNG/WebP, ≤ 5 MB, ≤ 5 per order, server-validated, compressed | PRD 4.11, Dec. M | `/api/uploads/*`, `order_attachments`, limits in `platform_settings` | SEC, I, OFF | Not Started | |
| WFL-1 | Eight statuses; normal forward flow | PRD 4.6, Dec. B | `change_order_status`, `/src/domain/status` | U, DB | Not Started | R-13 approved: strict next step |
| WFL-2 | Backward moves between active statuses require reason, recorded | Dec. B | Same | U, DB | Not Started | |
| WFL-3 | On hold from any active; resume to prior status | Dec. B | `status_before_hold` | U, DB | Not Started | |
| WFL-4 | Cancel before collection with reason; payments retained | PRD 4.6, Dec. B | Same | U, DB | Not Started | R-14 |
| WFL-5 | Collected not reversible by normal actions; owner correction with reason, audited | Dec. B | Owner-only function, `audit_logs` | SEC, DB | Not Started | R-13 approved: correction target is Ready for collection |
| WFL-6 | Collected allowed with balance owing; warning shown, not blocked | Dec. B | UI warning, no server block | E2E, U | Not Started | |
| WFL-7 | Collection and payment status recorded separately | Dec. B | `order_financials.payment_status` | U, DB | Not Started | |
| WFL-8 | Status history: user, time, from, to, reason | PRD 4.6, Dec. B | `order_status_history` | DB | Not Started | |
| WFL-9 | Deadline never auto-changes status; only authorized users mark Ready | PRD 4.6 | No scheduled writes to status; permission check | DB, SEC | Not Started | |
| DLN-1 | Six deadline categories in business timezone | PRD 4.7 | Shared deadline function (SQL + TS) | U | Not Started | |
| DLN-2 | Urgency visual indicators; transparent rules, no AI | PRD 4.7 | UI | E2E | Not Started | |
| DSH-1 | Dashboard metrics from real records; empty state; updates after sync | PRD 4.8 | Queries/local aggregates | I, OFF | In Progress | Phase 1 dashboard shows workspace name and an honest empty state (decision D1); metric tiles arrive with Phases 2 to 4 |
| REM-1 | In-app reminders and indicators for due today/upcoming/overdue/ready/subscription; record events | Dec. H | `reminder_events`, idempotent `generate_reminders()` RPC on open/sync (scheduled job dropped, Revision 2), dashboard | I, U | Not Started | No SMS/WhatsApp/push |

## Payments and communication

| ID | Requirement | Source | Planned implementation | Test | Status | Notes |
|---|---|---|---|---|---|---|
| PAY-1 | Payment transactions with required fields, append-only | PRD 4.9 | `payments`, immutability trigger, `record_payment` | DB, SEC | Not Started | |
| PAY-2 | Total paid, balance formulas; positive amounts; ≤ remaining; currency match | PRD 4.9 | `order_financials`, row lock, composite FK | U, DB | Not Started | R-2 and R-14 approved |
| PAY-3 | Correction/reversal/refund with audit trail | PRD 4.9 | `payment_adjustments` | DB, U | Not Started | |
| PAY-4 | Methods: cash, bank transfer, mobile money, configurable | PRD 4.9 | `payment_methods` | I | Not Started | |
| PAY-5 | Printable HTML receipt with required fields and optional logo | PRD 4.9, Dec. L | Print view | E2E, MAN | Not Started | |
| WAP-1 | Six WhatsApp templates from real data; `wa.me` link; no delivery claim | PRD 4.10 | Template renderer | U, E2E | Not Started | |
| CUR-1 | MWK only; model extensible | Dec. N | `currencies`, per-record currency | DB | Not Started | |

## Offline and sync

| ID | Requirement | Source | Planned implementation | Test | Status | Notes |
|---|---|---|---|---|---|---|
| OFF-1 | Offline: view/search/create/edit customers, create orders, record payments, update status, view history | PRD 5.2 | Dexie + repositories | OFF, MAN | Not Started | |
| OFF-2 | Six sync states shown; never false success | PRD 5.2, Dec. P | `_syncState`, state machine | U, E2E | Not Started | |
| SYN-1 | Client UUIDs, outbox, idempotency keys, retry, ack tracking, duplicate prevention, interrupted uploads | PRD 5.3 | `/src/data/sync`, `sync_operations` | OFF | Not Started | |
| SYN-2 | Sync on reconnect and on app open; no reliance on Background Sync | PRD 5.3 | Foreground triggers | OFF | Not Started | |
| SYN-3 | Explicit conflict rules; payments append-only; history preserved | PRD 5.4 | Conflict module, `sync_conflicts` | U, OFF | Not Started | R-3 approved |
| SYN-4 | Sync security: auth, membership, no cross-tenant | PRD 5.5 | Sync routes | SEC | Not Started | |
| SYN-5 | Offline acceptance tests (PRD 5.6 + CLAUDE 7) | PRD 5.6 | `/tests/offline` | OFF, MAN | Not Started | Needs R-11 device |
| SYN-6 | Offline order numbering | PRD 4.5/5 | Server-assigned number | OFF | Not Started | R-1 approved |
| PWA-1 | Installable PWA; offline app shell | PRD 2, 5.1 | Service worker | E2E, MAN | In Progress | Spike 1 passed in desktop headless Chromium (`spikes/offline-shell`); real Android device test still outstanding (R-11); not complete |

## SaaS, reports, operations

| ID | Requirement | Source | Planned implementation | Test | Status | Notes |
|---|---|---|---|---|---|---|
| SUB-1 | Plans, central status, server-side limits, grace periods | PRD 8, 8.1 | `subscription_plans`, `subscriptions`, limit checks | U, I, SEC | Blocked | R-15 limits |
| SUB-2 | Expiry never erases data | PRD 8.1, CLAUDE 5 | Status-only transitions | DB, I | Not Started | R-6 behaviour |
| SUB-3 | Monthly and annual billing supported | PRD 8 | `billing_period` | U | Not Started | |
| SUB-4 | Manually verified subscription payments; admin manages plans | PRD 8.1, 3.1 | `subscription_payments`, admin UI | E2E, SEC | Not Started | No payment gateway |
| RPT-1 | Seven MVP reports; value/cash/outstanding distinct; never "profit" | PRD 10, Dec. G | Report queries | I, U | Not Started | Phase 6; no extra reports |
| EXP-1 | Owner data export in usable format | Dec. I | Owner-only export RPC, ZIP of CSV/JSON built in the browser, audit-logged (`export_jobs` deferred, Revision 2) | I, SEC | Not Started | |
| DEL-1 | Permanent deletion | Dec. I | **Not to be built** until retention policy approved | — | Blocked | Legal review |
| LEG-1 | Malawi data-protection review documented | PRD 7, CLAUDE 10 | `SECURITY.md` §9 | Review | Not Started | Counsel needed |
| SEC-1 | Validation, rate limiting, headers, audit logs, redaction | PRD 7 | Middleware, Zod | SEC | In Progress | Server-side validation, audit insert-only and redaction tested; markup rendered inert in UI (e2e). Pending: rate limiting beyond auth, CSP/headers, log-redaction tests |
| I18N-1 | English now; strings separated for Chichewa and French | Dec. K | `/src/i18n` | U, lint | In Progress | English catalog `src/i18n/en.ts`; validation messages are catalog keys; test proves every emitted key exists. Lint rule against string literals in components pending (C5) |
| UI-1 | Mobile-first UI, large targets, contrast, nav, quick actions | PRD 9 | Design system | E2E, MAN | In Progress | Checkpoint B baseline forms (44 px targets, labels, error text, mobile-first). Design system, accessibility audit and phone-size review pending (C1, C2) |
| PERF-1 | Search < 300 ms, UI < 100 ms, API p95 < 500 ms; measured on mid-range Android | Dec. O, PRD 11 | Perf tests | MAN, Load | Not Started | R-11 device |
| BKP-1 | Daily backups, 30-day retention, RPO 24 h, RTO 8 h; restore tested | Dec. J, PRD 13 | Free Supabase has **no automatic backups**: scheduled encrypted `pg_dump` + Storage export (GitHub Actions) to a second provider | Restore drill | Blocked | Z-6 destination; mandatory restore drill before real customer data |
| ZB-1 | Zero-budget platform: Supabase Free + Cloudflare static/Worker; Vercel Hobby excluded | Zero-budget constraint | `ZERO_BUDGET_REVIEW.md` | Review | In Progress | Z-1 **approved**; implementation not started |
| ZB-2 | Written confirmation that free plans permit a commercial pilot | Zero-budget constraint | Vendor confirmation on file | Review | Blocked | Z-4 **approved as a gate**; confirmation not yet obtained; no real data until it is |
| ZB-3 | Portability seams: `current_user_id()`, `AuthAdapter`, `StorageAdapter`, provider-neutral migrations | Zero-budget constraint | `/src/data`, migrations | U, Review | Not Started | |
| ZB-4 | Upgrade triggers and monitoring of free-tier usage (DB size, storage, requests) | Zero-budget constraint | Usage checks + runbook | Review | Not Started | `ZERO_BUDGET_REVIEW.md` §9 |
| ZB-5 | Gateway CPU spike (10 ms Worker limit) and rate limiting | Zero-budget constraint | Phase 1 spike | Perf | In Progress | Spike done (see `spikes/gateway-cpu`): warm CPU p50 0-1 ms; **cold starts 4-13 ms vs 10 ms limit** (no failures observed). Gateway deferred to Phase 5 (approved D3); re-measure with real code |
| OPS-1 | Three environments, CI, migrations, monitoring, recovery docs | PRD 13 | CI, `DEPLOYMENT.md` | Review | In Progress | CI workflow written (`.github/workflows/ci.yml`); **not yet executed on GitHub**. Local scripts in `package.json`. Staging environment is Checkpoint C6 |
| COST-1 | Hosting/auth/SMS cost documentation; **zero-budget target** | Dec. A, D | `ZERO_BUDGET_REVIEW.md` (supersedes `ARCHITECTURE.md` §8) | Review | In Progress | Verified vs assumed limits labelled; awaiting approval |
| E2E-1 | Ten-step journey (register → collected) | PRD 12 | `/tests/e2e` | E2E | Not Started | |
| DOC-1 | ARCHITECTURE, DATABASE_SCHEMA (+ERD), SECURITY, SYNC_DESIGN, TRACKER | PRD 14 Phase 0 | This document set | Review | In Progress | Awaiting approval |

## Documents (CLAUDE.md §13)

| Document | Status | Note |
|---|---|---|
| PRD.md | Approved, unmodified | Not edited by me |
| IMPLEMENTATION_TRACKER.md, ARCHITECTURE.md, DATABASE_SCHEMA.md, SECURITY.md, SYNC_DESIGN.md | Draft (Phase 0) | Awaiting review |
| PHASE0_REVIEW.md | Draft | **Extra**: not in CLAUDE.md's list. Holds the decision register and findings you requested; can be merged or removed after review |
| TESTING.md, CHANGELOG.md | Created at Checkpoint A | Real test results and the first change record exist now. |
| DEPLOYMENT.md | Not created | Created at Checkpoint C6 with the first staging deployment. Empty documents would be meaningless |
