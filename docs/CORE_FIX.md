# CORE_FIX.md — Creatick System Hardening
> Apply every fix in this file before shipping any feature to production.
> This document covers race conditions, concurrency, trust, and scale issues
> specific to Creatick's chat-based transaction and seat selection system.
> Read alongside AGENTS.md. This file handles the "what can go wrong at scale" layer.

---

## 1. SEAT RESERVATION LOCK (Race Condition Fix)

### The Problem
Two users open the same seat map simultaneously. Both see seat B-12 as available.
Both click it at the same millisecond. Without a lock, both get a confirmed ticket
for the same seat. This is guaranteed to happen on any event with 50+ concurrent buyers.

### The Fix — Two-Phase Seat Reservation

**Phase 1: Temporary Lock (frontend selection → backend hold)**

When a buyer clicks a seat on the seat map, immediately call:
```
POST /api/seat-locks
{ seatId, ticketTypeId, sessionId }
```

Server behavior:
1. Open a database transaction
2. SELECT the seat row WITH a row-level lock: `SELECT ... FOR UPDATE NOWAIT`
3. If seat status is not `available` → return `409 SEAT_UNAVAILABLE` immediately
4. If available → set seat status to `reserved`, store `reserved_by = sessionId`,
   set `reserved_until = now() + 10 minutes`
5. Commit transaction
6. Return success with `lock_expires_at` timestamp

If two requests arrive simultaneously, the database lock ensures only one succeeds.
The second receives `409` and the frontend shows "Someone just took this seat — pick another."

**Phase 2: Lock Expiry Cleanup**

Run a background job every 60 seconds:
```sql
UPDATE seats
SET status = 'available', reserved_by = NULL, reserved_until = NULL
WHERE status = 'reserved'
AND reserved_until < NOW();
```

Show a countdown timer in the UI: "Your seat is held for 9:42"
If timer hits zero before request is submitted → auto-release, show modal:
"Your seat hold expired. Please select again."

**Phase 3: Confirm on Request Submit**

When buyer submits the ticket request:
1. Re-validate inside a new transaction: seat must still be `reserved` by THIS session
2. If not → block submission, return `409 LOCK_EXPIRED`
3. If yes → transition seat from `reserved` → `pending_payment`
4. Status only becomes `sold` when admin confirms payment

**Seat Status Flow:**
```
available → reserved (10 min hold) → pending_payment → sold
                ↓ (timeout)
            available (auto-released)
```

### Database Schema Addition
```sql
ALTER TABLE seats ADD COLUMN reserved_by    VARCHAR(255) NULL;
ALTER TABLE seats ADD COLUMN reserved_until TIMESTAMP   NULL;

-- Index for cleanup job performance
CREATE INDEX idx_seats_reserved_until ON seats(reserved_until)
WHERE status = 'reserved';
```

### Frontend Realtime Seat Map
Connect to a WebSocket room per event: `ws://app/events/:eventId/seats`

Server emits on any seat status change:
```json
{ "type": "SEAT_UPDATE", "seatId": "B-12", "status": "reserved" }
```

Frontend applies update immediately — all viewers see the seat color change in realtime.
Never trust the seat map snapshot from page load — always reflect live state.

---

## 2. ADMIN CLAIM RACE CONDITION FIX

### The Problem
Two admins see the same unclaimed ticket request. Both click "Claim" at the same time.
Both enter the chat. Buyer receives messages from two different admins. Chaos.

### The Fix — Atomic Claim

```sql
UPDATE ticket_requests
SET claimed_by = :adminId,
    status = 'in_progress',
    claimed_at = NOW()
WHERE id = :requestId
AND claimed_by IS NULL        -- only succeeds if not yet claimed
AND status = 'requested'
RETURNING id, claimed_by;
```

If `RETURNING` comes back empty → another admin already claimed it.
Return `409 ALREADY_CLAIMED` with `{ claimedBy: "Admin Name" }`.

