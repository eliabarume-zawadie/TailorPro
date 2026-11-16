# TailorPro — SYNC_DESIGN.md

**Status:** Phase 0 DRAFT. Design only. Offline engine implementation is Phase 5 (PRD §14), but its constraints shape Phase 1–4 (see `ARCHITECTURE.md` AD-3).
**Source:** PRD §5, §11; CLAUDE.md §7; Decisions A, B, C, M, P.
Supabase provides the database and auth, **not** offline synchronization. Everything below is custom.

Items marked **[R-n]** depend on a decision not yet approved (see `PHASE0_REVIEW.md`).

> **REVISION 2 (zero-budget, pending approval).** The sync design is unchanged in substance. Differences: push/pull are Postgres RPC functions reached through a thin Cloudflare Worker (or directly, decision Z-3) instead of Next.js route handlers; the pull cursor and idempotency design are the same; `sync_operations` rows are pruned after about 90 days; a free Supabase project may **pause** after about a week of low activity, so sync must treat "server unreachable" as a normal, long-lived state (the outbox already preserves data). Add test: sync resumes correctly after a multi-day server outage. See `ZERO_BUDGET_REVIEW.md` §4, §8, risk Z1.

---

## 1. Principles
1. Local write first: an operation is persisted in IndexedDB (data **and** outbox entry, in a single Dexie transaction) before the UI says "Saved locally".
2. "Synchronized" is shown **only** after a server acknowledgement for that operation. Never inferred from `navigator.onLine`, request dispatch, or a 2xx without a matching ack body.
3. Operations are idempotent and append-oriented. Payments and history are never overwritten.
4. No silent data loss: anything the server cannot apply becomes a visible conflict or failure that the user can act on.
5. Foreground sync with retries is the mechanism. Background Sync API is at most an optional enhancement (PRD §5.3).

---

## 2. Local storage (Dexie)

| Store | Purpose |
|---|---|
| `customers`, `orders`, `orderItems`, `orderSnapshots`, `statusHistory`, `payments`, `paymentAdjustments`, `measurementProfiles`, `measurementRevisions`, `measurementValues`, `templates`(+versions, fields), `attachments` (metadata + blob queue), `reminders` | Mirror of server tables for the workspace(s), subset downloaded after first sync |
| `outbox` | Pending operations (see §3) |
| `syncMeta` | Per-workspace pull cursor, last successful sync time, device ID, schema version |
| `conflicts` | Open conflicts mirrored from the server or detected locally |

Every local record carries `_syncState`: `saved_locally | pending | synchronizing | synchronized | failed | conflict` (the six states in PRD §5.2), `_version` (last known server version), `server_seq` (last applied). UI sync badges read these; they are never set optimistically.

- Search runs on Dexie indexes (name prefix, phone) with a budget of < 300 ms (Decision O).
- Dexie schema upgrades are versioned and tested with data present. A failed upgrade must not drop the outbox.
- Request `navigator.storage.persist()` and report whether it was granted. Show a warning for unsynced data if not (browsers may evict storage, particularly iOS).
- Multi-tab: a single sync leader at a time (Web Locks API, with BroadcastChannel fallback) so two tabs never push the same outbox concurrently.

---

## 3. Outbox entry

```
outbox {
  op_id            uuid   // idempotency key, generated once, never regenerated on retry
  workspace_id     uuid   // claim only; server verifies
  device_id        uuid
  entity           'customer' | 'order' | 'order_item' | 'payment' | 'payment_adjustment'
                   | 'status_change' | 'measurement_revision' | 'attachment' | ...
  entity_id        uuid   // client-generated
  type             'create' | 'update' | 'archive' | 'restore' | 'status' | 'append'
  base_version     int | null   // server version the edit was based on (for conflict detection)
  payload          json
  depends_on       op_id[]      // e.g. order depends on its customer create
  attempt_count, next_attempt_at, last_error
  state            'pending' | 'in_flight' | 'acked' | 'failed' | 'conflict'
  created_local_at, seq_local  // monotonic local ordering
}
```

---

## 4. Push protocol

`POST /api/sync/push` (authenticated, JWT):

1. Server resolves the user and verifies **membership** of every workspace referenced. Ops for workspaces the user is not a member of are rejected as `forbidden`, with no data returned.
2. Ops are processed in `seq_local` order, **each in its own transaction (savepoint)**:
   - Lookup `sync_operations(workspace_id, op_id)`. If present → return the stored result (idempotent replay, nothing applied twice).
   - Verify permission, plan limits, referenced IDs belong to the same workspace (composite FKs), validate payload (Zod and DB constraints).
   - Apply via the same Postgres functions the online UI uses (single code path).
   - Record the result in `sync_operations` in the same transaction.
