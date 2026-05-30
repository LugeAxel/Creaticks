Redesign the Beranda (Home) dashboard page in HomeView.vue.
Keep the existing data fetching logic (supabase, fetchData, upcomingEvents,
activeTickets, history). Only change the template and add computed helpers.
Do not touch the script setup data fetching or router logic.

─── OVERALL PHILOSOPHY ──────────────────────────────────────────────────────────
The dashboard must feel alive and context-aware. Every section reacts to the
user's actual situation. No section should ever feel like "just a list."
Use time, urgency, counts, and micro-copy to create a sense of presence.

─── SECTION 1: CONTEXTUAL GREETING HERO ─────────────────────────────────────────
Replace the flat h1 greeting with a full-width hero greeting block.

Background: subtle animated gradient that slowly shifts hue
  (CSS @keyframes hue-rotate on a linear-gradient using brand colors)
  from violet/coral to teal/amber, cycle 8s infinite alternate.
  Opacity kept low (0.12) so it's atmospheric, not distracting.

Content layout (horizontal on desktop, stacked on mobile):

Left side:
  - Time-based greeting (compute from new Date().getHours()):
      0-11  → "Selamat Pagi, [firstName]! ☀️"
      12-14 → "Selamat Siang, [firstName]! 🌤"
      15-18 → "Selamat Sore, [firstName]! 🌇"
      19-23 → "Selamat Malam, [firstName]! 🌙"
    Font: Plus Jakarta Sans 700, 24px, text-heading color
  - Contextual subtitle — computed based on state:
      Has active ticket for event within 24h →
        "🎉 Acaramu dimulai besok! Siapkan QR-mu ya."
      Has active ticket within 7 days →
        "🎟 Kamu punya tiket aktif untuk [event_name]."
      Has no active tickets but upcoming events exist →
        "Ada [N] acara seru minggu ini. Yuk cari tiketnya!"
      No events, no tickets →
        "Belum ada tiket? Yuk jelajahi acara di sekitarmu!"
    Font: DM Sans 400, 14px, text-muted

Right side (only if activeTickets.length > 0):
  - A mini "next event" countdown card:
    - Shows the nearest upcoming event from activeTickets
    - Large countdown: days/hours remaining
      "3 Hari Lagi" or "18 Jam Lagi" or "Hari Ini! 🎉"
    - Event name below in small text, truncated
    - Small "Lihat Tiket" link
    - Background: solid brand color (violet) with white text
    - Border radius: 16px, padding: 16px 20px

─── SECTION 2: ACTIVE TICKETS — MOVED TO TOP ────────────────────────────────────
Active tickets are the most important thing for a buyer. Move them above
upcoming events. Rename section header based on count:
  1 ticket  → "Tiket Kamu"
  2+ tickets → "Tiket Kamu ({{ activeTickets.length }})"

Ticket card redesign — use the diagonal cut card style:
  - Top zone (55% height, ~120px): gradient background using primary → primary-dark
    with a subtle dot pattern overlay (existing code is fine)
    Event name in white bold, date below in white/80
  - Diagonal cut: clip-path: polygon(0 0, 100% 0, 100% 82%, 0 100%)
  - Logo/avatar overlap: circular avatar 48px at the seam, brand icon placeholder
  - Bottom zone: ticket tier, ticket ID, status badge, QR button

