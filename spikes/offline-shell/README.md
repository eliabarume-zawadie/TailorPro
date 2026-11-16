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
