# Creaticks Codebase Audit

## Critical Vulnerabilities

### Live secrets exposed in `.env`
`.env` contains **live** production credentials in plaintext on disk:
- `SUPABASE_SERVICE_ROLE_KEY` — full admin access to entire Supabase project, bypasses all RLS
- `CLOUDINARY_API_SECRET` + `CLOUDINARY_API_KEY` — full Cloudinary account access

While `.gitignore` excludes `.env`, filesystem access leaks all credentials. **Rotate immediately.**

### IDOR — Insecure Direct Object Reference

| Endpoint | File | Issue |
|----------|------|-------|
| `GET /api/invitations?user_id=` | `backend/routes/invitations.js:72` | Accepts arbitrary `?user_id=` with **zero ownership check**. Any user can view any other user's invitations. |
| `GET /api/events/:id` | `backend/routes/events.js:54` | **No auth at all**. Anyone can retrieve *any* event (drafts, private) by ID. |
| `GET /api/invitations/event/:eventId` | `backend/routes/invitations.js:288` | **No authorization**. Any authenticated user can dump full role hierarchy + user emails for any event. |

### Internal errors leaked to clients
17+ endpoints send raw `error.message` to the client — leaks Supabase schema details, constraint names, stack traces:

```js
// Pattern across 17+ endpoints
res.status(500).json({ error: error.message })
```

Files affected: `events.js`, `invitations.js`, `auth.js`, `role.js`.

### Rate limiting bypass (missing `trust proxy`)
`backend/server.js` has **no** `app.set('trust proxy', ...)`. Behind any reverse proxy, all requests appear from the proxy IP → rate limiter counts all traffic against a single IP → **rate limiting is effectively disabled**.

### User enumeration
`POST /api/invitations/search` — any authenticated user can search all profiles by partial name/email. Returns `id, email, name, avatar_url`. Enables email enumeration and data scraping.

### Zero input validation on category
`backend/routes/events.js:13` — `VALID_CATEGORIES` array is **defined but never used**. Any arbitrary string accepted for `category` field.

### Cloudinary folder injection
`backend/routes/upload.js` — `req.body.folder` passed directly to Cloudinary without validation. Attacker can upload to any folder.

### Auth middleware crash risk
`backend/middleware/auth.js` — no `try/catch` around `supabaseAdmin.auth.getUser(token)`. If Supabase Auth API is unreachable, **unhandled Promise rejection crashes the process**.

### Duplicate Supabase admin clients
6 separate `createClient(..., SUPABASE_SERVICE_ROLE_KEY)` instances across 6 route files. Service key bypasses all RLS — no safety net on logic bugs.

---

## Bugs

| # | Severity | File | Line | Description |
|---|----------|------|------|-------------|
| C1 | Critical | `DashboardPage.vue` | 11-12 | `activeTickets` and `history` are empty arrays. `onMounted` never fetches API. **Dashboard always shows empty state.** |
| C2 | Critical | `CreatorDashboard.vue` | 24-25 | `totalSold` and `totalRevenue` are hardcoded `computed(() => 0)`. Never updated from real data. |
| C3 | Critical | `EventEditor.vue` | 116-188 | Ticket tiers and invited admins are **never sent to the API** on save. Complete data loss. |
| C4 | High | `CreatorEvents.vue` | 42-43 | `editEvent(id)` ignores the `id` param — always navigates to `event-editor` without passing it. **No way to edit existing events.** |
| C5 | High | `EventDetail.vue` | 234 | Fixed checkout bar (`fixed bottom-0`) renders **on top of** BottomNav on mobile. |
| C6 | High | `HCaptcha.vue` | 53 | `window.hcaptcha.render = undefined` destructively replaces global hCaptcha render. **Breaks hCaptcha for entire page** on unmount. |
| C7 | High | `InvitationsPage.vue` | 70-71 | `goToEvent` navigates to `/admin/queue/:eventId` — a route that **does not exist**. Wildcard catches → redirects to landing. |
| C8 | Medium | `LandingPage.vue` | 96-99 | "Cari Event" button has **no `@click` handler**. Dead button. |
| C9 | Medium | `CreatorDashboard.vue` | 121-122 | "Kelola" and "Lihat Pembeli" buttons have **no `@click` handlers**. Dead buttons. |
| C10 | Medium | `DashboardPage.vue` | 110 | "Muat Lebih Banyak" button has **no `@click` handler**. Dead button. |
| C11 | Medium | `EventDetail.vue` | 101 | "Minta Tiket" **always** redirects to `/login`, even for authenticated users. |
| C12 | Medium | `style.css` | — | `bg-surface-variant` used **43 times** across 14 files — **NOT defined** in theme. Results in transparent backgrounds on avatar initials, notification cards, etc. |
| C13 | Medium | `style.css` | — | `bg-primary-fixed` used in `NotificationBell.vue` — **NOT defined** in theme. |
| C14 | Low | `TeamManagement.vue` | 164-178, 206-216 | **Duplicate event loading logic.** First API call is completely wasted; second call bypasses backend via direct Supabase query. |

