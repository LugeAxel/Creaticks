# eventrefine.md — Creatick Event Lifecycle & Refinement
> This document refines the event system to feel like a real, production-grade platform.
> Every rule here fills a gap that makes the app feel unfinished or toy-like without it.
> Read alongside AGENTS.md and CORE_FIX.md.

---

## 1. ATTENDANCE GATE — CONFIRMED TICKETS ONLY

### The Rule
Only tickets with status `owned` (payment confirmed) may appear in the attendance list
and be scannable at the door. All other statuses are invisible to the check-in system.

### Status Eligibility Table

| Ticket Status   | Appears in Attendance List | QR Scannable | Reason |
|-----------------|:--------------------------:|:------------:|--------|
| `requested`     | ❌ No                      | ❌ No        | Not paid |
| `in_progress`   | ❌ No                      | ❌ No        | Not paid |
| `pending`       | ❌ No                      | ❌ No        | Payment unverified |
| `owned`         | ✅ Yes                     | ✅ Yes       | Confirmed paid |
| `cancelled`     | ❌ No                      | ❌ No        | Voided |
| `expired`       | ❌ No                      | ❌ No        | Voided |
| `refunded`      | ❌ No                      | ❌ No        | Reversed |

### Implementation

**Attendance list query — always filter at DB level, never at UI level:**
```sql
SELECT t.*, u.name AS holder_name, tt.name AS tier_name
FROM tickets t
JOIN ticket_requests tr ON t.request_id = tr.id
JOIN users u ON tr.buyer_id = u.id
JOIN ticket_types tt ON t.ticket_type_id = tt.id
WHERE tr.event_id = :eventId
AND tr.status = 'owned'          -- hard filter, not optional
ORDER BY t.issued_at ASC;
```

**QR scan validation — add status check before marking check-in:**
```
1. Decode and verify HMAC signature
2. Load ticket from DB
3. Verify ticket_request.status = 'owned' → if not, REJECT with "Ticket not valid"
4. Verify is_checked_in = false → if true, REJECT with "Already scanned"
5. Verify event_id matches → if not, REJECT with "Wrong event"
6. All pass → mark checked in
```

**UI:**
- Attendance tab shows a count: "X / Y Hadir" where Y = total owned tickets only
- If an admin tries to scan a non-owned QR, show: "Tiket belum dikonfirmasi pembayarannya"
- Never show pending/requested tickets in the attendance table even as grayed-out rows

---

## 2. EVENT TIMESPAN — START & END TIME

### What to Add

Every event now has two time fields in addition to the date:
- `event_start_time` — when the event begins (e.g. 19:00)
- `event_end_time` — when the event ends (e.g. 23:00)
- Both are required fields. Creator cannot publish without them.

### Database Addition
```sql
ALTER TABLE events
  ADD COLUMN event_start_time TIME NOT NULL DEFAULT '00:00',
  ADD COLUMN event_end_time   TIME NOT NULL DEFAULT '23:59',
  ADD COLUMN timezone         VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta';
```

Store as TIME, combine with event_date + timezone to get the full timestamp.

### Create Event Form — New Fields

Add after the date picker:

```
Event Date        [date picker]

Waktu Mulai       [time picker]   e.g. 19:00
Waktu Selesai     [time picker]   e.g. 23:00

Timezone          [select: WIB / WITA / WIT]
```

Validation:
- `event_end_time` must be after `event_start_time`
- If end time is before start time AND both on the same date → show error:
  "Waktu selesai harus setelah waktu mulai"
- Allow overnight events (end < start = next day, e.g. 22:00 to 02:00):
  flag `crosses_midnight = true`, add 1 day to end datetime

### Event Detail Page — Timespan Display

Show a clean time block:
```
📅  Minggu, 7 Juni 2026
🕖  19:00 – 23:00 WIB  (4 jam)
📍  SMK Negeri 2 Depok, Yogyakarta
```

Duration label auto-computed: show "X jam" or "X jam Y menit"

### Ticket Sale Window vs Event Timespan

Two separate time concepts — make this clear to creators in the UI:

| Concept | What it controls |
|---|---|
| Sale start / Sale end (per ticket type) | When buyers can REQUEST tickets |
| Event start / Event end | When the actual event happens |

Sale window must end BEFORE or AT event_start_time.
If creator sets sale_end AFTER event_start → show warning:
"Penjualan tiket melebihi waktu mulai acara. Yakin?"

---

## 3. EVENT LIFECYCLE — STATES & TRANSITIONS

### Full Event State Machine