UI behavior:
- Admin who loses the race sees: "Already claimed by Rina — 2 seconds ago"
- Request disappears from their unclaimed inbox immediately
- No double-chat, no confusion for buyer

---

## 3. REQUEST SPAM & WAR TICKET PROTECTION

### The Problem
- One user spams 50 requests blocking all available seats/tiers
- Event opens at 10:00, 500 users hit the endpoint at 10:00:00.000 simultaneously
- Admin inbox gets 500 new chats in 5 seconds — unusable

### Fix A — Max Active Requests per User per Event
```sql
-- Before creating a new ticket_request, check:
SELECT COUNT(*) FROM ticket_requests
WHERE buyer_id = :userId
AND event_id = :eventId
AND status IN ('requested', 'in_progress', 'pending');
```
If count >= 1 → return `429 MAX_REQUESTS_REACHED`
Message: "You already have an active request for this event.
Complete or cancel it before making a new one."

One active request per user per event. Non-negotiable.

### Fix B — Request Rate Limiting
Apply at the API gateway level, not just per-user:

| Endpoint | Limit | Window |
|---|---|---|
| `POST /ticket-requests` | 3 requests | per user per minute |
| `POST /seat-locks` | 10 requests | per user per minute |
| `POST /auth/*` | 5 requests | per IP per minute |
| `POST /chat/messages` | 60 messages | per user per minute |

Use Redis with sliding window counter:
```
KEY: rate:{userId}:{endpoint}
TTL: window duration
INCR on each request → if > limit → return 429
```

### Fix C — Queue System for High-Demand Events (Ticket War)
For events the creator marks as "High Demand" (expected > 200 simultaneous buyers):

1. When sales open, buyers enter a **virtual waiting room** instead of hitting the seat map directly
2. Each buyer gets a random position in the queue (not first-come-first-served on page load — this prevents server hammering and advantages users with fast internet)
3. Every 30 seconds, the next N buyers are let in to select seats (N = estimated admin capacity)
4. Buyer sees: "You are position 47 in the queue. Estimated wait: 4 minutes."

This is simpler to implement than it sounds — it is just a Redis sorted set:
```
ZADD queue:{eventId} {timestamp} {userId}
ZRANK queue:{eventId} {userId}  → position
```

---

## 4. FAKE TRANSFER PROOF PROTECTION

### The Problem
Buyers can upload edited screenshots. Admins manually verify — error-prone especially
during high-volume periods. No audit trail if dispute arises.

### Fix A — Mandatory Reference Number Field
Add a required `transfer_reference` field to the payment proof submission:

```
Buyer must provide:
- Screenshot/image upload (existing)
- Transfer reference number (new, required text field)
- Sender bank/e-wallet name (new, required select field)
- Transfer amount (new, required number field — must match ticket price)
```

Amount field is validated server-side: if submitted amount < ticket price → reject
with `400 AMOUNT_MISMATCH`. This alone eliminates most casual fraud.

### Fix B — Immutable Audit Log
Every action on a ticket_request is logged and cannot be edited or deleted:

```sql
CREATE TABLE ticket_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID REFERENCES ticket_requests(id),
  actor_id    UUID REFERENCES users(id),
  actor_role  VARCHAR(50),   -- 'buyer', 'admin_service', 'creator'
  action      VARCHAR(100),  -- 'proof_submitted', 'payment_confirmed', 'ticket_issued', etc.
  metadata    JSONB,         -- { amount, reference, notes, ip_address }
  created_at  TIMESTAMP DEFAULT NOW()
);
```

This log:
- Is append-only (no UPDATE or DELETE ever)
- Records IP address of every action
- Is visible to Creator in event analytics
- Serves as evidence in any dispute

### Fix C — Admin Confirmation Requires Acknowledgement
When admin clicks "Confirm Payment", show a modal:

```
"Confirm Payment Received

Reference: BCA-20260607-91823
Amount: Rp 150,000
Sender: Budi Santoso

By confirming, you verify you have checked this payment
and it matches the ticket price. This action is logged.

[ Cancel ]  [ Yes, Confirm Payment ]"
```

