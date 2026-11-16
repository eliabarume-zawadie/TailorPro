# TailorPro — PHASE0_REVIEW.md

**Status:** Phase 0 DRAFT for your review. **Phase 1 has not started and will not start until you approve.**
`PRD.md` is unchanged.

> **REVISION 2: zero-budget constraint.** See `ZERO_BUDGET_REVIEW.md`. It **supersedes** §2.2–2.4 of this file (Supabase Pro/Vercel Pro cost findings) and register items **R-7** (backups), **R-8** (SMS provider) and **R-16** (hosting) with new decisions **Z-1 to Z-9** (platform, auth, gateway, commercial-terms confirmation, pilot data-safety posture, backup destination, image budget, Next.js static export, domain). R-1 to R-6, R-9 to R-15 and R-17 are unchanged. Z-4 (written confirmation that the vendors' free plans permit a commercial pilot) is a **gate before real businesses use the system**.
>
> **Approved so far: Z-1, Z-2, Z-4.** Phase 1 is still **not authorised**. Still open and needed before Phase 1: **R-1, R-2, R-3, R-4, R-13, R-14**, and a Supabase region choice plus legal view on cross-border hosting (the residual part of R-16). Open but not blocking Phase 1: Z-3 (resolved by a Phase 1 spike), Z-5 to Z-9, R-5, R-6, R-9 to R-12, R-15, R-17.

---

## 0. DECISION RECORD (authoritative, latest first)

**2026-11-16: "Accept all recommendations."** The product owner accepted my recommendation for every open item in the register. Recorded as approved:

| ID | Approved decision |
|---|---|
| R-1 | Server assigns sequential order number on first sync; offline orders show a labelled provisional reference (also on offline receipts/messages) |
| R-2 | Offline-sync overpayment is **recorded and flagged "overpaid, needs review"**; online payments still reject overpayment; owner resolves by refund/adjustment |
| R-3 | Per-field conflict matrix per `SYNC_DESIGN.md` §6; prompt frequency reviewed after pilot |
| R-4 | Roles and server-enforced permissions built from day one; staff invite UI in Phase 6 |
| R-5 | "Total active customers" = customers with `archived_at IS NULL` |
| R-6 | After expiry/grace: read-only plus export, no new records; offline work preserved and shown as rejected until renewal; nothing deleted |
| R-9 | Manual support recovery for lost-phone/no-email accounts, with identity checks and waiting period (procedure to be drafted for your approval); encourage adding email. Largely moot while phone is not a login identity (Z-2) but still applies to lost Google/email access |
| R-10 | App PIN lock after inactivity for offline data; limitation documented |
| R-11 | At least one real mid-range Android test device (and a second lower-end one if possible) **to be provided by you** before Phase 5 |
| R-12 | Android Chrome primary; iOS Safari best-effort with warnings |
| R-13 | No skipping forward (strict next step); owner correction from Collected goes to Ready for collection only; Cancelled not reversible by normal users (owner correction with reason, audited); On hold reason optional |
| R-14 | Order total = Σ item line totals; post-creation price edits versioned and audited; cancelled orders excluded from outstanding balances; no new payments on cancelled orders except refunds |
| R-15 | Plan limits deferred to Phase 6; configurable placeholders clearly marked until you approve numbers |
| R-17 | Legal review by counsel before pilot with real data (action needed from you) |
| Z-3 | Thin Worker gateway if the Phase 1 CPU spike shows it fits; otherwise direct RPC with DB-level limits |
| Z-5 | Pilot disclosed as "best effort, daily backup, no uptime guarantee"; no artificial keep-alive |
| Z-6 | Backup destination decided in Phase 7; restore drill mandatory |
| Z-7 | Compress images to about 150–300 KB; default 3 images/order until R2; ceilings stay 5 MB / 5 |
| Z-8 | Keep Next.js (static export) |
| Z-9 | Custom domain deferred |
| Region | I made no recommendation earlier, so this one is **not covered by "accept all"**. Finding: Supabase lists **no Africa region**. Proposal below |

**Supabase region proposal (needs your confirmation):** Europe, **eu-central-1 (Frankfurt)** or **eu-west-2 (London)**, chosen after a quick latency test from a Malawi connection. Europe is my guess for the best latency to Malawi, not measured. Whether free projects can pick a region was not stated on the page I read. Hosting outside Malawi goes to counsel under R-17.

**Still open and not decidable by me:** (1) Z-4 written vendor confirmation (gate before real data); (2) region confirmation; (3) R-11 device; (4) R-17 counsel; (5) an explicit instruction to start Phase 1, which I have not assumed from "accept all recommendations".

---

## 1. How your decisions were applied

| Decision | Where it landed |
|---|---|
| A Stack | `ARCHITECTURE.md` §1–3; costs §8 |
| B Status rules | `DATABASE_SCHEMA.md` §3.3 transition table; tracker WFL-1…9 |
| C Order-level status | `order_status_history.order_item_id` nullable; ORD-3 |
| D Phone OTP | `SECURITY.md` §3 |
| E Templates | Immutable template versions; MEA-2, MEA-6 |
| F Measurements page | MEA-7 |
| G Reports | Phase 6; RPT-1 |
| H Reminders | AD-8; REM-1 |
| I Export/deletion | AD-9; EXP-1; DEL-1 blocked |
| J Backups | `ARCHITECTURE.md` §7; **conflict found, see 2.2** |
| K Language | AD-6; I18N-1 |
| L Receipts | PAY-5 |
| M Images | `SECURITY.md` §8.1; ORD-4 |
| N Currency | AD-4; CUR-1 |
| O Performance | `ARCHITECTURE.md` §6; PERF-1 |
| P Safeguards | Reflected in all documents; tracker rows tied to each |

Interpretation notes where your wording left a gap (flagged, not silently decided): "Backward transitions between active production statuses" is read as Received…Ready for collection; "Collected" can only be reached from Ready for collection; payment status is derived, not stored.

---

## 2. Findings that need your attention

### 2.1 Vendor-sourced facts and their reliability
Prices came from vendor pages fetched 2026-11-16 (Supabase pricing, Vercel pricing, Twilio Malawi SMS) and from web search for the rest. Third-party SMS comparison prices and the Vercel "non-commercial" wording are **unverified secondary sources**. I could not find an Africa's Talking Malawi rate. Do not budget from the estimates without written quotes. Also, two fetched pages contained text addressed to AI agents (for example, asking to file feedback reports). I ignored that text and did not act on it.

### 2.2 Decision J cannot be met by Supabase alone
Supabase retains 7 days (Pro) or 14 days (Team) of daily backups, not 30, and the Free plan has none. See R-7 for the proposal.

### 2.3 Decision D has a real running cost
Twilio's Malawi rate ($0.3307 per message) is roughly 3–5× the unverified aggregator figures. At pilot scale this is small; at scale it may matter relative to subscription pricing. Provider selection is R-8.

### 2.4 Hosting plan implications of Decision A
Production needs paid plans (Supabase Pro; Vercel Pro for commercial use). Staging on Supabase Free pauses after a week of inactivity. See costs in `ARCHITECTURE.md` §8 (baseline roughly $45–55/month before SMS).

### 2.5 Supabase and offline sync (per your warning)
Confirmed in the design: Supabase gives auth, Postgres, RLS and storage only. Offline persistence, outbox, conflict handling, dedupe and the pull cursor are all custom (`SYNC_DESIGN.md`). The riskiest parts are the pull cursor gap (S2) and Next.js's fit with an offline shell (A1). Both get Phase 1 or Phase 5 spikes with explicit tests.

---

## 3. Items you referred to as "missing requirements 1, 2 and 3" (Decision Q)

A numbering note: in my audit these three were listed under **"Contradictions and tensions"** (items 1–3), not under "Missing requirements" (which began at 7). Your letter's reference matches these three, and my audit's "Decisions I need from you" item 3 asked about "Items 1, 2, 3 and 7". If you meant different items, tell me. Your letter decided item 7 (status rules, Decision B) but did not decide 1, 2 or 3. They remain **open**.

### Item 1 (audit text, verbatim)
> **Offline order numbers vs. "unique order number" (4.5).** A strictly sequential `ORD-0001` can't be generated offline. **Proposal:** the client UUID is the real identity. The order shows "Pending number" until it syncs, and the server then assigns the sequential per-workspace number.

**Options and consequences**

| Option | Consequence |
|---|---|
| a. Server assigns on sync (original proposal) | Simple, gapless sequential numbers. Offline-created orders have no final number until online. A receipt printed or a WhatsApp message sent offline cannot quote the final number |
| b. Per-device prefix (e.g. `ORD-D3-0001`) | Number exists immediately and never collides. Numbers look less clean; device registration needed; one workspace has several sequences |
| c. Reserved number blocks (device pre-reserves e.g. 20 numbers while online) | Final-looking numbers offline most of the time; falls back to pending if the block runs out. Gaps and out-of-order numbers; more server and client logic |

**Recommendation: (a)**, with a clearly labelled provisional reference on offline receipts and messages. It is the simplest and has the fewest failure modes. If tailors must hand customers a final number at the counter while offline, move to (c). **Decision R-1.**

### Item 2 (audit text, verbatim)
> **Offline payments vs. "cannot exceed remaining balance" (4.9).** An offline payment can be valid locally and become an overpayment after another device's payment syncs. **Proposal:** the server records it anyway, because the money was received. It flags the order as "overpaid, needs review" and lets the owner issue a refund or adjustment.

**Options and consequences**

| Option | Consequence |
|---|---|
| a. Record and flag as overpaid (original proposal) | Never loses a payment (matches PRD 5.4). Introduces an "overpaid" state, which PRD 4.9 permits only if explicitly supported and correctly accounted for, so this needs your approval. Owner must resolve it |
| b. Reject at sync and put in the conflict queue | Keeps the "no overpayment" rule intact. The tailor has physically received the money but it is not on record until resolved; risks loss or confusion if ignored |
| c. Accept up to the balance, record the excess as customer credit | Needs a new credit concept and accounting, which is beyond the MVP's "payment-recording tool" scope |

**Recommendation: (a).** Online payments still reject overpayment. Only the offline-sync collision path creates the overpaid state. Change-control summary (CLAUDE.md §12): *Original requirement:* PRD 4.9 no overpayment unless explicitly supported. *Problem:* concurrent offline payments can cause it. *Proposed change:* support "overpaid, needs review" only from sync. *Justification:* PRD 5.4 forbids losing a payment. *Business impact:* owner sees a flag and refunds or adjusts. *Security/data:* append-only preserved. *Cost:* small. *Alternatives:* b, c. *Recommendation:* a. **Decision R-2.**

### Item 3 (audit text, verbatim)
> **"Do not blindly use last-write-wins" (5.4) vs. needing something for plain fields.** **Proposal:** a per-field matrix.
> - Notes and customer fields: field-level merge, with a conflict only when the same field is edited on both devices.
> - Payments: append-only.
> - Measurements: a new version each time, never overwritten.
> - Status: server-validated transitions, with a conflict when the transition is invalid.
> - Price, date and customer on an order: conflict prompt.

The detailed rule table is in `SYNC_DESIGN.md` §6.

**Options and consequences**

| Option | Consequence |
|---|---|
| a. Per-field matrix (original proposal) | Best protection of important data; more code; more conflict prompts for users |
| b. Last-write-wins for plain fields only (notes, customer contact fields), matrix for the rest | Fewer prompts; can silently lose a plain-field edit, which the PRD wants to avoid for "important" data. Acceptable only if you classify contact fields as unimportant |
| c. Prompt on every concurrent edit | Safest; most disruptive for tailors with unreliable connections |

**Recommendation: (a)**, with prompt frequency reviewed after the pilot. **Decision R-3.**

---

## 4. Decision register: all remaining items needing approval

For each: options, consequences, recommendation. I have not assumed any answer; the documents mark the dependent items as **Blocked** in the tracker.

| ID | Decision | Options and consequences | Recommendation |
|---|---|---|---|
| **R-1** | Offline order numbering | See §3 item 1 | (a) server-assigned |
| **R-2** | Offline overpayment | See §3 item 2 | (a) record and flag |
| **R-3** | Conflict matrix | See §3 item 3 | (a) per-field matrix |
| **R-4** | Staff permission model (audit item 4, not yet answered). Your PRD has staff that the owner controls, but the MVP may be single-user | (a) Build roles and server-enforced permissions now, invite UI in Phase 6. (b) Owner only; add roles later (risks a schema or RLS retrofit, and a security regression) | (a). The schema supports multiple members from day one (PRD 3.3) |
| **R-5** | "Total active customers" | (a) Non-archived customers. (b) Customers with at least one active order. (c) Customers with activity in the last N days | (a), simplest and transparent; show (b) separately if wanted |
| **R-6** | Behaviour after subscription expiry/grace (PRD silent beyond "no data erasure") | (a) Read-only plus export, no new records. (b) Fully blocked except export. (c) Fully working until manual suspension. Offline-created records during expiry need a rule too | (a), with offline work preserved and shown as "rejected: plan expired" until renewed |
| **R-7** | 30-day backup retention gap | (a) Pro plan plus external encrypted `pg_dump` with 30-day retention (low cost). (b) Add PITR ($100/mo per 7 days), still not 30 days. (c) Team plan ($599/mo, 14 days), also short and expensive. (d) Lower the target to 7 days | (a). Also back up Storage objects separately; restore drill before pilot |
| **R-8** | SMS provider and budget | See `SECURITY.md` §3.2: native Twilio, Send SMS hook to aggregator, email fallback | Build to the hook abstraction; get Malawi quotes plus Airtel/TNM deliverability test; Twilio acceptable for the pilot |
| **R-9** | Recovery for lost phone with no email, and cooling-period parameters | (a) Manual support recovery with identity checks and waiting period. (b) No recovery (user loses the account). (c) Require an email to be added during onboarding | (a), plus encourage (c). Needs your approval of the identity-check procedure and who performs it |
| **R-10** | Protection of offline data on the device | (a) Rely on OS lock. (b) App PIN lock after inactivity. (c) Encrypted local store keyed from a PIN | (b) for the MVP; document the limitation |
| **R-11** | Real test devices | Which mid-range Android phone(s), and who has access (PRD 11, Decision O) | Provide at least one, plus a second lower-end device if possible |
| **R-12** | Browser support matrix | (a) Android Chrome primary; iOS Safari best-effort with warnings. (b) Full iOS parity (offline storage and install behave differently; more cost and risk) | (a) |
| **R-13** | Status workflow details your letter did not specify | (1) Forward skipping (e.g. Received → Sewing)? (2) Target of an owner correction from Collected? (3) Can Cancelled be reversed? (4) Reason required for On hold? | (1) No skipping; strict next step. (2) Collected → Ready for collection only. (3) Not by normal users; owner correction with reason, audited. (4) Optional note |
| **R-14** | Order price and total definition; cancelled-order treatment | PRD lists "agreed price" at order level while Decision C puts prices on items. (a) Order total = Σ item line totals; edits after creation are versioned and audited (and limited after production starts?). (b) Separate order-level agreed price. Also: do cancelled orders count in outstanding balances; can payments be added to a cancelled order | (a). Exclude cancelled orders from outstanding balances; block new payments on cancelled orders except refunds; show cancelled-order payments in history |
| **R-15** | Plan limits (Free/Solo/Shop numbers) | Numbers are needed in Phase 6 only. PRD says pricing must be validated with Malawi tailors | Defer; use configurable limits in `subscription_plans.limits` with placeholders clearly marked until you approve numbers |
| **R-16** | Hosting confirmation and data location | Confirm Vercel Pro (commercial) vs alternatives; choose the Supabase region nearest users that is acceptable legally; confirm who owns and pays for accounts | Confirm Vercel Pro and region before Phase 1; counsel confirms cross-border implications |
| **R-17** | Legal review | Engage counsel on Malawi data protection, retention, controller/processor roles | Before pilot launch; blocks DEL-1 |

### Minor implementation decisions I will make and document unless you object
Client IDs as UUIDv7; E.164 phone normalisation defaulting to +265; Serwist, next-intl, Zod, Vitest, Playwright and pgTAP as candidate tools (confirmed or replaced by a Phase 1 spike); a `payment_methods`, `currencies`, `platform_settings`, `devices`, `workspace_counters`, `template_versions`, `measurement_revisions`, `subscription_payments`, `support_access_grants`, `export_jobs` table beyond the PRD's recommended list (justified in `DATABASE_SCHEMA.md`); a correction modelled as reversal plus new payment; requirement IDs in the tracker.

### Proposed deviations from the PRD
None to the text. The only item that touches a PRD rule is R-2 (offline overpayment). Everything else is clarification or a gap.

---

## 5. Remaining PRD requirements and how each will be satisfied

The complete mapping is in `IMPLEMENTATION_TRACKER.md` (about 75 rows covering every PRD section and every approved decision, each with a planned implementation, test type, and status). Every row is currently Not Started, Blocked (naming the R-n), or In Progress (documentation rows).

---

## 6. What I need from you to proceed

1. Answers or confirmation for R-1…R-17 (at minimum R-1…R-4, R-7, R-8, R-13, R-14, R-16 before Phase 1; others by the phase noted in the register).
2. Approval of the architectural choices AD-1 (writes through server functions) and AD-2 (client-rendered authenticated shell). Both are inside the approved stack, but they shape everything after.
3. Approval to start Phase 1 once the above are settled. I will begin with the two spikes (offline app shell on Next.js; Supabase phone auth with the Send SMS hook), then report before building features.
