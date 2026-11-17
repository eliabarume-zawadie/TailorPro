# TailorPro — CHANGELOG.md

## Unreleased — Phase 1 (Foundation), Checkpoint A: database foundation and tenant isolation (2026-11-16)
- Added the Supabase project (`supabase/`), local Docker workflow and npm scripts.
- Migrations M1 (identity, tenancy, audit, RLS helpers), M2 (currencies, plans, subscriptions, platform settings), M3 (`create_business`, `update_business`, `update_profile`). Plan limits are unapproved placeholders (R-15).
- Closed-by-default privileges for new tables and functions (spike finding), RLS enabled and forced, writes only through functions.
- 100 database tests and 21 integration tests; typecheck; CI workflow (not yet run on GitHub).
- Phase 1 plan approved with D1 to D5 as recommended; Phase 0 spikes committed (`spikes/`).
- `SECURITY DEFINER` write functions (instead of `SECURITY INVOKER` in AD-1) approved by the product owner on 2026-11-17 (`SECURITY.md` section 11.2).

## Phase 0 — Technical planning (2026-11-16)
- PRD audit, architecture, database, security and sync design, zero-budget re-plan, decision register (R-1 to R-17, Z-1 to Z-9).