This slows down accidental confirmations and creates a conscious paper trail.

---

## 5. SEAT MAP ↔ TICKET QUANTITY SYNC

### The Problem
Creator builds a seat map with 80 seats but sets `ticket_type.quantity = 100`.
Or vice versa: 100 seats, quantity set to 50 — seats show available but can't be bought.

### The Fix — Auto-Sync on Save

When creator saves the seat map:
```
total_seats = count of all seat objects in the map
ticket_type.quantity = total_seats   (auto-updated, not manual)
ticket_type.sold_count = count of seats WHERE status = 'sold'
ticket_type.available = total_seats - sold_count - reserved_count
```

UI: show a read-only "Seat count" field that updates as creator adds/removes seats:
"Your seat map has 84 seats. Ticket quantity has been set to 84."

Creator cannot manually set a quantity that differs from the seat map count.
For entry tickets (no seat map), quantity remains manually settable.

---

## 6. ADMIN INBOX SCALE FIX

### The Problem
500 requests come in during a war ticket event. The admin inbox becomes a list of
500 unread chats. Admin cannot find priority items. Response time collapses.
Buyers wait hours for a reply.

### Fix A — Auto-Assignment by Load Balancing
When a ticket request is created, auto-assign to the admin with the least active chats:

```sql
SELECT ar.user_id, COUNT(tr.id) as active_chats
FROM admin_roles ar
LEFT JOIN ticket_requests tr
  ON tr.claimed_by = ar.user_id
  AND tr.status IN ('in_progress', 'pending')
WHERE ar.event_id = :eventId
AND ar.is_active = true
AND ar.permissions @> '["service"]'   -- only Service role admins
GROUP BY ar.user_id
ORDER BY active_chats ASC
LIMIT 1;
```

Auto-assign the new request to this admin. Admin is notified immediately.
Creator can see assignments and manually reassign from the dashboard.

### Fix B — Canned Response Templates
Creator/Admin can pre-write response templates in event settings:

```
Template: "Payment Instructions"
---
Halo [buyer_name]! Terima kasih sudah request tiket [ticket_type] untuk [event_name].

Silakan transfer ke:
Bank BCA - 1234567890 - a/n Event Organizer

Total: [ticket_price]

Harap cantumkan nama kamu sebagai keterangan transfer.
Setelah transfer, kirim bukti di sini ya! 🎉
```

Variables `[buyer_name]`, `[ticket_type]`, `[ticket_price]`, `[event_name]` are
auto-filled from the request context.
Admin sends with one click — no retyping.

### Fix C — Priority Inbox Sorting
Default inbox sort is NOT by newest first. Sort by:

```
Priority Score = (time_since_last_buyer_message * 2) + (status_weight)

Status weights:
  requested    = 100  (needs first response — highest urgency)
  pending      = 80   (buyer says they paid — needs verification)
  in_progress  = 20   (active conversation — lower urgency)
```

Threads with no admin response for > 2 hours get a red "URGENT" flag.
Creator sees a banner: "12 requests waiting > 2 hours."

### Fix D — Bulk Actions
For high-volume events, admin can:
- Select multiple `requested` threads → "Send payment instructions to all (use template)"
- Select multiple `pending` threads → "Mark all as confirmed" (with confirmation modal)
- Filter by status, tier, time range before bulk action

---

## 7. REFUND SYSTEM

### The Problem
Refund is mentioned in the role system but has no defined workflow.
Without a clear process, disputes have no resolution path.

### Fix — Defined Refund Flow

**Creator sets Refund Policy per event (required field, cannot publish without it):**

| Policy | Description |
|---|---|
| Full Refund | 100% refund if requested > 48h before event |
| Partial Refund | 50% refund if requested > 24h before event |
| No Refund | No refunds after payment confirmed |
| Custom | Creator defines their own terms (text field) |

