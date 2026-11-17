# TailorPro — CHANGELOG.md

## Unreleased — Phase 1 (Foundation), Checkpoint C: design system, offline shell, security headers, deployment preparation (2026-11-17)
- Design system: tokens, components (fields, buttons, banner, badge, empty state, dialog, toast), measuring-tape top rule, stitched seams, Atkinson Hyperlegible Next served locally; two-row top bar; dashboard shows business type and location.
- Offline shell: generated service worker (precached shell, never caches API or other origins, new versions wait behind an "update ready" banner), local Dexie store with `versionchange` handling, stale-while-revalidate account loading, offline badge, offline-safe session handling and sign-out, cleared on sign-out.
- Dashboard recent activity from the audit log, cached offline; times in the business timezone with British date order.
- Strict content security policy and headers generated at build (script hashes, no `unsafe-inline` or `unsafe-eval`); i18n lint rule; Zod set to non-compiling mode.
- ERD generated from the live database with a drift test; Cloudflare static-assets config validated by dry run; hosted-build guard that refuses secret keys and local URLs; `DEPLOYMENT.md`.
- 254 automated tests (100 database, 75 unit, 57 integration, 22 end-to-end); typecheck, lint and audit clean. Staging was **not** deployed (needs the owner's Supabase project).
- Fixed along the way: offline "Loading" hang, offline sign-out, offline pages missing the security policy, missing route-payload files, filler dashboard text, wrapped Sign out button.

## Unreleased — Phase 1 (Foundation), Checkpoint B: authentication and registration (2026-11-17)
- Next.js static-export app shell, `AuthAdapter` interface with a Supabase implementation, auth provider.
- Sign-in with Google (redirect wiring tested; real login not yet tested) and emailed 6-digit code (tested end to end with a local mail catcher): 10-minute code, 60-second resend limit.
- Business registration screen: 8 PRD fields, shared Zod schema verified against the database function with 20 vectors, idempotent via a client-generated id kept across retries, field-level errors in plain English.
- Authenticated shell, dashboard empty state (D1), settings with profile edit, sign-out; English message catalog.
- Draft account-recovery procedure (R-9) in `SECURITY.md` section 13, awaiting approval.
- Minor decisions: business-type codes follow PRD 1.5; country and currency shown read-only (Malawi, MWK); real Google credentials loaded locally (Google login itself still untested).

## Unreleased — Phase 1 (Foundation), Checkpoint A: database foundation and tenant isolation (2026-11-16)
- Added the Supabase project (`supabase/`), local Docker workflow and npm scripts.
- Migrations M1 (identity, tenancy, audit, RLS helpers), M2 (currencies, plans, subscriptions, platform settings), M3 (`create_business`, `update_business`, `update_profile`). Plan limits are unapproved placeholders (R-15).
- Closed-by-default privileges for new tables and functions (spike finding), RLS enabled and forced, writes only through functions.
- 100 database tests and 21 integration tests; typecheck; CI workflow (not yet run on GitHub).
- Phase 1 plan approved with D1 to D5 as recommended; Phase 0 spikes committed (`spikes/`).
- `SECURITY DEFINER` write functions (instead of `SECURITY INVOKER` in AD-1) approved by the product owner on 2026-11-17 (`SECURITY.md` section 11.2).

## Phase 0 — Technical planning (2026-11-16)
- PRD audit, architecture, database, security and sync design, zero-budget re-plan, decision register (R-1 to R-17, Z-1 to Z-9).