3. Response per op: `{op_id, status: applied | duplicate | rejected | conflict | dependency_missing, server_version, server_seq, assigned_fields (e.g. order_number), error_code}`.
4. Client marks an op `acked` and the record `synchronized` **only** when it receives `applied` or `duplicate` for it. Anything else keeps the record visibly unsynchronized.
5. One failing op does not block unrelated ops; ops depending on a failed op wait.

Interrupted push: if the response is lost, the client cannot know the outcome, so it resends the same `op_id`. The server returns the stored result. No duplicates are possible because of `PRIMARY KEY(workspace_id, op_id)` and entity-level unique IDs.

---

## 5. Pull protocol

`GET /api/sync/pull?workspace=…&cursor=…`:
- Returns rows changed after `cursor` (from `server_seq`), in pages, including archived rows (archive is a state, so there are **no hard-delete tombstones** because records are never hard-deleted).
- RLS applies; the server also verifies membership explicitly.
- First sync downloads a bounded dataset (full customer/order history for the workspace is a PRD-driven decision about local volume; assume full history for MVP-size shops, and measure on the device test).
- The client applies pulled rows in a Dexie transaction, **skipping any record with a pending local operation** (surfacing a conflict if the server version differs from `base_version`).
- **Cursor gap risk:** sequence values can commit out of order, so a naive "greater than last seen" cursor can skip rows. Mitigation to be finalised and tested in Phase 5: cursor based on transaction-snapshot visibility (e.g. `pg_snapshot_xmin`) or a bounded overlap window with idempotent apply. A test with concurrent transactions is required.

Sync triggers: app open, regain connectivity, after each local write (debounced), manual "Sync now", and periodic timer while foregrounded. Retry uses exponential back-off with jitter and a cap; auth failures pause sync and ask for sign-in without discarding data.

---

## 6. Conflict handling

**Detection:** each editable server row has `version`. An update op carries `base_version`. If `server.version ≠ base_version`, the rules below apply.

### Proposed per-entity rules **[R-3, pending approval]**

| Data | Rule |
|---|---|
| **Payments** | Append-only. Never conflict; both devices' payments are kept. Idempotency key prevents duplicates. Overpayment resulting from concurrent offline payments **[R-2]** |
| **Payment adjustments** | Append-only. Over-adjustment (> payment amount) rejected with `conflict` and shown to the owner |
| **Measurements** | Every edit creates a new revision. Concurrent edits both persist as separate revisions. The "latest" is by server time, and the UI shows that two edits exist so a person can choose which to use for future orders. Nothing is overwritten |
| **Order snapshots** | Immutable; created once with the order |
| **Order status** | Server validates the transition from the **current server status**. If valid, applied and appended to history. If the order moved elsewhere (e.g. cancelled, or already past that status) and the transition is now invalid → `conflict` presented to the user with both histories. Never silently dropped or force-applied |
| **Order important fields** (customer, promised date, item prices/quantities, items) | Concurrent edits to the same order's important fields → `conflict` requiring a user decision (keep server / apply mine / edit) |
| **Order notes, customer fields (name, phone, email, address, notes)** | Field-level merge when different fields were changed; a conflict only when the **same field** differs on both sides |
| **Archive/restore** | Latest by server time wins, but history is recorded; archiving does not delete anything |
| **Independent new records** | Sync independently; no conflict |
| **Attachments** | Independent; the image-count limit is checked on finalize; excess is reported as a failure, not silently dropped |

Conflicts are stored in `sync_conflicts` and local `conflicts`, shown in a visible queue with state "Conflict requires attention", and block nothing else. Resolution creates a new, audited operation.

---

## 7. Specific hard cases

### 7.1 Order numbers offline **[R-1]**
Order identity is the client UUID. `order_number` is assigned by the server on first successful push using `workspace_counters`. Until then the UI shows a provisional local reference (short code derived from the UUID, clearly labelled "Pending number"). Receipts printed offline show that provisional reference and state it is provisional. Alternatives and consequences are in `PHASE0_REVIEW.md`.

### 7.2 Payments offline **[R-2]**
A payment recorded offline is saved locally, shown immediately in the local balance, and marked pending. On push, the server applies it. If another device's payment made the order overpaid, the proposed behaviour is to **record it** (the money was received) and flag the order `overpaid, needs review`. The owner resolves with a refund or adjustment transaction. This requires explicit approval because PRD §4.9 only allows overpayment if it is explicitly supported and correctly accounted for.

### 7.3 Dependencies
An order created offline for an offline-created customer lists the customer op in `depends_on`. If the server processes the order first, it returns `dependency_missing` and the client retries after the customer op is acknowledged. Measurement snapshots are created from local data at order creation and travel in the order op.

### 7.4 Images (Decision M)
Compressed blob stored in Dexie, with metadata op in the outbox. Upload sequence: init → signed upload → finalize (server verifies type and size). Resumable on failure; the blob is kept until finalize is acknowledged. Storage-quota errors are surfaced.