**Refund Request Flow:**
```
Buyer requests refund (from Ticket Wallet)
  → System checks if within refund window (policy + event date)
  → If outside window → blocked, show policy explanation
  → If within window → creates refund_request record
  → Auto-assigned to Service admin
  → Admin reviews → Approve or Reject (with mandatory reason)
  → If approved:
      - ticket status → 'refunded'
      - seat status → 'available' (if seat ticket)
      - ticket_type.sold_count decremented
      - QR code invalidated immediately
      - Creator notified: "Refund approved for [buyer] — remember to process manual refund"
  → Creator sees pending manual refunds in dashboard with buyer bank details
```

**Database addition:**
```sql
CREATE TABLE refund_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID REFERENCES tickets(id),
  buyer_id        UUID REFERENCES users(id),
  reason          TEXT NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected
  reviewed_by     UUID REFERENCES users(id),
  review_note     TEXT,
  requested_at    TIMESTAMP DEFAULT NOW(),
  reviewed_at     TIMESTAMP
);
```

---

## 8. PRIVATE EVENT LINK SECURITY

### The Problem
A private event link is just a URL. Buyer forwards it to 100 friends.
Creator has no control or visibility.

### Fix — Access-Controlled Private Links

**Option A: Login-Required Access (recommended for v1)**
Private event URLs require the viewer to be logged into a Creatick account.
Anonymous access → redirect to login → after login → redirect back to event.
This alone prevents link-forwarding to non-users.

**Option B: Invite-Only with Token (for stricter events)**
Creator generates invite tokens per person:
```
POST /events/:id/invites
{ emails: ["a@mail.com", "b@mail.com"] }
```
Each invitee gets a unique link: `creatick.app/events/:id?invite=TOKEN`
Token is tied to their email — only works when logged in with that email.
Creator can see how many invites were sent and how many accessed the event.

**For v1.0: implement Option A. Option B in v1.1.**

---

## 9. OFFLINE / POOR SIGNAL CHECK-IN

### The Problem
Event venues frequently have bad internet. Attendance admin's scanner fails.
200 people queuing at the door. Chaos.

### Fix — Progressive Check-In with Local Cache

When Attendance admin opens the Scanner tab, the app:
1. Downloads a local snapshot of all valid ticket QR codes for that event
   (just the hashed QR payloads — no personal data beyond name and ticket number)
2. Stores in browser IndexedDB / localStorage

```javascript
// Cached locally on scanner open
{
  eventId: "...",
  cachedAt: "2026-06-07T07:45:00Z",
  tickets: [
    { qrHash: "abc123...", holderName: "Budi", ticketType: "VIP", isCheckedIn: false }
  ]
}
```

When internet is unavailable:
- Scanner validates QR against local cache
- Check-in is marked locally with timestamp
- A "OFFLINE MODE" banner is shown to admin

When internet restores:
- All offline check-ins are synced to server in one batch
- Server validates and resolves any conflicts (e.g., same ticket scanned on two devices)

**Conflict resolution rule:** First scan timestamp wins. If ticket was scanned offline on device A at 08:02 and online on device B at 08:05 → device A's check-in is the canonical record.

---

## 10. CONSISTENT SOLD_COUNT & AVAILABILITY

### The Problem
`sold_count` and seat availability are modified from multiple places:
- Ticket confirmed → sold_count++
- Refund approved → sold_count--
- Seat lock expires → availability changes
- Admin manually creates comp ticket → sold_count++

If any of these happen outside a transaction, counts drift from reality.
This is a silent killer — shows 5 tickets available when actually 0.

### Fix — Single Source of Truth, Always Computed

Never store `available_count` as a column. Always compute it:

```sql
-- available is always derived, never stored
SELECT
  quantity,
  (SELECT COUNT(*) FROM tickets t
   JOIN ticket_requests tr ON t.request_id = tr.id
   WHERE tr.ticket_type_id = tt.id
   AND tr.status = 'owned') AS sold_count,
  quantity - (
    SELECT COUNT(*) FROM ticket_requests
    WHERE ticket_type_id = tt.id
    AND status IN ('owned', 'pending_payment')
  ) AS available_count
FROM ticket_types tt
WHERE tt.id = :id;
```

