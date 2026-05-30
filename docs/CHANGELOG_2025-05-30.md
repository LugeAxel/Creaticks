# Changelog — 30 May 2025

## Phase 1: Card Redesign

### `docs/cardrefined.md`
- Created full diagonal card specification with clip-path polygons, category colors, badges, skeleton, and empty state

### `src/components/shared/EventCard.vue`
- **Diagonal split layout**: image `clip-path: polygon(0 0, 100% 0, 100% 85%, 0 100%)`, panel `clip-path: polygon(0 5%, 100% 0, 100% 100%, 0 100%)`
- **Category-based panel color**: Musik → `#FF6584`, Workshop → `#6C63FF`, Seni → `#43C6AC`, Komunitas → `#FFB347`, other → hash-based from palette
- **Placeholder avatar** at seam (64×64, rounded-16, white border 3px)
- **Badge system**: priority (ALMOST SOLD OUT > HOT → pulse, NEW, PRIVATE, FREE)
- **Availability progress bar**
- **Hover effect**: `scale(1.02)` + image `scale(1.05)`
- **Role badge** for MyEvents (CREATOR/ADMIN)
- **Focus/accessibility**: `role="article"`, tabindex, `aria-label`
- **Three-tier countdown**: `<1h`→M:SS, `≥1h <24h`→H:MM:SS, `≥24h`→`X hari`, past→"Sedang berlangsung"
- **Multi-image carousel**: cycles `gallery_urls` with crossfade every 2s on hover, resets on mouseleave
- **Share button**: hover-reveal top-left icon, copies event URL, "Tersalin!" tooltip for 2s
- **Mobile responsive**: `max-sm` smaller text/padding/button

## Phase 2: Dashboard & Grid Refinement

### `src/views/AcaraBrowse.vue`
- Grid changed to `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`

### `src/views/MyEvents.vue`
- Refactored to use `<EventCard :userRole>` component
- Grid matches same responsive breakpoints

### `src/composables/useAdminEvents.ts`
- `MyEvent` interface expanded with `ticket_tiers` full fields, `event_format`, `max_tickets`, `created_at`

### `src/views/DashboardPage.vue`
- **Hero greeting**: time-based greeting ("Selamat Pagi"/"Siang"/"Sore"/"Malam") + contextual subtitle
- **Animated gradient**: `@keyframes hue-shift` cycling DESIGN.md brand colors at 0.12 opacity
- **Quick actions**: 4 pill buttons with Material Symbols icons
- **Fun fact**: "Kamu suka acara [kategori]!"
- **Hype meter**: 3 social proof cards (active viewers, recent sales, watching) from real backend data
- **Active tickets**: diagonal cut cards with urgency system (red pulsing "HARI INI" ≤24h, amber "SEGERA" ≤3d, violet default)
- **Upcoming events**: horizontal scroll reusing `<EventCard>` with `min-w-[200px] md:min-w-[220px]`
- **Recommendations**: filtered by favorite category
- **History**: colored left borders (green completed, red cancelled+opacity)
- **Cancelled/expired tickets**: filtered out from dashboard display
- **No emojis** per DESIGN.md policy

## Phase 3: Backend API Enhancements

### `backend/routes/events.js`
- `EVENT_SELECT`: `sold_count` added to `ticket_tiers` subquery
- `GET /api/events/:id/hype`: new endpoint returning `active_viewers`, `recent_sales_1h`, `watching_count`, `total_sold`, `total_quota`

### `backend/routes/tickets.js`
- `event_category` added to `/api/tickets` response via events join

## Phase 4a: Ticket Detail API — Extra Event Fields

### `backend/routes/tickets.js`
- Extended the `SELECT` on `events` join to include:
  `location_lat, location_lng, category, gallery_urls`
- Added to response mapping:
  - `event_category`
  - `event_location_lat`
  - `event_location_lng`
  - `event_gallery_urls`

## Phase 4b: DigitalTicket.vue — "Ticket as a Living Object"

### `src/views/DigitalTicket.vue`
Complete redesign adding 4 living states to the ticket page:

#### Script additions
- **Types**: `WeatherData` interface, new fields on `TicketData`
- **State**: `now`, `countdown`, `weather`, `weatherLoading`, `weatherError`, `rating`, `rated`, `memoryNote`, `countdownTimer`
- **Computed**:
  - `livingState` — returns `'before'`, `'today'`, `'past'`, or `'nostalgia'` based on event date
  - `countdownParts` — splits countdown into 2-part display (hari+jam / jam+menit / menit+detik)
- **Functions**:
  - `updateCountdown` — recalculates time remaining every 1s via `setInterval`
  - `fetchWeather` — calls Open-Meteo API (free, no key) using `event_location_lat/lng`
  - `weatherEmoji` — maps WMO weather codes to Material Symbol icons
  - `formatRelative` — human-readable relative time ("3 hari lagi", "2 jam lagi", dll.)
  - `submitRating` — placeholder for rating submission
- **Lifecycle**: `onMounted` starts countdown timer and fetches weather for future events; `onUnmounted` clears interval

#### Template additions
| State | Condition | UI |
|---|---|---|
| `before` | `now < event_date` | Countdown timer card + Open-Meteo weather forecast card + relative time note |
| `today` | same calendar day | Today badge in ticket card + "Selamat menikmati acara!" message below |
| `past` | < 30 days after | Memory card with event gallery/banner image + 5-star rating with submit |
| `nostalgia` | >= 30 days after | Sepia-toned card showing days elapsed |

#### CSS additions
- `@keyframes glow-pulse` — coral `#FF6584` pulsing shadow animation (2s ease-in-out infinite)
- `.animate-glow-pulse` class for day-of glow effect

#### Structural changes
- All three layouts (classic, split, minimal) wrapped in a container div that applies `animate-glow-pulse` on day-of
- `v-else-if` chain restructured so layouts are nested inside the container

## Phase 5: Private Event Access

### `backend/routes/events.js`
- Added ticket-holder check at `GET /api/events/:id`: users with a confirmed `ticket_request` for the event can now view it
- Returns `isTicketHolder: true` flag to distinguish from creator/admin access

### `src/views/EventDetail.vue`
- Added amber "Acara Pribadi" badge next to category/format badges when `event.visibility === 'private'`

## Key Decisions (All Phases)

- **No emoji** in dashboard greeting/subtitle/copy — per DESIGN.md policy, all text-only warm copy
- **Three-tier countdown** on EventCard — `<1h`→M:SS, `≥1h <24h`→H:MM:SS, `≥24h`→`X hari`, past→"Sedang berlangsung"
- **Hype Meter** uses existing `ticket_tiers` data: `active_viewers` estimated from `sold_count`, `recent_sales_1h` queries `ticket_requests` by `updated_at`, `watching_count` counts pending requests
- **Open-Meteo for weather forecast**: free, no API key, uses `event.location_lat/lng`
- **EventCard reused in dashboard**: with `min-w-[200px] md:min-w-[220px]` wrapper to prevent massive card sizing
- **coral #FF6584** used for day-of pulsing glow animation on ticket
- **Share button copies raw link**: `window.location.origin + '/events/' + event.id`, no shortened URL
- **No DM Sans font**: Inter used as substitute (DM Sans not loaded in project)
- **Diagonal card design** used everywhere, no compact mobile variant without banner