```
draft
  └─► published
        ├─► ticket_sale_open    (when now() >= first ticket_type.sale_start)
        ├─► ticket_sale_closed  (when now() >= last ticket_type.sale_end OR all sold out)
        ├─► ongoing             (when now() >= event_start_time AND < event_end_time)
        ├─► completed           (when now() >= event_end_time)
        ├─► cancelled           (manual by creator, any time before completed)
        └─► archived            (manual by creator, after completed; data preserved)

completed
  └─► archived (by creator choice before 2-week auto-delete)

completed / cancelled
  └─► [auto-deleted after 14 days if not archived]
```

### State Derivation

Event status is derived at runtime — not a stored column (except for `draft`, `published`, `cancelled`, `archived` which are stored):

```typescript
function deriveEventStatus(event: Event, now: Date): EventDisplayStatus {
  if (event.status === 'cancelled') return 'cancelled'
  if (event.status === 'archived') return 'archived'
  if (event.status === 'draft') return 'draft'

  const start = combineDatetime(event.event_date, event.event_start_time, event.timezone)
  const end   = combineDatetime(event.event_date, event.event_end_time, event.timezone)

  if (now >= end)   return 'completed'
  if (now >= start) return 'ongoing'

  const saleOpen  = event.ticket_types.some(tt => now >= tt.sale_start)
  const saleClose = event.ticket_types.every(tt => now >= tt.sale_end || tt.sold_count >= tt.quantity)

  if (saleClose) return 'ticket_sale_closed'
  if (saleOpen)  return 'ticket_sale_open'

  return 'published'  // upcoming, sale not yet open
}
```

---

## 4. EVENT CARD — VISUAL STATES

### State-to-Visual Mapping

| Derived Status       | Card Appearance |
|----------------------|-----------------|
| `draft`              | Dashed border, "Draft" gray badge |
| `published`          | Normal colorful card, "Segera" badge if < 3 days |
| `ticket_sale_open`   | Normal card, "On Sale" teal badge |
| `ticket_sale_closed` | Normal card, "Sold Out" or "Penjualan Ditutup" amber badge |
| `ongoing`            | Pulsing green left border, "Sedang Berlangsung 🔴" live badge |
| `completed`          | Full grayscale (`filter: grayscale(100%) opacity(0.7)`), "Selesai" badge |
| `cancelled`          | Grayscale + red diagonal "BATAL" watermark text overlay |
| `archived`           | Only visible on creator's Acara Saya page, muted style |

### Grayscale CSS for Completed/Cancelled Cards
```css
.event-card--completed {
  filter: grayscale(100%) opacity(0.65);
  transition: filter 0.4s ease;
  pointer-events: none;  /* not clickable for buyers */
}

.event-card--completed .event-card__badge::after {
  content: 'Selesai';
  background: #555;
  color: #fff;
}

.event-card--cancelled {
  filter: grayscale(100%) opacity(0.5);
  position: relative;
}

.event-card--cancelled::after {
  content: 'BATAL';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%) rotate(-20deg);
  font-size: 32px; font-weight: 900;
  color: rgba(255, 59, 59, 0.35);
  letter-spacing: 4px;
  pointer-events: none;
}
```

### Ongoing Live Badge
```css
@keyframes pulse-live {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.badge--live .dot {
  width: 6px; height: 6px;
  background: #2ECC71;
  border-radius: 50%;
  animation: pulse-live 1.2s infinite;
}
```

---

## 5. DATA RETENTION & AUTO-DELETE SYSTEM

### Rules

| Event Status | Data Retention | Who Can View |
|---|---|---|
| `completed` (not archived) | 14 days from `event_end_time` | Creator, Admins, Buyers (their own ticket) |
| `completed` (archived before 14d) | Forever | Creator only (on Acara Saya, archived section) |
| `cancelled` (not archived) | 14 days from cancellation | Creator, Buyers (their own ticket) |
| `cancelled` (archived) | Forever | Creator only |
| `archived` | Forever | Creator only — no Admin, no Buyer access |

### Auto-Delete Job

Run nightly at 02:00 local time:

```sql
-- Find events eligible for deletion
SELECT id FROM events
WHERE status IN ('completed', 'cancelled')
AND archived_at IS NULL
AND (
  (status = 'completed'  AND event_date + event_end_time < NOW() - INTERVAL '14 days')
  OR
  (status = 'cancelled' AND cancelled_at < NOW() - INTERVAL '14 days')
);
```

For each eligible event, in a transaction:
1. Delete `check_ins` for all tickets of this event
2. Delete `tickets`
3. Delete `chat_messages` for all threads of this event
4. Delete `chat_threads`
5. Delete `ticket_requests`
6. Delete `ticket_types`
7. Delete `admin_roles` for this event
8. Delete `ticket_audit_log` entries for this event
9. Delete the `event` row itself

