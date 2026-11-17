# TailorPro — SECURITY.md

**Status:** Phase 0 DRAFT. Describes the intended security model; nothing here is implemented or tested yet.
**Source:** PRD §3, §4.2, §5.5, §7; CLAUDE.md §6, §10; Decisions D, I, M, P.

I make no compliance claims. Legal requirements (Malawi data protection) are listed in §9 for review by qualified counsel.

---

## 1. Assets and threats

**Assets:** customer identities and phone numbers, body measurements, order and payment records, uploaded images, auth identities, business subscription state.

| # | Threat | Primary controls |
|---|---|---|
| T1 | Business A reads/modifies Business B's data | RLS on every tenant table, composite FKs, membership checks in every function, no direct write grants, automated cross-tenant tests |
| T2 | Client-supplied workspace ID spoofing | Workspace is validated against membership server-side; never trusted (PRD §5.5) |
| T3 | Platform admin or support reading sensitive records | Admin role has no policy on tenant tables; aggregate functions only; break-glass grants are owner-approved, time-limited, logged |
| T4 | Attachment access across tenants / public URLs | Private bucket, workspace-prefixed paths, Storage RLS, short-lived signed URLs |
| T5 | Account takeover (SIM swap, OTP interception, phished OTP) | See §3.5 |
| T6 | SMS pumping / OTP cost abuse | See §3.3 |
| T7 | Payment manipulation (negative, duplicate, race, edit) | Insert-only payments, row-locked balance check, idempotency keys, server-side validation |
| T8 | Sensitive data leaked via logs or error reports | Redaction rules (§7) |
| T9 | Stolen or shared device exposes offline data | §6 |
| T10 | Privilege escalation staff→owner / forged role | Roles stored server-side in `business_members`; permission checks in functions; no role in client-editable claims |
| T11 | Injection / XSS / CSRF / SSRF | Parameterised SQL only, Zod validation at every boundary, React escaping, strict CSP, SameSite cookies, no user-supplied URL fetching |
| T12 | Secret exposure | Env-var secrets only; `service_role` and SMS keys server-side only; secret scanning in CI |

---

## 2. Tenant isolation model

1. **Identity:** Supabase Auth issues a JWT. `auth.uid()` identifies the user.
2. **Membership:** `business_members(workspace_id, user_id, role, permissions, status)` is the single source of truth. A user may belong to several workspaces.
3. **RLS helper functions** (`private.is_member(workspace_id)`, `private.has_permission(workspace_id, perm)`) are `SECURITY DEFINER` in a non-exposed schema, with `search_path` pinned to empty and fully qualified references. Policies call them as `(select private.is_member(workspace_id))` for plan caching.
4. **Policies, per tenant table:**
   - SELECT: member of the workspace (plus permission where needed, e.g. payments).
   - INSERT/UPDATE: only through functions; the table policies also require membership and `WITH CHECK` on `workspace_id`.
   - DELETE: **no policy** (denied). Records are archived, never deleted.
   - Insert-only tables (payments, adjustments, revisions, snapshots, history, audit) have triggers that also reject UPDATE/DELETE, so even a privileged mistaken policy cannot permit edits.
5. **`ENABLE` and `FORCE ROW LEVEL SECURITY`** on every tenant table, so even table owners are subject to policies. Table-owning and migration roles are never used by application code.
6. **Grants:** `anon` has nothing on tenant tables. `authenticated` has SELECT (RLS-filtered) and EXECUTE on specific functions only.
7. **Composite FKs** prevent cross-tenant parent references at the data level.
8. **System-wide rows** (default templates, payment methods, notification templates) have `workspace_id IS NULL`: readable by all authenticated users, writable by none.
9. **Role bypass awareness:** the Supabase dashboard, `service_role` key and direct database credentials bypass RLS. Their access is an *operational* control, covered in §5 and `DEPLOYMENT.md` (who holds them, MFA, rotation).

