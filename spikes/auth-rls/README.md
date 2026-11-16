# Spike 2: Supabase Auth + tenancy/RLS (local Docker)

Throwaway proof. Not product code. Run: `npm install`, `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,mailpit`, `node test.mjs`.
Keys in `test.mjs` are the public demo keys of the local Supabase stack, not secrets.

## Result (2026-11-16): 19/19 passed against local Supabase CLI 3.1.0 stack
- Google provider wiring: `/authorize?provider=google` redirects to accounts.google.com (dummy client id).
- Email OTP sign-in yields a JWT; local Auth signs with **ES256 + kid** (asymmetric, JWKS), relevant to the gateway.
- Tenant isolation: cross-tenant read, insert, update, delete, and "move row into another tenant" are all blocked; anonymous gets nothing; membership cannot be self-granted; tenants are only creatable through `register_business`; customers cannot be deleted by anyone (archive-only); replayed client-UUID upsert does not duplicate.

## Not proven (do not over-claim)
- **No real Google login.** Needs a Google Cloud OAuth client created by the product owner, plus a hosted-Supabase redirect URL.
- Email OTP here was minted via the admin API; delivery through free SMTP is untested.
- Local stack only; hosted Supabase Free behaviour, region and latency are untested.
- Only 3 spike tables; no roles/permissions, storage, payments, or audit logs. Phase 1 builds the real schema and a full isolation suite.
- Local config note: editing `config.toml` while `supabase start` is pulling images is ignored; restart the stack after config edits.

## Update: sync/payments spike (`test-sync.mjs`, migration 20261116000002): 10/10 passed
Idempotent `record_payment` (op_id unique) with `FOR UPDATE` order-row lock; payments append-only; R-2 overpayment recorded and flagged from sync only.
- Replay of one op_id 5x (simulating lost responses) records exactly once; 10 parallel duplicates of one op_id record once.
- 10 parallel offline-sync payments exceeding the order total: all recorded, none lost; balance and the 6 overpayment flags are correct (my first expected count of 7 was an arithmetic error in the test, corrected after working it out: 100 + 4x200 fits, 6 exceed).
- Online overpayment, zero and negative amounts are rejected; cross-tenant payment/order creation rejected; tenant B sees none of A's payments.
- **Finding:** Supabase default privileges grant ALL (including TRUNCATE) on every new `public` table to `anon` and `authenticated`. My first run showed UPDATE/DELETE returning 200 (zero rows, blocked only by RLS). Every product migration must explicitly revoke and grant minimal rights; the test now asserts the data is unchanged and statuses are 4xx.
- Not proven: outbox client code, the whole-batch endpoint, per-field conflict matrix (SYNC_DESIGN section 6), concurrent edits to customers/orders, dropped connection mid-request against a real network.