**7 days before deletion:** send email warning to creator:
"Acaramu '[Event Name]' akan dihapus dalam 7 hari. Arsipkan sekarang jika kamu ingin menyimpan datanya."

**3 days before deletion:** final warning email + in-app banner on creator dashboard.

### Database Additions
```sql
ALTER TABLE events
  ADD COLUMN archived_at   TIMESTAMP NULL,
  ADD COLUMN cancelled_at  TIMESTAMP NULL,
  ADD COLUMN deletion_due  TIMESTAMP NULL;  -- computed and stored for query performance
```

---

## 6. ARCHIVE SYSTEM

### What Archiving Does

- Moves event out of active view into an "Arsip" section on creator's Acara Saya
- Preserves: event metadata, ticket stubs (QR invalidated), revenue summary, attendee count
- Deletes: chat messages, individual ticket data, admin roles
- Creator sees a read-only summary card — not a full event page

### Archive Flow

Creator sees a banner on completed events:
```
"Acara ini selesai. Arsipkan dalam 14 hari untuk menyimpan datanya."
[Arsipkan Sekarang]  [Biarkan Terhapus Otomatis]
```

On archive:
1. Set `events.archived_at = NOW()`
2. Delete operational data (chat, individual ticket details, admin roles)
3. Store summary snapshot in `event_archives` table

### event_archives Table
```sql
CREATE TABLE event_archives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID,              -- nullable after event row deleted
  creator_id      UUID REFERENCES users(id),
  event_title     VARCHAR(200),
  event_date      DATE,
  event_start     TIME,
  event_end       TIME,
  location        VARCHAR(300),
  cover_image_url TEXT,
  total_tickets   INTEGER,
  tickets_sold    INTEGER,
  total_attendees INTEGER,           -- checked-in count
  ticket_types_summary JSONB,        -- [{name, sold, price}]
  archived_at     TIMESTAMP DEFAULT NOW()
);
```

### Archived Event Card (Acara Saya — Arsip Section)

- Muted grayscale card with "Arsip" tag
- Shows: event name, date, "X tiket terjual", "X hadir"
- No action buttons — pure read-only history
- Click opens a read-only summary modal (no chat, no attendee list, no QR)
- Only visible to Creator — Admins and Buyers cannot see archived events

---

## 7. ACCESS CONTROL AFTER EVENT ENDS

### Completed Events (before deletion/archive)

| Who | Access |
|---|---|
| Creator | Full read access + archive button + cancel tickets button |
| Admin (Service) | Can still process refund requests for 7 days post-event |
| Admin (Attendance) | Check-in scanner disabled, attendance list read-only |
| Admin (Accountant) | Revenue summary read-only for 14 days |
| Buyer | Can view their own ticket (QR deactivated post-event), can request refund within policy |

### Archived Events

| Who | Access |
|---|---|
| Creator | Read-only summary on Acara Saya → Arsip section |
| Admin | No access. Admin roles are deleted on archive. |
| Buyer | No access. Buyer ticket is deleted on archive. |

### QR Code Behavior Post-Event

- During event (`ongoing`): QR fully active, scannable
- After event ends (`completed`): QR still renders in buyer's wallet but shows "Acara Telah Selesai" — scanner will reject with "Event sudah berakhir"
- After 14 days / archive: QR page returns 404

---

## 8. TICKET SALE WINDOW LOGIC (REFINED)

### Sale States per Ticket Type

```
upcoming  → sale hasn't started yet    (sale_start > now)
open      → currently on sale          (sale_start <= now <= sale_end AND sold < quantity)
sold_out  → quantity exhausted         (sold_count >= quantity)
closed    → sale ended by time         (now > sale_end)
```

### UI Rules

- `upcoming`: show "Mulai dijual [date]" — countdown if < 24h away
- `open`: show availability bar + "Beli Tiket" CTA active
- `sold_out`: show "Habis" red badge — no CTA — optionally show waitlist button
- `closed`: show "Penjualan Ditutup" — no CTA

### What Happens to Seat Locks When Sale Closes

If a buyer has a seat locked (`reserved`) when `sale_end` passes:
- Lock is immediately voided by the sale-close job
- Buyer sees: "Penjualan tiket sudah ditutup. Kursimu tidak lagi ditahan."
- Their ticket request (if submitted) moves to `expired` if still `requested`

### Sale Closing Job