---

## UI/UX Issues

### Kembali button inconsistency
Every page places it on the **left** except:

| File | Line | Position | Fix |
|------|------|----------|-----|
| `AcaraBrowse.vue` | 96-102 | **RIGHT** (router-link to `/`) | Move left, use `BackButton` component |

### Sidebar disappears on Profile page
`ProfileSettings.vue` is a **standalone page** — doesn't use `AppLayout`. Clicking "Profil" in the sidebar removes the sidebar entirely. On desktop, the user loses all navigation.

**Fix:** Wrap `ProfileSettings.vue` in `AppLayout`, or implement profile as a modal/overlay that preserves the shell.

### Bottom nav missing safe-area padding
`BottomNav.vue:41` — `fixed bottom-0` with only `pb-4` (16px). **No `env(safe-area-inset-bottom)`**. On iPhone X+ / modern Android, the nav sits behind the gesture bar.

**Fix:** `pb-[calc(0.5rem+env(safe-area-inset-bottom))]`

### Bottom nav overlaps content on standalone pages
Only pages using `AppLayout` get `pb-20`. These standalone pages have **no bottom padding** and overlap with BottomNav:

- `CreatorEvents.vue`
- `EventEditor.vue`
- `InvitationsPage.vue`
- `TeamManagement.vue`
- `EventDetail.vue`
- `ProfileSettings.vue`

**Fix:** Add `pb-20` (or `pb-24`) to each standalone page's container div.

### Bottom nav active state doesn't match mockups
Mockups show a **filled pill background** (`bg-primary-container`) for the active tab. Implementation only changes **text color** (`text-primary`). Active tab is not visually prominent.

**Fix:** Implement pill-shaped active state matching mockup design (`rounded-full bg-primary-container text-on-primary-container px-5 py-2`).

### Logo uses placeholder icon instead of brand
`TopBar.vue` uses an `auto_awesome` Material icon as brand mark. Mockups show "Creatick" wordmark in Plus Jakarta Sans bold, primary indigo.

**Fix:** Replace with styled `<span class="font-heading font-bold text-primary">Creatick</span>` to match sidebar approach.

### "Minta Tiket" flow is broken
EventDetail's "Minta Tiket" always redirects to login. There is **no ticket request/purchase pipeline** built. The entire ticket → payment → QR generation flow is missing.

### Event cards not customizable per PRD
PRD specifies **theme presets** (Minimal, Concert, Neon, Campus, Elegant, Dark Mode) with customizable colors. Current implementation has:
- No theme/color selection in EventEditor
- No design variation between events
- Simplified perforation vs detailed CSS cutout in mockups
- No gradient cards or rich metrics on creator dashboard

---

## Missing Pages (from mockups)