### 7.5 Expired subscription while offline
Local use continues. On sync the server decides according to **R-6**. Nothing local is deleted. If an operation is rejected for plan reasons, it is surfaced as failed, with the data preserved.

### 7.6 Auth while offline
Local reads work with an expired access token. The client refreshes the token when online. If the refresh token is invalid (revoked, removed member), sync pauses, and the outbox is preserved until the user signs in again or explicitly discards (see `SECURITY.md` §6).

### 7.7 Clocks
The server timestamp is authoritative for ordering and history. Device timestamps are stored as `client_*_at` for display and troubleshooting only. Deadline categories use the business timezone and the device's current date; a notice appears if the device clock differs notably from server time (when known).

### 7.8 Dashboard offline
Computed locally from Dexie, labelled with "last synced at". Values update after local writes and after pulls.

---

## 8. Sync UI states (PRD §5.2)

| State | Meaning | Set when |
|---|---|---|
| Saved locally | Persisted in IndexedDB, not yet queued for send | Local transaction committed |
| Pending synchronization | In outbox waiting | Outbox entry exists and no attempt in flight |
| Synchronizing | In flight | Request active |
| Synchronized | Server acknowledged | `applied` or `duplicate` response received |
| Synchronization failed | Last attempt failed; will retry or needs action | Network/server/validation error |
| Conflict requires attention | Needs user decision | `conflict` response or local detection |

A global indicator shows counts per state. The app never shows "Synchronized" for a record that has not been acknowledged.

---

## 9. Offline test plan (CLAUDE.md §7, PRD §5.6)

Run in Playwright with controlled network (offline mode, throttling, request abort mid-flight), plus **manual runs on a real mid-range Android device** (desktop-only results are not accepted as evidence; PRD §11).

1. Create customer offline → close and reopen → customer present.
2. Create order offline → restart browser/device → order present.
3. Record payment offline → balance updates locally.
4. Restore connectivity → all ops sync; states progress to Synchronized only after ack.
5. Repeat sync → no duplicate customer, order or payment.
6. Abort network mid-push at several points (before send, after send before response, mid-batch) → safe retry, no duplicates, no loss.
7. Two devices edit the same order/customer → conflict handling per §6.
8. Two devices record payments near the balance → both kept; overpaid handling per R-2.
9. Business B user attempts to push/pull Business A data and IDs → rejected, nothing leaked.
10. Revoked session with pending outbox → data preserved, sign-in prompt.
11. Dexie schema upgrade with pending outbox → outbox intact.
12. Out-of-order dependencies → eventually consistent.
13. Image upload interruption and resume; invalid type or oversize rejected server-side.
14. Storage persistence denied or quota exceeded → user warned.
15. Pull cursor under concurrent commits → no skipped rows.

---

## 10. Offline and synchronization risk assessment

| # | Risk | Likelihood / impact | Mitigation | Verification |
|---|---|---|---|---|
| S1 | Duplicate records on retry | Med / High | Client UUIDs, `sync_operations` ledger, unique constraints | Test 5, 6 |
| S2 | Pull cursor skips rows | Med / High (silent staleness) | Snapshot-based cursor or overlap + idempotent apply | Test 15 |
| S3 | Offline order-number collisions | High if naive | Server-assigned numbers [R-1] | Test 2, 4 |
| S4 | Overpayment from concurrent offline payments | Med / Med | Record and flag [R-2] | Test 8 |
| S5 | Lost update on shared fields | Med / Med | `base_version`, field-level merge, conflict UI | Test 7 |
| S6 | Status conflicts (cancelled elsewhere) | Med / Med | Server validates transition; conflict queue | Test 7 |
| S7 | Browser storage eviction (esp. iOS) | Med / High | `persist()`, warnings, Android-primary support [R-12] | Device test |
| S8 | Two tabs syncing concurrently | Med / Med | Web Locks leader | Test (multi-tab) |
| S9 | Client clock skew | Med / Low–Med | Server time authoritative | Unit test |
| S10 | Stale local auth after membership removal | Low / High | Server checks on every push/pull; quarantine locally | Test 9, 10 |
| S11 | Dexie migration bug drops data | Low / High | Versioned upgrades, test with data, never clear the outbox | Test 11 |
| S12 | Large first sync on poor network | Med / Med | Paged pull, resumable cursor, progress UI, measured on device | Perf test |
| S13 | Service worker serves stale app version against a new API | Med / Med | Versioned API, client schema version in sync handshake, update prompt | Integration test |
| S14 | Sensitive data left on shared device | Med / High | PIN lock (R-10), explicit logout rules | Manual + e2e |
| S15 | False "synchronized" indicator | Low / High | State machine tests; ack-only transitions | Unit and e2e |
| S16 | Plan-limit rejection of already-recorded offline work | Med / Med | Preserve and surface as failed; owner decides; never delete | Test 5 variants |