Run every minute (not hourly — buyers notice minute-level delays):
```sql
UPDATE ticket_types
SET status = 'closed'
WHERE sale_end < NOW()
AND status = 'open';

-- Release all seats locked against closed ticket types
UPDATE seats
SET status = 'available', reserved_by = NULL, reserved_until = NULL
WHERE ticket_type_id IN (
  SELECT id FROM ticket_types WHERE status = 'closed'
)
AND status = 'reserved';
```

---

## 9. ONGOING EVENT — LIVE MODE INDICATORS

When `deriveEventStatus` returns `ongoing`:

### Event Detail Page
- Replace "Beli Tiket" section with: "🔴 Acara sedang berlangsung"
- Show check-in stats live: "47 dari 84 sudah hadir"
- No new ticket requests accepted (sale is closed)

### Creator Dashboard — Go Live Banner
When creator opens dashboard during `ongoing` window:
- Full-width top banner: "🔴 SIJAAAB sedang berlangsung — 47/84 hadir"
- Quick link to Scanner tab
- Live counter updating every 10 seconds via WebSocket

### Event Card on Browse
- Card is NOT grayscaled (it's live, not done)
- Green pulsing "🔴 Live" badge top-right
- Not clickable for new ticket purchases

---

## 10. CREATOR-ONLY PROTECTIONS ON ACARA SAYA

### What the Creator Sees That Nobody Else Does

On the Acara Saya page, creators see ALL their events across all states:
- Active events (normal cards)
- Completed events (grayscale, archive banner)
- Cancelled events (grayscale + BATAL watermark, 14-day deletion warning)
- Archived events (in a collapsed "Arsip" accordion section, muted cards)

### What Admins See on Acara Saya

Admins see only events they are currently an active Admin for.
Once an event is `completed` or `archived`, Admin access is revoked — they no longer see it.
Admins never see cancelled events unless they were active when cancellation happened (7-day read access for refunds).

### What Buyers See on Tiket Saya

Buyers see tickets they own. For completed events (within 14 days): ticket shows as "Selesai" badge.
After 14 days / archive: ticket disappears from wallet silently.
No notification needed — the event is over, the ticket served its purpose.

---

## 11. THINGS THE ORIGINAL PLAN MISSED

These are real gaps that would make the app feel unfinished in production:

### 11.1 — No "Refund Window" After Event Ends
**Problem:** Creator accidentally confirms wrong payment, event happens, buyer wants money back.
**Fix:** Admin (Service) can process refunds for up to 7 days after `event_end_time`.
After 7 days: refund requests are automatically rejected with "Periode refund sudah berakhir."

### 11.2 — No Duplicate Ticket Request Guard
**Problem:** Buyer submits a request, closes the app, reopens and submits again.
**Fix (already in CORE_FIX.md):** Max 1 active request per user per event.
**Additional:** If buyer's previous request was `expired`, show:
"Request sebelumnya expired. Buat request baru?" with a single confirm button.

### 11.3 — No Creator "Event Full" State
**Problem:** All tickets sold, but new visitors still see the event detail page with no context.
**Fix:** When `sold_count >= quantity` across ALL ticket types:
- Event detail page shows "Tiket Habis" banner prominently
- Replace all tier rows with a waitlist signup option (v1.1)
- Event card shows "SOLD OUT" coral badge

### 11.4 — No Timezone-Aware Countdown
**Problem:** Event says "19:00" but buyer is in a different timezone.
**Fix:** All event times are stored with timezone. Display in buyer's local timezone with a note:
"19:00 WIB (20:00 WITA · 21:00 WIT)"
Countdown timers count down to the buyer's locally-correct moment.

### 11.5 — No Event Postponement Flow
**Problem:** Creator changes the event date/time after tickets are sold.
**Fix:** When creator edits `event_date`, `event_start_time`, or `event_end_time` on a published event with existing owned tickets:
- Require a reason: "Mengapa acara diubah?" (text field)
- Automatically send notification to ALL ticket holders: "Acara [Name] dijadwalkan ulang ke [new date/time]. Alasan: [reason]. Jika kamu ingin refund, kamu punya 48 jam."
- Open a 48-hour refund window regardless of original refund policy
- Audit log records the change with timestamp and reason

### 11.6 — No Comp Ticket Tracking
**Problem:** Admin creates a manual comp ticket (free, for guest/speaker). These show in sold_count, distorting revenue data.
**Fix:** Add `is_complimentary BOOLEAN DEFAULT false` to `tickets`.
Accountant dashboard separates: "X tiket terjual" vs "Y tiket gratis (comp)"
Revenue calculation excludes comp tickets.

### 11.7 — No Event Capacity Warning for Creator
**Problem:** Creator sets a venue capacity of 100 but accidentally creates 150 tickets.
**Fix:** Add optional `venue_capacity` field to events.
If `total ticket quantity > venue_capacity` → show warning on publish:
"Total tiket (150) melebihi kapasitas venue (100). Lanjutkan?"

### 11.8 — No Handling for Admin Who Leaves / Loses Access Mid-Event
**Problem:** Creator revokes Admin access while that Admin has 5 active chat threads.
**Fix:** On revoke:
- All threads `claimed_by = revokedAdminId` → set `claimed_by = NULL` (back to unclaimed)
- Creator gets notification: "5 chat dari [Admin Name] dikembalikan ke inbox kamu"
- Revoked admin immediately loses access — no grace period

### 11.9 — No "Last Scan" Deduplication for Multi-Scanner Setup
**Problem:** Two admins scan the same QR at the same millisecond from different devices.
**Fix (already in CORE_FIX.md):** `UPDATE ... WHERE is_checked_in = false RETURNING id`
**Additional:** Return the scan result to both devices — the one that lost the race gets:
"Tiket ini sudah discan 0 detik yang lalu oleh [scanner name]"

### 11.10 — No Handling for Event Date in the Past at Publish Time
**Problem:** Creator accidentally sets event date to yesterday and tries to publish.
**Fix:** On publish, validate:
`event_date + event_start_time >= NOW() + 1 hour`
If not: block publish with "Waktu mulai acara sudah lewat. Ubah tanggal atau waktu acara."

### 11.11 — No "Check-In Closed" State
**Problem:** Event ends at 23:00 but admin's scanner still shows as active.
**Fix:** When `now() > event_end_time`, the Scanner tab shows:
"Acara sudah selesai. Check-in ditutup pada 23:00 WIB."
Scanner input is disabled. All previous scan data is preserved read-only.

### 11.12 — No Notification to Buyer When Ticket Expires
**Problem:** Buyer submits request, forgets about it, request auto-expires after 48h.
**Fix:** 6 hours before auto-expiry, send email + in-app notification:
"Request tiketmu untuk [Event] akan expired dalam 6 jam. Hubungi panitia jika masih butuh tiket."
On expiry: send final notification "Request tiketmu expired. Kamu bisa request ulang jika masih tersedia."

### 11.13 — No Protection Against Creating an Event With Zero Ticket Types
**Problem:** Creator publishes event but forgets to add any ticket types.
**Fix:** Block publish if `ticket_types.length === 0`.
Show: "Tambahkan minimal satu tipe tiket sebelum mempublikasikan acara."

### 11.14 — No Handling for Overlapping Admin Roles (Same User, Different Role)
**Problem:** Creator invites User A as Service admin. Later re-invites same user as Accountant. Now user has two roles.
**Fix:** A user can hold multiple Admin roles for the same event simultaneously (Service + Accountant).
`admin_roles` allows multiple rows per (event_id, user_id) — one per role.
In Admin Panel, user sees a role switcher: "Kamu punya 2 role: Service · Accountant"
Each role tab shows only its permitted actions.

### 11.15 — Cover Image Required Validation
**Problem:** Creator publishes event without a cover image. Card looks broken with empty image zone.
**Fix:** Cover image is required to publish (not for draft).
Provide 5 color-gradient fallback placeholders creator can pick if they don't have an image.
These are stored as `cover_type: 'gradient'` with a gradient ID — not an actual image.

---

## 12. SUMMARY — IMPLEMENTATION ORDER

Apply these in this sequence for maximum "feels real" impact:

| Priority | Item | Impact |
|---|---|---|
| 1 | Event start/end time fields + display | Makes event feel real, not just a date |
| 2 | Attendance gate (owned-only filter) | Core correctness |
| 3 | Completed grayscale + "Selesai" state | Visual lifecycle |
| 4 | 14-day auto-delete + archive flow | Data hygiene |
| 5 | Ongoing live badge + Go Live banner | Real-time energy |
| 6 | Timezone display | Trust + professionalism |
| 7 | Postponement flow + 48h refund window | Legal + trust |
| 8 | Event-full "Tiket Habis" state | Buyer experience |
| 9 | Sale window close job (per-minute) | Correctness at scale |
| 10 | Missing validations (11.10, 11.13, 11.15) | Polish |
| 11 | Buyer expiry notification (11.12) | Retention |
| 12 | Admin revoke mid-event (11.8) | Edge case safety |
| 13 | Comp ticket tracking (11.6) | Accountant accuracy |
| 14 | Venue capacity warning (11.7) | Creator safety |

---

*Last updated: 2026 — Creatick v2.0*
*Cross-reference: AGENTS.md (role system), CORE_FIX.md (concurrency), AGENTS.md Section 4 (guards)*