| # | Mockup Page | Status |
|---|-------------|--------|
| 1 | QR Scanner (`qr_scanner/`) | Not implemented |
| 2 | Request Queue (`request_queue/`) | Not implemented |
| 3 | Attendance Panel (`attendance_panel/`) | Not implemented |
| 4 | Analytics Dashboard (`analytics_dashboard/`) | Not implemented |
| 5 | Admin Dashboard — Desktop (`admin_dashboard_1/`) | Not implemented |
| 6 | Admin Dashboard — Mobile (`admin_dashboard_2/`) | Not implemented |
| 7 | Chat / Confirmation (`chat_confirmation/`) | Not implemented |
| 8 | Team Management — standalone (`team_management/`) | Partial (in EventEditor) |
| 9 | Ticket Manager — standalone (`ticket_manager/`) | Merged into EventEditor |

---

## What Doesn't Match Real-Life Implementation

1. **No ticket request workflow** — buyer can't actually request/buy tickets
2. **No QR check-in** — scanner not built, no attendance validation
3. **No payment/invoice system** — no payment proof upload, no invoice generation
4. **No 30-minute auto-cancel** for unpaid tickets (PRD requirement)
5. **No chat system** — referenced in navigation but not implemented
6. **No data export** (CSV/Excel) — PRD requirement
7. **No role-based feature gates** — creator vs buyer differences are minimal
8. **All dashboard metrics are hardcoded** — never fetch real data
9. **No Coral Red (#FF6B6B) accent** used despite being in PRD and mockups
10. **No header scroll shadow** — implemented in mockup, not in actual
11. **CreatorDashboard metric cards** are plain text vs mockup's rich gradient/icon cards

---

## Architecture Issues

### Memory leaks
`useAuth.ts`, `useInvitations.ts`, `AppLayout.vue`, `LandingPage.vue`, `NotificationBell.vue` all register `supabase.auth.onAuthStateChange` listeners but **never clean them up**. Accumulates on every navigation.

### Inconsistent API URL approach
- All API calls use relative paths (`/api/events`, `/api/tickets/:id`) — rely on Vite proxy
- `useCloudinary.ts` uses **hardcoded** `http://localhost:3001` fallback with `VITE_API_URL`
- Inconsistent — file uploads would use different origin than everything else

### Non-standard Tailwind tokens in use
These classes are used but **not defined** in the Tailwind v4 theme:

| Class | Files Using It |
|-------|---------------|
| `bg-surface-variant` | 14 files, 43 occurrences |
| `bg-primary-fixed` | `NotificationBell.vue` |
| `text-headline-sm` | `NotificationBell.vue`, `InvitationsPage.vue` |
| `text-body-sm` | `InvitationsPage.vue`, `RolePicker.vue` |
| `text-body-md` | `RolePicker.vue` |

### Backend dependency issues
- `backend/package.json` has **duplicate** `dotenv` entry (lines 12 and 14)
- No global unhandled rejection handler in `server.js`

---

## Priority Action Plan

### P0 — Immediate Security Fixes
1. Rotate all secrets in `.env` (Supabase service key, Cloudinary API key/secret)
2. Add `requireAuth` to `GET /api/events/:id` + validate ownership
3. Fix IDOR on invitations list — remove `req.query.user_id` or enforce ownership
4. Add auth check to `GET /api/invitations/event/:eventId`
5. Add `app.set('trust proxy', 1)` to `backend/server.js`
6. Add `try/catch` to auth middleware (`backend/middleware/auth.js`)
7. Replace all `res.status(500).json({ error: error.message })` with generic messages

### P1 — Fix All Bugs (C1-C14)
8. Wire up DashboardPage to fetch real tickets from API
9. Wire up CreatorDashboard to compute real metrics from events data
10. Fix EventEditor to send ticket tiers + invited admins in POST body
11. Add edit route (`/creator/events/:id/edit`) + wire EventEditor for edit mode
12. Fix EventDetail checkout bar — add BottomNav-aware bottom positioning
13. Fix HCaptcha cleanup — use `widgetId` tracking + proper destroy
14. Fix InvitationsPage route — point to real route or remove
15. Add click handlers to all dead buttons (LandingPage, CreatorDashboard, DashboardPage)
16. Define missing CSS tokens: `surface-variant`, `primary-fixed`, typography tokens

### P2 — UI/UX Alignment
17. Move AcaraBrowse "Kembali" to the left, use `BackButton` component
18. Wrap `ProfileSettings.vue` in `AppLayout` (or implement as overlay)
19. Replace placeholder `auto_awesome` icon with "Creatick" wordmark in TopBar
20. Add `env(safe-area-inset-bottom)` to `BottomNav.vue`
21. Add `pb-20` to all standalone creator pages
22. Implement filled pill active state on BottomNav (match mockup)
23. Replace native `confirm()` in TeamManagement with app-styled modal

### P3 — Architecture Cleanup
24. Consolidate Supabase admin clients into one shared module (`backend/lib/supabase.js`)
25. Add per-route rate limiting (upload, search, auth endpoints)
26. Validate `category` against `VALID_CATEGORIES` in POST/PUT
27. Fix `useCloudinary.ts` — use relative path like all other API calls
28. Clean up all `onAuthStateChange` listeners with `onUnmounted` / `subscription.unsubscribe()`
29. Add global unhandled rejection handler in `server.js`

### P4 — Feature Completion (PRD Alignment)
30. Build missing pages: QR Scanner, Request Queue, Attendance Panel, Chat, Analytics Dashboard, Admin Dashboard
31. Implement ticket customization (theme presets per PRD)
32. Build ticket request → payment → QR generation pipeline
33. Build invoice system + CSV/Excel export
34. Implement 30-min auto-cancel for unpaid tickets (cron job)
35. Add header scroll shadow effect
36. Implement Coral Red (#FF6B6B) accent throughout design system

---

## File Reference Index

| Path | Key Lines | Issues |
|------|-----------|--------|
| `backend/server.js` | 30, 35-41 | No `trust proxy`, rate limit bypass, no unhandled rejection handler |
| `backend/middleware/auth.js` | 18-25 | No try/catch around Supabase call |
| `backend/routes/events.js` | 13, 54-68, 90-91, 139 | `VALID_CATEGORIES` unused, no auth on GET/:id |
| `backend/routes/invitations.js` | 72, 213-221, 288-332, 356-417 | IDOR, no auth on event roles, self-assignment checks |
| `backend/routes/upload.js` | 20 | Folder injection via req.body.folder |
| `backend/routes/tickets.js` | 13-48 | References non-existent `ticket_requests` table |
| `backend/package.json` | 12, 14 | Duplicate `dotenv` dependency |
| `src/router/index.ts` | 46-49 | Role picker has no `requiresAuth` guard |
| `src/views/DashboardPage.vue` | 11-12, 110 | Tickets never fetched, dead "Muat Lebih" button |
| `src/views/CreatorDashboard.vue` | 24-25, 121-122 | Hardcoded metrics, dead action buttons |
| `src/views/EventEditor.vue` | 116-188 | Ticket tiers + admins not sent to API |
| `src/views/EventDetail.vue` | 101, 234 | Always redirects to login, checkout bar overlaps nav |
| `src/views/CreatorEvents.vue` | 42-43 | Edit ignores event ID |
| `src/views/AcaraBrowse.vue` | 96-102 | Kembali on the right |
| `src/views/InvitationsPage.vue` | 70-71 | Invalid route navigation |
| `src/views/ProfileSettings.vue` | — | Standalone, no sidebar/nav |
| `src/components/layout/BottomNav.vue` | 41 | No safe-area padding |
| `src/components/layout/TopBar.vue` | 25-27 | Placeholder icon instead of brand logo |
| `src/components/shared/HCaptcha.vue` | 53 | Destroys global hCaptcha on unmount |
| `src/composables/useCloudinary.ts` | 3 | Hardcoded localhost fallback |
| `src/composables/useAuth.ts` | 17-20 | Memory leak — no listener cleanup |
| `src/composables/useInvitations.ts` | 127-131 | Memory leak — no listener cleanup |
| `src/style.css` | — | Missing `surface-variant`, `primary-fixed` tokens |