**Tests (mandatory, run in CI as the `authenticated` role against a real Postgres, never mocks):** for every tenant table, with users A and B in separate workspaces, prove A cannot SELECT, INSERT (with B's `workspace_id`), UPDATE, or DELETE B's rows; cannot reference B's rows via FK; cannot call any function with B's IDs; a user in A who is removed from membership immediately loses access; sync endpoints reject foreign IDs; Storage downloads/uploads across tenants fail.

---

## 3. Authentication (Decision D)

> **REVISION 2 (zero-budget, pending approval).** Phone OTP has no verified free path, so `ZERO_BUDGET_REVIEW.md` §6 proposes **Google sign-in as primary, email one-time codes as an optional second path, and phone as a contact field only**. Phone OTP stays switchable and becomes a funded upgrade. Sections 3.2–3.5 below describe the phone-OTP design and apply only if you approve an SMS cost; SMS-pumping controls (3.3) are unnecessary while no SMS is sent. Everything else in this file (tenant isolation, admin access, uploads, logging, tests) is unchanged. Rate limiting without a Next.js server and the thin Worker gateway are covered in `ZERO_BUDGET_REVIEW.md` §4 and risk Z6.

### 3.1 Approach (previous plan)
Supabase Auth, phone OTP primary, email optional (additional identity and recovery). No custom password or session code. Session cookies via `@supabase/ssr`, `HttpOnly`, `Secure`, `SameSite=Lax`.

### 3.2 SMS provider assessment

Supabase supports Twilio, Twilio Verify, MessageBird, Vonage, and TextLocal (community-supported) natively, and supports a **Send SMS hook** that lets us deliver the OTP through any HTTP-reachable provider. Supabase still generates and verifies the OTP; the hook only handles delivery. (Docs fetched 2026-11-16. Hook availability on the plan chosen must be confirmed in the Phase 1 spike.) WhatsApp OTP is supported only through Twilio providers.

| Option | Pros | Cons / unknowns |
|---|---|---|
| **A. Native Twilio / Twilio Verify** | Least code; mature; WhatsApp OTP channel available | Malawi SMS is **$0.3307 per segment** (Twilio's page); highest cost; sender-ID/registration rules for Malawi not verified |
| **B. Send SMS hook → regional aggregator (e.g. Africa's Talking or other local/Malawi routes)** | Likely lower cost (third-party comparisons suggest roughly €0.06–0.11, unverified); possibly better local routing | Small custom endpoint to build and secure (verify hook signature, retry, logging); **no verified Malawi rate for Africa's Talking**; deliverability on Airtel and TNM must be tested |
| **C. Email + password fallback** | No SMS cost | Excludes tailors without email; requires password reset flows; the approved decision is phone-first |

**Recommendation:** build against the Send SMS hook abstraction (B) so the provider is swappable, and obtain written Malawi quotes plus a real-handset deliverability test on both Airtel and TNM before choosing. For the 10-business pilot, option A is affordable (≈ $13/month at 4 OTPs per user per month) and acceptable as a start if no quote arrives in time. If OTP cost materially affects viable subscription pricing, I will bring alternatives to you before changing the approach (Decision D).

### 3.3 Rate limiting and abuse prevention
- OTP request limits per phone number, per IP, and per device (Supabase Auth limits plus Vercel Firewall rate limiting; exact values chosen in Phase 1 and recorded here).
- **CAPTCHA** (e.g. Turnstile/hCaptcha) on OTP request, as Supabase recommends for controlling SMS cost.
- **Country allowlist** (+265 initially). Block high-cost or premium prefixes. Reject non-E.164 input.
- Short OTP expiry (target 5–10 minutes; Supabase default is 1 hour, so it must be lowered), limited verification attempts, lockout with back-off.
- Hard monthly **spend cap** at the SMS provider and an alert at 50% and 80%.
- Monitoring of OTP request/verify ratio; a low verify ratio signals pumping.

### 3.4 Account recovery
| Case | Procedure |
|---|---|
| Normal login | OTP to registered phone |
| Phone lost, email verified on account | OTP to verified email; user then registers a new phone (OTP to new phone) |
| Phone lost, no email | **Manual support recovery** (proposal in R-9): identity verification checklist agreed with the business, owner-of-record confirmation, a waiting period, notification to the old number, every step logged. Requires your approval; not designed to be fast |
| Email-only user | Email OTP / magic link |

### 3.5 Phone-number change and account-takeover protection
- Changing the phone requires a fresh OTP to the **new** number and recent re-authentication. Where possible also confirm via the old number or verified email. Exact Supabase behaviour to be confirmed in the Phase 1 spike.
- On phone/email change: notify the previous phone (SMS) or email and record in `audit_logs`; 24–48 h cooling period before sensitive operations (data export, owner transfer, member invitation) can be performed using the new number (proposal).
- Sensitive actions (export, change phone/email, invite staff, change role, cancel collection correction) require re-authentication within a short window.
- Session list and "sign out other devices"; refresh-token rotation (Supabase default behaviour to be confirmed).
- **SIM-swap residual risk** is accepted for the MVP and documented: OTP over SMS is weaker than app-based factors. Recommending optional email as a second recovery factor and, post-MVP, evaluating TOTP.

### 3.6 Authorization
Roles: platform administrator, owner, staff. The staff `permissions` model and owner-controlled permission flags are enforced server-side from day one, even though the MVP may run one user per business (decision R-4). The UI never hides what the server does not enforce.

---

## 4. Subscription enforcement
Plan limits are enforced in the same server functions that create records (not in the UI). Expiry or suspension **never deletes data**. Behaviour after expiry/grace (read-only vs. blocked) is **open decision R-6**; export must remain available.

---

## 5. Platform administration and support access
- `platform_admins` is a separate table and role; it has **no** SELECT policy on customers, measurements, orders, payments, attachments.
- Admin screens use `SECURITY DEFINER` functions that return only aggregates and subscription/account metadata (counts, plan, status, last sync).
- **Exceptional support access:** owner approves a `support_access_grants` row (reason, scope, expiry ≤ a short maximum such as 24 h); access is via audited functions only; every read is written to `audit_logs`; the owner can revoke and can see the log.
- Operational holders of `service_role`/DB credentials: minimal named people, MFA, rotation procedure, access logged where the platform allows. Documented in `DEPLOYMENT.md`.

---

## 6. Offline and device security
- IndexedDB is **not encrypted** by the browser. Offline data holds customer and measurement data. Options (decision R-10): (a) rely on OS/device lock only; (b) app-level PIN lock after inactivity; (c) encrypted-at-rest local store with a key derived from a PIN. Recommendation: (b) for the MVP, documented as a limitation, evaluate (c) later.
- Logout with unsynced operations: the app warns and **does not delete pending outbox items silently**. Wipe happens only after confirmed sync or an explicit "discard unsynced changes" action.
- Revoked session/removed member: the server rejects sync; the client keeps unsynced data in a quarantined state and shows "Sign in again" instead of discarding it.
- The service worker does not cache authenticated API responses, storage URLs or tokens.

---

## 7. Logging and privacy
- Never log passwords, OTPs, tokens, full phone numbers, or measurement values. Redaction helper applied to server logs, error reports (Sentry `beforeSend`) and `audit_logs.diff`.
- Audit log entries for: auth events, member/role changes, status changes, payments and adjustments, exports, support access, subscription changes, owner corrections.
- No sensitive data in URLs or analytics.

---

## 8. Application security controls
HTTPS only with HSTS; CSP, `X-Content-Type-Options`, `Referrer-Policy`, frame protections; Zod validation on every API input; parameterised queries; CSRF protection for cookie-authenticated mutations (origin checks and SameSite); dependency audit and secret scanning in CI; request-size limits; per-user and per-IP API rate limits; error messages that do not reveal whether a phone number is registered where practical.

### 8.1 File uploads (Decision M)
1. Client requests an upload slot from `/api/uploads/init` with declared MIME, size, order ID. The server verifies membership, order ownership, plan/image-count limit, MIME ∈ {jpeg, png, webp}, size ≤ configured max (default 5 MB).
2. Server returns a **signed upload URL** to a workspace-prefixed path. The bucket is private with `allowed_mime_types` and `file_size_limit` as a second layer.
3. `/api/uploads/finalize` re-checks the real object: actual size, **magic-byte** type detection (not the client's claim), then inserts `order_attachments`. Failed objects are deleted.
4. Reads use short-lived signed URLs issued after a membership check.
5. Client-side compression is a convenience only; the server never trusts it.
6. Offline uploads are queued and go through the same steps on sync.

---

## 9. Malawi legal and data-protection review (pending, not a compliance claim)
Before production launch, qualified counsel should confirm and I will document:
- Current Malawi data-protection legislation and regulator, registration/notification obligations for processing personal data (customer names, phones, body measurements).
- Lawful basis and consent obligations (the tailor is likely the controller and TailorPro a processor; confirm).
- Cross-border transfer rules, since Supabase and Vercel hosting is outside Malawi.
- Data-subject rights (access, correction, deletion) and the response process.
- Financial-record retention periods and any tax-record rules.
- Breach notification duties.
- Data-processing terms for sub-processors (Supabase, Vercel, SMS provider).

I will not invent a retention period. Permanent deletion is not implemented until a proposed policy is approved (Decision I).

---

## 10. Security test inventory (maps to `IMPLEMENTATION_TRACKER.md`)
Cross-tenant R/W/U/D on all tables · FK cross-reference · function-level authorization with foreign IDs · sync endpoint foreign IDs · storage cross-tenant · role escalation · admin cannot read tenant tables · break-glass expiry and logging · payment tampering (negative, duplicate, race, edit/delete attempt) · snapshot/revision immutability · OTP rate-limit and CAPTCHA behavior · session revocation · input fuzzing and XSS payloads · rate limiting · secret scan · log redaction tests.

---

## 11. Phase 1 as-built notes (Checkpoint A)

**11.1 Closed-by-default privileges (spike finding, now enforced).** Supabase grants `anon` and `authenticated` ALL privileges (including TRUNCATE) on new `public` tables and EXECUTE on new functions. Migration M1 revokes these as defaults for objects created by `postgres`, and every migration grants explicitly. `supabase/tests/database/00_catalog.test.sql` fails if any table or function is more open than intended, including a probe that creates a new table and function and checks they are closed.

**11.2 AD-1 refinement. APPROVED by the product owner on 2026-11-17.** `ARCHITECTURE.md` AD-1 says write functions are `SECURITY INVOKER` so RLS still applies, and also that `authenticated` has no write grants on tenant tables. Those two cannot both hold: an invoker function needs table write privileges, and for registration no membership exists yet. As built, the write functions are `SECURITY DEFINER` with an empty `search_path`, and each one performs its own authorization first (caller from `auth.uid()`, then `private.has_permission`), validates input, and writes an audit entry. The intent of AD-1 is preserved (no direct writes, business rules in the database, cross-tenant tests). The cost is that RLS is not a second barrier inside these functions, so every new function needs its own cross-tenant tests. 

**11.3 Error mapping.** `28000` not authenticated, `42501` forbidden (HTTP 403), `22023` invalid input (HTTP 400), `PT409` stale version (HTTP 409).

**11.4 Permission keys defined so far.** `settings.manage` (update business), `members.manage` (list members), `audit.view` (read audit log). Owners hold all; staff only the keys set to `true` in `business_members.permissions`.

**11.5 Reference data visibility.** `platform_settings` is readable by every signed-in user, so it must never hold secrets (only the image ceilings today).

**11.6 Profiles and retention.** `profiles.id` references `auth.users` with RESTRICT, so a user with a profile cannot be hard-deleted. This follows "never remove historical records"; the account-deletion and retention procedure remains blocked on the legal review (R-17, DEL-1).

---

## 12. Authentication as built (Phase 1, Checkpoint B)

**12.1 Sign-in methods.** Google (primary, Z-2) and a 6-digit emailed code (second path). There are no passwords in TailorPro. Both go through Supabase Auth behind the `AuthAdapter` interface (`src/auth/adapter.ts`), so the app never depends on the provider directly.

**12.2 Email-code controls (configured and tested locally; hosted values must be re-applied in the dashboard, tracked for C6).**

| Control | Local setting | Evidence |
|---|---|---|
| Resend limit per address | 60 seconds (`auth.email.max_frequency`) | integration test: second request returns `rate_limited`; e2e test shows the wait message |
| Code lifetime | 10 minutes (`otp_expiry = 600`) | configured; **expiry itself is not tested** (would need a 10-minute wait) |
| Code length | 6 digits | tested (code extracted from the real email) |
| Wrong or reused code | rejected | integration and e2e tests |
| Verification attempts per IP | 30 per 5 minutes (Supabase `token_verifications`) | **configured at the Supabase default, not tested** (a test would lock the shared local IP out of other tests for 5 minutes) |
| Email sends per hour | Supabase `email_sent` | the local value is not representative; the **hosted free-tier limit must be read from the dashboard and confirmed** before pilot |
| Sign-ups / sign-ins per IP | 30 per 5 minutes (default) | configured at default, not tested |

Open risk: a 6-digit code has 1,000,000 values. The per-IP verification limit and the 10-minute lifetime make guessing impractical for one address, but a distributed attacker is not modelled. Revisit with hosted limits and CAPTCHA if abuse appears (AUTH-5).

**12.3 Session storage trade-off.** The session (access and refresh tokens) is stored in the browser's `localStorage` so the app opens offline. Any cross-site scripting bug would expose it. Mitigations in place: React escapes all rendered text (tested: markup in business fields renders as text and does not run); no raw HTML rendering anywhere; the client holds only the public URL and anon key; no inline event handlers. A strict Content Security Policy now limits what can run (section 14); XSS payloads must still be re-tested in every new field.

**12.4 Google sign-in.** Uses PKCE. The redirect to Google is tested (local dummy client id). **A real Google login has not been tested**: it needs the owner-created OAuth client (manual checklist in `TESTING.md`).

**12.5 Error messages.** The adapter maps provider errors to five kinds (`invalid_code`, `rate_limited`, `invalid_email`, `network`, `unknown`) and never surfaces the provider's raw message, which can echo the email address.

---

## 13. Account recovery procedure — DRAFT FOR PRODUCT-OWNER APPROVAL (R-9)

Status: **draft, nothing built.** There is no self-service recovery code and no support tooling in Phase 1. TailorPro has no passwords, so "forgot password" does not exist.

| Situation | What happens |
|---|---|
| Signs in with Google and loses the Google account | Google's own recovery. TailorPro cannot and does not reset a Google account |
| Signs in with an email code and still has the mailbox | Request a new code; nothing to recover |
| Signs in with an email code and **has lost the mailbox** | Manual recovery below |
| Wants to switch from one login method to another | Sign in with the old method, then (Phase 6 settings) link the new one. Not built yet |

**Proposed manual recovery for a lost mailbox** (owner accounts only; staff are recovered by their owner):
1. The requester contacts support. Support never changes a login email on request alone.
2. **Identity checks, all required:** (a) business name, location and approximate registration date; (b) a call or message from the **phone number on file** for the business (`businesses.phone`), confirmed by a code sent by SMS or WhatsApp to that number outside TailorPro; (c) two recent, non-sensitive facts only the owner would know (for example the month the business registered and the plan). Support never asks for, and never reads out, customer details or measurements.
3. **Waiting period: 72 hours**, during which the old email and the phone on file are notified that a recovery is in progress and can cancel it.
4. After the period, support changes the login email through the Supabase dashboard (the only place this is possible; no application code can change another user's login email) and records the case: date, requester, checks passed, operator.
5. The old sessions are revoked.

Parameters needing your decision: waiting period (72 h proposed), who is the operator while the team is one person, where the case log is kept until the Phase 6 audit tooling exists, and whether SMS or WhatsApp is acceptable for the phone check at zero cost. Counsel should review this under R-17. The procedure also reflects a known weakness: it depends on a human, so it is slow and open to social engineering. Encouraging every owner to link Google as well as email (so a lost mailbox is recoverable) is the strongest mitigation and is planned for the Phase 6 settings.

---

## 14. Browser security controls as built (Phase 1, Checkpoint C)

**14.1 Content Security Policy.** Generated at build by `scripts/make-headers.mjs` into `out/_headers` (Cloudflare static assets format). Scripts are allowed only from the app's own origin and by the SHA-256 hash of each page's few inline scripts: there is no `unsafe-inline` and no `unsafe-eval`. Also: `default-src 'self'`, `style-src 'self'`, `img-src 'self'`, `font-src 'self'`, `connect-src 'self'` plus the API origin only, `worker-src 'self'`, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`, `object-src 'none'`. Because hashes change with the app, the headers are regenerated on every build.
Tested in a real browser (`tests/e2e/security.spec.ts`): the whole journey produces zero violations; injected inline scripts and inline event handlers are blocked, including on a page served from the offline cache.

**14.2 Other headers.** `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` disabling camera, microphone, geolocation and payment, `Strict-Transport-Security`, `no-cache` on pages and on `sw.js`, one-year immutable caching only for hashed build assets.

**14.3 What the service worker may cache.** Only the app shell. It ignores every cross-origin request (the API) and every non-GET request, so authenticated data and storage URLs are never cached by it. The only locally stored business data is the Dexie cache (business, profile, recent activity), cleared on sign-out. Pages are cached under the address the policy is attached to, so an offline copy keeps its policy.

**14.4 What is stored on the device.** The session tokens in `localStorage` (section 12.3) and the Dexie cache. Both are removed on sign-out, including when signing out offline. A lost or shared phone still exposes whatever is cached until the user signs out; the planned PIN lock (R-10) arrives with the offline engine in Phase 5.

**14.5 Hosted-build guard.** `scripts/staging-env.mjs` stops a hosted build whose public key is actually a secret key or whose API address is local or not HTTPS, and never prints a key.

**14.6 Known limits.** Unverified on hosted Cloudflare (headers are applied by a local stand-in server that mimics the file format; the first real deployment must be checked with `curl -I`). The policy has not been tested in browsers other than desktop Chromium. No `report-uri` collection exists, so violations on users' phones are invisible to us. CSRF is not applicable (no cookies carry authority; the API takes a bearer token), but any future cookie use must revisit this.