`sold_count` in the `ticket_types` table is kept as a **denormalized cache** for display speed,
but it is **always recomputed from source** before any critical operation (purchase, lock, confirm).

Add a reconciliation job that runs every 5 minutes:
```sql
UPDATE ticket_types tt
SET sold_count = (
  SELECT COUNT(*) FROM ticket_requests tr
  WHERE tr.ticket_type_id = tt.id
  AND tr.status = 'owned'
)
WHERE tt.id = ANY(:eventTicketTypeIds);
```

If cache and computed value differ by more than 0 → log an alert. Never silently drift.

---

## 11. QR CODE SECURITY

### The Problem
QR codes are the final trust layer. If they can be forged or reused, the entire
ticket system is broken.

### Fix — HMAC-Signed, Single-Use QR

**Generation:**
```javascript
const payload = {
  ticketId:   ticket.id,
  eventId:    event.id,
  issuedAt:   Date.now(),
  holderHash: sha256(buyer.email + ticket.id)  // ties QR to specific holder
};

const signature = hmac_sha256(JSON.stringify(payload), process.env.QR_SECRET);
const qrData = base64url(JSON.stringify({ ...payload, sig: signature }));
```

**Validation on scan:**
```javascript
1. Decode base64url → parse JSON
2. Recompute HMAC → compare with sig field (timing-safe comparison)
3. If signature invalid → REJECT (forgery attempt)
4. If ticketId not found in DB → REJECT
5. If ticket.status !== 'owned' → REJECT with status reason
6. If ticket.is_checked_in === true → REJECT with "Already scanned at [time]"
7. If event.event_date < today - 1 day → REJECT (expired event)
8. All checks pass → mark is_checked_in = true, log check-in
```

Step 8 must also use `UPDATE ... WHERE is_checked_in = false RETURNING id` to prevent
double check-in from two scanners hitting the endpoint simultaneously.

---

## IMPLEMENTATION PRIORITY ORDER

Fix these in this exact order — each one builds on the previous:

| # | Fix | Why First |
|---|---|---|
| 1 | Seat reservation lock + atomic claim | Data integrity — everything else breaks without this |
| 2 | Max 1 active request per user per event | Prevents inbox flooding before you have admin tooling |
| 3 | Rate limiting (Redis) | Protects server from war-ticket traffic spikes |
| 4 | QR HMAC signing | Security baseline — must be right before first real event |
| 5 | sold_count reconciliation job | Silent count drift is hard to debug after the fact |
| 6 | Audit log (append-only) | Needed before any money changes hands |
| 7 | Canned response templates + auto-assign | Admin operability at scale |
| 8 | Transfer proof validation (amount field) | Reduces fraud before payment gateway exists |
| 9 | Refund flow + policy | Legal and trust baseline |
| 10 | Private event login-required | Low effort, high security gain |
| 11 | Offline check-in cache | Venue reliability |
| 12 | Virtual waiting room queue | Only needed when expecting > 200 simultaneous buyers |

---

## DEFERRED TO LATER VERSIONS

These are valid improvements but not critical for v1.0 launch:

- **Payment gateway** (Midtrans/Xendit) — eliminates manual proof entirely. Target v2.0.
- **Waiting list** — buyers queue for sold-out events. Target v1.1.
- **Transferable tickets** — buyer can transfer to another Creatick user. Target v1.1.
- **Invite-only private event tokens** — per-person invite links. Target v1.1.
- **Event analytics dashboard** — revenue charts, conversion rates. Target v1.1.
- **Multi-currency** — Target v2.0.

---

*Last updated: 2026 — Creatick v2.0*
*Apply all Priority 1–6 fixes before the first live event. No exceptions.*