Add urgency states to each ticket card:
  - If event is within 24 hours:
    Add a pulsing red top border (3px, color #FF3B3B) + "HARI INI" badge
    top-right corner (red pill badge with pulse animation)
  - If event is within 3 days:
    Add amber top border + "SEGERA" badge (amber pill)
  - If event is more than 3 days away:
    Normal state — violet top border, no urgency badge

─── SECTION 3: UPCOMING EVENTS — SMARTER ────────────────────────────────────────
Keep horizontal scroll. But add these improvements:

Section header row:
  Left: "Acara Untukmu" (not "Event Mendatang" — feels more personal)
  Right: "Lihat Semua →" link

Each event card — apply the full diagonal cut card design:
  - Diagonal image top / colored panel bottom
  - Category-based panel color (Music=coral, Workshop=violet, Art=teal, Other=amber)
  - Overlapping category icon (not logo — use a relevant emoji or material icon)
  - HOT/NEW/FREE badges from the badge system (top-right of image)
  - Availability bar (thin progress bar just above the diagonal cut)
  - "Cari Tiket" CTA button in bottom panel

Between event cards, if there are 0 upcoming events — do NOT show an empty box.
Instead show a single wide card:
  Background: dashed border, centered content
  Icon: 🎪 in 48px
  Text: "Belum ada acara baru. Cek lagi nanti!"
  Sub: "Atau bagikan Creatick ke temanmu yang punya event!"

─── SECTION 4: QUICK ACTIONS ROW (NEW) ──────────────────────────────────────────
Add a horizontal row of 3-4 quick action pill buttons below the greeting,
before any other sections. Think of it like a shortcut bar.

Pills: rounded-full, border 1.5px solid border color, icon + label,
background transparent, hover: background surface-variant.
Font: DM Sans 500, 13px. Gap: 10px. Overflow-x: auto, no scrollbar.

Actions:
  "🔍 Cari Acara"      → router.push('/acara')
  "🎟 Tiket Saya"      → router.push('/tiket')
  "📅 Acara Saya"      → router.push('/acara-saya')
  "➕ Buat Acara"      → router.push('/create-event')

─── SECTION 5: HISTORY — GIVE IT MEANING ────────────────────────────────────────
Keep the list format but add micro-copy and a summary stat above:

Add a small stat row above the list:
  "[N] acara sudah kamu hadiri  🎉"  (count of completed items)
  Font: 12px, text-muted, margin-bottom 12px

Each history row:
  - Keep existing layout (icon left, name + date, status badge right)
  - For completed items: add a very subtle green-tinted left border (3px)
  - For cancelled items: add a red-tinted left border (3px) and reduce opacity to 0.6
  - On click: navigate to /tickets/:id so it's not dead data

If history is empty: do not render the section at all (v-if="history.length > 0" already handles this)

─── SECTION 6: SKELETON LOADER REDESIGN ─────────────────────────────────────────
Replace the single spinning icon with a proper skeleton that mirrors the layout:

Show:
  - Greeting skeleton: 2 lines (240px + 180px wide), height 16px, shimmer
  - Quick actions skeleton: 4 pills in a row, shimmer
  - Active tickets skeleton: 1 horizontal card skeleton, 260px wide, shimmer
  - Upcoming events skeleton: 3 card skeletons in a row, shimmer

Shimmer animation:
  @keyframes shimmer {
    0%   { background-position: -400px 0 }
    100% { background-position: 400px 0 }
  }
  background: linear-gradient(90deg, surface-variant 25%, surface-card 50%, surface-variant 75%)
  background-size: 800px 100%
  animation: shimmer 1.4s infinite linear

─── COMPUTED HELPERS TO ADD IN SCRIPT SETUP ──────────────────────────────────────
Add these computed values (do not change existing fetchData or onMounted):

const firstName = computed(() => {
  return (user.value?.user_metadata?.name as string)?.split(' ')[0]
    || user.value?.email?.split('@')[0]
    || 'Pengguna'
})

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return `Selamat Pagi, ${firstName.value}! ☀️`
  if (h < 15) return `Selamat Siang, ${firstName.value}! 🌤`
  if (h < 19) return `Selamat Sore, ${firstName.value}! 🌇`
  return `Selamat Malam, ${firstName.value}! 🌙`
})

const nearestTicket = computed(() => {
  if (!activeTickets.value.length) return null
  return [...activeTickets.value].sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
  )[0]
})

const daysUntil = (dateStr: string) => {
  const diff = new Date(dateStr).getTime() - Date.now()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (days === 0) return 'Hari Ini! 🎉'
  if (days === 1) return 'Besok'
  if (hours < 24) return `${hours} Jam Lagi`
  return `${days} Hari Lagi`
}

const contextualSubtitle = computed(() => {
  if (!nearestTicket.value) {
    if (upcomingEvents.value.length > 0)
      return `Ada ${upcomingEvents.value.length} acara seru minggu ini. Yuk cari tiketnya!`
    return 'Belum ada tiket? Yuk jelajahi acara di sekitarmu!'
  }
  const days = Math.floor(
    (new Date(nearestTicket.value.event_date).getTime() - Date.now()) / 86400000
  )
  if (days === 0) return '🎉 Acaramu dimulai hari ini! Siapkan QR-mu ya.'
  if (days <= 7) return `🎟 Kamu punya tiket untuk "${nearestTicket.value.event_name}" — ${daysUntil(nearestTicket.value.event_date)}`
  return `Kamu punya ${activeTickets.value.length} tiket aktif. Semangat!`
})

const historyCompletedCount = computed(() =>
  history.value.filter(h => h.status === 'completed').length
)