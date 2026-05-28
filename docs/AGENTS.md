# AGENTS.md — Creatick Platform
> This file is the single source of truth for every AI agent working on this codebase.
> Read it fully before writing a single line of code, UI, or logic.
> When in doubt: re-read this file.

## 1. WHAT CREATICK IS

Creatick is a web platform where:
- **Creators** make events and sell tickets via in-app chat transactions.
- **Admins** are invited by Creators to help manage chat, check-in, and attendees for a specific event.
- **Buyers** request tickets, chat with the event team, pay externally, and receive an Owned QR e-ticket.

There is **no automated payment gateway**. Payment is confirmed manually by Creator or Admin after reviewing buyer proof in chat.

Ticket lifecycle (actual DB status values):
`pending → confirmed → owned → cancelled` (or `expired`)
Admin claiming uses `claimed_by` + `claimed_at` columns on `ticket_requests`.

---

## 2. THE MOST IMPORTANT CONCEPT: EVENT-SCOPED ROLES

> ⚠️ This is the concept AI agents get wrong most often. Read it carefully.

### 2.1 Roles Are Per-Event, Not Per-Account

A user does **not** have one fixed global role. Their role is determined by **which event they are currently viewing or operating on**.

The same user, User A, can simultaneously be:
- The **Creator** of Event A (they created it)
- An **Admin** of Event B (they were invited by Event B's creator)
- A **Buyer** on Event C (they have no special relationship to it)

This means:
- There is no `role` column on the `users` table that says "creator" or "admin" globally.
- Every role check must ask: **"What is this user's relationship to THIS specific event?"**
- The answer is derived at runtime by querying the event and `event_roles` table.

### 2.2 How to Resolve a User's Role for an Event

Given `currentUser` and `eventId`, the event-scoped role is resolved as follows:

```
function resolveEventRole(currentUser, event, adminRoles):

  if event.creator_id === currentUser.id:
    return "creator"

  if adminRoles.exists(event_id = event.id, user_id = currentUser.id, status = 'accepted'):
    return "admin"

  return "buyer"
```

This resolution must happen:
- **Server-side** on every API request that is event-scoped
- **Client-side** to determine which UI to render (Creator Panel vs Admin Panel vs Buyer view)

Never hardcode or cache a user's role globally. Always resolve it in the context of the current event.

### 2.3 Concrete Example — Same User, Three Events

| Event       | Relationship         | Resolved Role | UI Shown             |
|-------------|----------------------|---------------|----------------------|
| Event A     | User created it      | `creator`     | Creator Panel        |
| Event B     | User was invited     | `admin`       | Admin Panel          |
| Event C     | No special relation  | `buyer`       | Public event page    |

When User A navigates from Event A to Event B, the entire UI context switches. The panel header, sidebar, available actions, color accents, and permission set all change to reflect the new role.

### 2.4 What the Database Stores

```
users table:
  - No role column. A user is just a user.
  - Their relationship to events is inferred, not stored here.

events table:
  - creator_id (FK → users.id) — this is the one and only Creator of the event.

event_roles table:
  - event_id + user_id — determines if a user has a special role for an event.
  - roles: text[] — array of role names (e.g. `{admin}`).
  - status: 'pending' | 'accepted' — invitation state.
  - invited_by: UUID (FK → users.id) — who invited them.
  - A user can have rows here for multiple events (Admin of many events simultaneously).
```

### 2.5 UI Must Reflect the Active Event Role

When a user switches event context (e.g., navigates to a different event's dashboard), the UI must:
- Re-resolve their role for the new event immediately
- Re-render the correct panel: Creator Panel, Admin Panel, or redirect to buyer view
- Update the panel header to show the current event name and the user's role badge for that event
- Update sidebar navigation to match the resolved role's permissions
- Update accent color scheme: violet for Creator, teal/amber for Admin

Never show a stale role UI from a previously viewed event.

### 2.6 The Event Context Object

Every component, page, and API call that is event-scoped must have access to an **Event Context** object. Define this once and pass it through your state management (React Context, Zustand, etc.):

```typescript
interface EventContext {
  event: Readonly<EventData>;
  resolvedRole: "creator" | "admin";
  adminRoles: string[];
  loading: boolean;
}
```

See `src/composables/useEventContext.ts` for the actual implementation. This context is provided via `provide(EVENT_CONTEXT_KEY, ...)` in the EventManageLayout and consumed via `inject(EVENT_CONTEXT_KEY)` in child tabs.

Do not derive the role inline in individual components. Resolve it once at the event context level and consume it everywhere.

---

## 3. ROLES & PERMISSIONS

### 3.1 Permission Matrix (resolved per-event)

| Permission                        | Creator | Admin  | Buyer     |
|-----------------------------------|---------|--------|-----------|
| Create event                      | ✅      | ❌     | ❌        |
| Edit event details                | ✅      | ❌     | ❌        |
| Delete event                      | ✅      | ❌     | ❌        |
| Cancel event                      | ✅      | ❌     | ❌        |
| Create ticket type                | ✅      | ✅     | ❌        |
| Delete ticket / ticket type       | ✅      | ❌     | ❌        |
| Design custom ticket              | ✅      | ✅     | ❌        |
| View buyer chat inbox             | ✅      | ✅     | Own only  |
| Reply in buyer chat               | ✅      | ✅     | Own only  |
| Confirm payment received          | ✅      | ✅     | ❌        |
| Cancel a ticket request           | ✅      | ✅     | Own only  |
| View attendee list                | ✅      | ✅     | ❌        |
| Export attendee CSV               | ✅      | ✅     | ❌        |
| QR scan / check-in                | ✅      | ✅     | ❌        |
| View sales analytics & revenue    | ✅      | ❌     | ❌        |
| Invite admins                     | ✅      | ❌     | ❌        |
| Revoke admins                     | ✅      | ❌     | ❌        |
| Send bulk announcements           | ✅      | ✅     | ❌        |
| Request a ticket                  | ❌      | ❌     | ✅        |

> Note: A Creator cannot request a ticket to their own event. An Admin cannot request a ticket to events where they are an Admin — they must view it as a buyer from a separate account, or the Creator must issue them a manual comp ticket.

### 3.2 Admin Permissions Are Event-Scoped

An Admin for Event B has **zero permissions** on Event A, Event C, or any other event. Even if the same user is Admin on 10 events, each set of permissions is completely isolated.

---

## 4. BUSINESS LOGIC RULES — NEVER SKIP THESE

### 4.1 Self-Action Guards

**Creator buying their own ticket**
- Resolved role for event = `creator` → block ticket request entirely
- UI: remove the "Request Ticket" button. Do NOT disable it. Replace it with: `"You are the organizer of this event."`
- API: `POST /ticket-requests` must validate `buyer_id !== event.creator_id` server-side → return `403 SELF_ACTION_NOT_ALLOWED`

**Admin buying a ticket to an event they admin**
- If `resolvedRole === "admin"` for this event, the buyer ticket request flow must not be available.
- UI: show `"You are an admin for this event."` where the buy CTA would be.
- API: `POST /ticket-requests` must validate that the requester is not an active Admin of this event → return `403 SELF_ACTION_NOT_ALLOWED`

**Creator inviting themselves as Admin**
- When the Creator types an email in the Admin invite field: validate it does not match `currentUser.email`
- UI: inline error `"You cannot add yourself — you are already the organizer of this event."`
- API: `POST /events/:id/admins` must validate `invitee_id !== event.creator_id` → return `400 SELF_ACTION_NOT_ALLOWED`

**Creator inviting someone who is already an Admin for that event**
- Check `event_roles` for `(event_id, invitee_id, status = 'accepted')` before sending invite
- UI: inline error `"This person is already an Admin for this event."`

**Buyer requesting tickets they already own for the same tier**
- If buyer already has `status = owned` for the same `ticket_type_id`, warn before creating a new request
- UI: `"You already own a ticket for this tier. Request another?"` — require explicit confirmation

**Confirming payment on an already-Owned ticket**
- If `ticket_request.status === "owned"`, the "Confirm Payment" button must not exist in the UI at all
- API: `PATCH /ticket-requests/:id/confirm` → if status already `owned`, return `409 CONFLICT`

### 4.2 Role-Switch Guards

**Switching event context mid-session**
- When a user navigates to a different event, re-resolve their role immediately before rendering any UI
- Never use the role from the previous event context for the new event
- If a user bookmarks `/dashboard/events/EVENT-B` and they are an Admin there, they must see Admin Panel — not Creator Panel — even if their last session was on Event A where they are Creator

**Role displayed in UI must always match the active event**
- Show a role badge in the panel header: `"Creator"` (violet) or `"Admin"` (teal)
- This badge must update when the user switches events
- Never show `"Creator"` badge on an event the user does not own

**Deep linking into a panel**
- If a user deep-links to `/creator/events/EVENT-X/dashboard` but their resolved role for EVENT-X is `admin` (not creator), redirect them to `/admin/events/EVENT-X/dashboard`
- Never render the wrong panel just because the URL path says so

### 4.3 Ticket Availability Guards

**Overselling prevention**
- Check: `ticket_type.quantity - ticket_type.sold_count >= requested_quantity`
- This check must happen **inside a database transaction** with a row-level lock on the `ticket_types` row to prevent race conditions with 200+ concurrent buyers
- Return `409 NOT_ENOUGH_TICKETS` with `{ available: N }` if insufficient
- UI: show real-time remaining count. When 0: show "Sold Out" badge, remove all request interaction

**`sold_count` update timing**
- Increment `sold_count` only when status transitions to `Owned` — never on `Requested`
- When a request is `Cancelled` or `Expired`, release reserved quantity back to availability

**Free tickets (price = 0)**
- Skip the entire chat flow. Auto-set status to `Owned` immediately upon request
- Auto-generate QR code and send email confirmation without waiting for any confirmation
- Never route free ticket requests into the chat inbox

### 4.4 Event State Guards

**Past event** — `event.event_date < now()` → show "This event has passed", no ticket request allowed

**Cancelled event** — `event.status === 'cancelled'` → show "This event has been cancelled", no ticket request allowed

**Draft event** — `event.status === 'draft'` → return `404` for any non-creator accessing the URL directly. Never expose draft events in discovery or search.

**Deleting an event with active Owned tickets**
- Block `DELETE /events/:id` if any `tickets` exist linked to this event with active QR codes
- UI: `"You cannot delete this event — X attendees have active tickets. Cancel the event instead."`
- Cancellation notifies all affected buyers. Deletion does not — so deletion is blocked.

### 4.5 Chat Guards

**Closed threads are read-only**
- When `ticket_request` becomes `Owned`, `Expired`, or `Cancelled` → set `chat_thread.is_active = false`
- UI: remove input bar entirely, replace with a status banner showing the final state
- API: reject any `POST /chat/threads/:id/messages` where `thread.is_active = false` → return `403`

**System messages cannot be edited or deleted**
- Messages with `message_type = 'system'` must have no edit/delete affordance in UI, ever

**File uploads in chat**
- Accept only: `image/jpeg`, `image/png`, `image/webp` — max 5MB
- Validate MIME type server-side, not just file extension
- Reject anything else with a clear error message

### 4.6 Admin Scope Guards

**Admin can only see data for events they are explicitly invited to**
- Every Admin API call must verify a valid `event_roles` row for `(user_id, event_id)` with `status = 'accepted'`
- Never derive `event_id` trust from request body alone — always cross-check against the `event_roles` table
- Return `403 FORBIDDEN` (not `404`) if Admin tries to access data for an event they are not invited to

**Invitation expiry**
- Admin invitations not accepted within 72 hours auto-expire (`status = 'cancelled'`)
- Expired invitations show in Admin Management as "Expired" with a "Resend Invite" option

---

## 5. UI/UX RULES — PROFESSIONAL STANDARDS

### 5.1 Core Principles

**Empty states are not optional.**
Every list, table, inbox, and grid must have a designed empty state — not a blank screen. Include an icon, a human message, and a contextual CTA:
- Chat Inbox (no threads): `"No ticket requests yet. Share your event link to get started."`
- Attendee list (no check-ins): `"No one has checked in yet. Start scanning at the door!"`
- Buyer Wallet (no tickets): `"You don't have any tickets yet. Find an event to attend!"`

**Loading states are not optional.**
Every async operation must show a visible loading indicator. Use skeleton loaders for lists and cards; spinner + disabled state for buttons. Never leave a frozen UI.

**Error states are not optional.**
Map every API error code to a human-readable message. Never surface raw error objects or stack traces.

**Destructive actions require confirmation.**
Anything irreversible gets a confirmation dialog first: cancelling a ticket, revoking an Admin, cancelling an event, deleting anything.

**Success feedback is required.**
Show a toast or inline confirmation after every successful action. Never silently succeed.

### 5.2 Role-Aware UI Rules

**The panel must visually reflect the current event role**
- Both Creator and Admin see the full tab set in the sidebar. Creator-only tabs (Settings, Admin Management, Analytics) appear behind a `border-t` divider.
- The role badge in the sidebar header shows "Creator" (violet `#6C63FF`) or "Admin" (teal `#43C6AC`).
- See `src/components/layout/EventManageLayout.vue` for the actual nav item split.

**Switching between events a user manages**
- Provide an event switcher dropdown in the panel header showing all events the user is Creator or Admin of
- Each item in the dropdown shows the event name and a small role badge (`Creator` or `Admin`) so they always know their role before switching
- On switch: re-resolve role, re-render correct panel, update accent color

**Never show an action the user cannot perform**
- Do not disable buttons with a tooltip explanation for role restrictions. Remove them entirely.
- Exception: genuinely discoverable upgrade paths (e.g. a grayed "Analytics" in Admin Panel with tooltip "Only available to the Creator") are acceptable if they serve onboarding/discovery purposes.

### 5.3 Status Badge Rules

| Status      | Color   | Hex       |
|-------------|---------|-----------|
| Requested   | Amber   | `#FFB347` |
| In Progress | Purple  | `#9B59B6` |
| Pending     | Violet  | `#6C63FF` |
| Owned       | Teal    | `#43C6AC` |
| Expired     | Gray    | `#9B9BBD` |
| Cancelled   | Red     | `#FF3B3B` |

Always use badges — never plain text for status. Badges must be readable on white, lavender, and blush surfaces.

---

## 6. DESIGN SYSTEM — USE THESE EXACT VALUES

### 6.1 Colors

```css
:root {
  --color-primary:   #6C63FF;  /* Violet — Creator panel, main CTAs */
  --color-secondary: #FF6584;  /* Coral pink — Buyer UI, accents */
  --color-teal:      #43C6AC;  /* Teal — Admin panel, success, Owned */
  --color-amber:     #FFB347;  /* Amber — warnings, Pending, priority */
  --color-black:     #1A1A2E;  /* Deep navy — headings */
  --color-body:      #4A4A6A;  /* Body text */
  --color-muted:     #9B9BBD;  /* Captions, disabled, timestamps */
  --color-surface:   #F4F3FF;  /* Lavender surface — card backgrounds */
  --color-surface-b: #FFF5F7;  /* Blush surface — alternate cards */
  --color-border:    #E0DFFE;  /* Input and card borders */
  --color-white:     #FFFFFF;
  --color-error:     #FF3B3B;  /* Errors, destructive actions */
}
```

### 6.2 Role-Based Panel Accent Colors

| Panel         | Primary Accent          | Secondary Accent        |
|---------------|-------------------------|-------------------------|
| Creator Panel | `--color-primary` violet | `--color-secondary` coral |
| Admin Panel   | `--color-teal`          | `--color-amber`         |
| Buyer UI      | `--color-secondary` coral | `--color-primary` violet |

The accent color must also apply to: active sidebar item highlight, panel header top border, primary button background, and role badge background.

---

## 7. API CONTRACTS

Every API endpoint must:
1. Authenticate (valid JWT)
2. Authorize: resolve the user's event-scoped role and check against required permission
3. Validate all input
4. Return consistent error shapes:

```json
{
  "error": "SNAKE_CASE_ERROR_CODE",
  "message": "Human readable description",
  "field": "optional_field_name_for_form_errors"
}
```

**Authorization pattern for event-scoped endpoints:**
```
1. Extract userId from JWT
2. Load the event by eventId from URL param
3. Resolve role: creator / admin / buyer (see Section 2.2)
4. Check resolved role has required permission (see Section 3.1 matrix)
5. Proceed or return 403 FORBIDDEN
```

**Error codes:**
- `UNAUTHORIZED` — not logged in
- `FORBIDDEN` — wrong role or scope for this action
- `NOT_FOUND` — resource does not exist or is invisible to this user
- `CONFLICT` — action conflicts with current state
- `NOT_ENOUGH_TICKETS` — quantity exceeds availability
- `SELF_ACTION_NOT_ALLOWED` — creator buying own ticket, admin inviting self, etc.
- `VALIDATION_ERROR` — input failed validation (include `field`)
- `EVENT_NOT_ACTIVE` — event is draft, cancelled, or past
- `WRONG_ROLE_CONTEXT` — user tried to access a panel their event-scoped role doesn't permit

---

## 8. SECURITY

- **Never trust the client for role.** Always resolve event-scoped role server-side from the database on every request.
- **JWT claims are not authoritative for event roles.** A JWT may say a user exists — it says nothing about their role on any specific event. Always query.
- **Admin scope isolation.** Every Admin query must be verified against `event_roles`. An Admin cannot access data for events where they have no `event_roles` row.
- **File uploads.** Validate MIME type server-side. Store with random keys in S3/R2. Never serve from API origin.
- **Rate limiting.** Auth endpoints: 5/min. Chat messages: 60/min per user. Ticket requests: 10/min per user.
- **`NOT_FOUND` for forbidden resources.** Never reveal whether a resource exists but is forbidden — always return `404` for things the user should not know about.

---

## 9. COMMON MISTAKES — AI AGENTS GET THESE WRONG

| Mistake | Correct behavior |
|---|---|
| Treating role as a global account property | Role is per-event. Resolve it from `events.creator_id` and `event_roles` every time. |
| Not re-resolving role when user switches events | Re-resolve and re-render the entire panel context on every event navigation. |
| Showing Creator Panel to a user who is Admin on that event | Check `resolvedRole` for the active event, not the user's "default" role. |
| Showing "Request Ticket" to the event Creator | Remove the button. Creator cannot buy their own ticket. |
| Showing "Request Ticket" to an Admin of that event | Remove the button. Admin cannot buy tickets for events they manage. |
| Allowing Creator to invite themselves as Admin | Validate `invitee_id !== event.creator_id` on client and server. |
| Allowing Admin to access another event by guessing its ID | Every Admin API call verifies `event_roles` row for the exact `(user_id, event_id)` pair. |
| Deep-link to Creator Panel renders for an Admin | Detect role mismatch and redirect to the correct panel. |
| Incrementing `sold_count` on Requested, not Owned | Only increment when status → `Owned`. |
| Not using a DB row lock during ticket availability check | Use transaction + row-level lock to prevent overselling under concurrent load. |
| Rendering "Confirm Payment" on an already-Owned request | Button must not exist in UI if status is already `owned`. Guard on server too. |
| Letting free tickets go through the chat flow | Free tickets → auto-`Owned` immediately, no chat needed. |
| Showing raw API errors to users | Always map error codes to friendly messages. |
| Blank screen for empty lists | Every empty state needs icon + message + CTA. |
| Button not disabled during async operation | Always disable + spinner on in-flight requests. |
| Panel accent color not updating after event switch | Accent color is derived from `resolvedRole` for the current event — must update on switch. |
| Admin Management invite list showing the Creator's own email | Filter out `currentUser.email` from all invite search results. |
| Closed chat thread still accepting messages | `is_active = false` → remove input bar entirely, not just disable it. |

---

## 10. REPOSITORY ARCHITECTURE

### 10.1 Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Starts frontend (Vite) + backend (Node `--watch`) concurrently via `concurrently` |
| `npm run build` | `vue-tsc --noEmit && vite build` — typecheck then build |
| `npm run typecheck` | `vue-tsc --noEmit` — TypeScript check only |

### 10.2 Stack

- **Frontend**: Vue 3 (`<script setup lang="ts">`) + Vite + Tailwind CSS v4 (`@import "tailwindcss"`, `@theme` directive in `src/style.css`) + vue-router + Supabase anon key client
- **Backend**: Express.js (all routes use `await import()` dynamic imports) + Supabase admin client (service_role key) + Socket.IO + node-cron + Cloudinary (uploads)
- **Real-time**: Socket.IO with room pattern `event:{eventId}:queue`, `event:{eventId}:attendance`, and per-thread chat rooms
- **Dark mode**: `.dark` class toggled on `<html>`. Inline `<script>` in `index.html` reads `creaticks-theme` localStorage key before first paint to prevent FOUC. `useDarkMode` composable handles toggling.
- **CSS tokens**: Defined via `@theme` in `src/style.css`. Never use hardcoded hex values; use classes like `bg-surface`, `text-text-heading`, `border-border/50`. Exception: Event Manage sidebar intentionally hardcoded `#1A1A2E`.

### 10.3 Router Behavior

- Guard in `src/router/index.ts` `beforeEach` checks: auth → email verified → role-picker → redirect landing auth'd users.
- **No admin route guard.** All admin/manage pages self-authorize via API calls. The `requiresAdmin` meta was removed.
- `isActive` uses **exact match** (`route.path === path`), not `startsWith` — prevents dual-highlight on shared-prefix routes.
- Event Manage routes at `/events/:eventId/manage/*` use a separate layout (`EventManageLayout.vue`), completely independent of AppLayout (no Sidebar/BottomNav).

### 10.4 Event-Scoped Roles (Actual Implementation)

| File | Role |
|------|------|
| `src/composables/useEventContext.ts` | Fetches event by ID via `GET /api/events/:id`. Resolves `creator` if `event.creator_id === user.id`, `admin` if API returns `adminRole` array. Calls `provide(EVENT_CONTEXT_KEY)` directly in setup. |
| `src/composables/useAdminEvents.ts` | Fetches `GET /api/events` + `GET /api/events/admin` in parallel, deduplicates by ID, tags with `userRole`. **Module-level fetch caching** — `fetched` boolean flag prevents duplicate API calls. `fetchMyEvents()` returns a cached promise if already in-flight. |
| `GET /api/events/:id` (backend) | Returns `{ event, adminRole?: string[] }`. Checks `event_roles` table for admin status. Creator is identified by `event.creator_id`. |
| `GET /api/events/admin` (backend) | Queries `event_roles` for the user's accepted roles, returns matching events. |

### 10.5 Backend Quirks

- **ESM dotenv hoisting**: `backend/lib/supabase.js` calls `dotenv.config()` directly before `createClient()`. Without this, importing supabase before server.js runs `dotenv.config()` would leave env vars undefined.
- **Dynamic imports**: All Express imports (routes, middleware) use `await import()` inside an `async main()` in `server.js`.
- **Socket.IO rooms**: Frontend emits `join:room` / `leave:room` events. Standard rooms: `event:{eventId}:queue`, `event:{eventId}:attendance`, `ticket:{ticketRequestId}`.
- **Cron jobs** (runs every 2 minutes via `node-cron`): auto-release claimed queue items after 15 min inactivity, auto-cancel unpaid tickets after payment deadline.
- **AUDIT.md** documents known security issues: IDOR on `GET /api/invitations?user_id=`, `GET /api/events/:id` (no auth for published events), leaked internal errors, rate limit bypass (`trust proxy` missing), user enumeration via invitation search.

### 10.6 Frontend Quirks

- **Camera scanner**: `await nextTick()` is **required** after setting `cameraActive.value = true` before accessing `videoRef.value`, because `<video>` lives inside `v-if="cameraActive"` and doesn't exist in DOM until Vue re-renders. See `EventManageScan.vue` and `QRScanner.vue`.
- **`useAdminEvents` caching**: Module-level `fetched` boolean and `fetchPromise` variable mean the composable only calls the API once per session. Call `resetMyEvents()` to re-fetch.
- **Event Manage Layout separation**: `EventManageLayout.vue` is a standalone layout with dark navy sidebar (`#1A1A2E`, 220px). It does NOT include AppLayout, Sidebar, BottomNav, or TopBar. Child tabs receive event context via `inject`.
- **`useEventContextLoader`** calls `provide(EVENT_CONTEXT_KEY, context)` inside the composable itself (not via a template `<provideEventContext>` component), avoiding a Vue bug where template function components don't trigger provide.

### 10.7 Key Files

| File | Purpose |
|------|---------|
| `src/router/index.ts` | All routes + auth/nav guard |
| `src/style.css` | Tailwind v4 `@theme` tokens, dark mode overrides |
| `src/composables/useEventContext.ts` | Per-event role resolution, provide/inject pattern |
| `src/composables/useAdminEvents.ts` | MyEvents list with caching |
| `src/components/layout/EventManageLayout.vue` | Dark navy sidebar, tab nav, context provider |
| `src/views/EventManage*.vue` | Overview, Queue, Chat, Scan, Attendance tabs |
| `src/views/MyEvents.vue` | Unified event list → manage page |
| `backend/server.js` | Express + Socket.IO + cron entrypoint |
| `backend/lib/supabase.js` | Supabase admin client (service_role), dotenv workaround |
| `backend/routes/events.js` | Event CRUD + role resolution endpoint |
| `backend/routes/tickets.js` | Ticket request lifecycle (905 lines) |
| `docs/AUDIT.md` | Security audit findings |

---

*This file supersedes any conflicting inline comments or previous prompt instructions.*