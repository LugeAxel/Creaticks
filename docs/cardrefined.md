Redesign the event card component on the "Acara Saya" and event discovery pages.
Reference style: a card split diagonally — the top portion is the event cover image,
the bottom portion is a solid colored info panel with a diagonal top-left cut edge
(not a straight horizontal split — the dividing line is angled ~15 degrees).
The event organizer avatar/logo overlaps the diagonal seam, sitting at the
bottom-left of the image area, partially on both zones.

─── CARD STRUCTURE ───────────────────────────────────────────────────────────────

Overall card:
- Width: fill grid column (responsive)
- Border radius: 20px
- Overflow: hidden
- No border
- Shadow: 0 8px 32px rgba(0, 0, 0, 0.25)
- Background: the bottom panel color (so the diagonal cut feels seamless)

Top zone — Event Cover Image:
- Height: 55% of card
- object-fit: cover, fills full width
- No overlay or gradient on the image itself — image bleeds fully to the diagonal cut
- The diagonal cut is achieved via clip-path on the image container:
  clip-path: polygon(0 0, 100% 0, 100% 80%, 0 100%)
  (adjust percentages to taste — goal is a ~15 degree diagonal bottom edge)

Bottom zone — Info Panel:
- Height: 45% of card
- Background: use the event's tier/category color, OR cycle through brand colors
  per card: violet #6C63FF, coral #FF6584, teal #43C6AC, amber #FFB347
- The panel has a matching diagonal top edge that mirrors the image cut
  so they meet cleanly with no gap
- clip-path on panel: polygon(0 8%, 100% 0, 100% 100%, 0 100%)

Overlapping logo/avatar:
- Positioned absolutely at the seam — bottom-left of the image zone
- Size: 64px × 64px
- Border radius: 16px (rounded square, like an app icon)
- Border: 3px solid white
- Box shadow: 0 4px 12px rgba(0,0,0,0.3)
- Contains: event organizer avatar OR a placeholder icon
- z-index above both zones

─── CARD CONTENT (inside bottom panel) ──────────────────────────────────────────

Layout inside the panel (padding: 14px 16px 16px, with left padding of 88px
to clear the overlapping avatar):

Row 1 — Event title:
- Font: Plus Jakarta Sans, 700, 15px, white
- Max 2 lines, text-overflow ellipsis
- Margin bottom: 6px

Row 2 — Date and location:
- Font: DM Sans, 400, 11px, rgba(255,255,255,0.7)
- Date with calendar emoji, location with pin emoji
- Single line each, truncate if too long

Row 3 — Bottom action row:
- Left: event date in white, font 11px, opacity 0.65
- Right: "Learn More" / "Kelola Acara" button
  - Style: transparent background, white border 1.5px, white text, border-radius 8px
  - Padding: 6px 14px, font-size 12px, font-weight 600
  - Hover: white background, text changes to panel background color (inverted)

─── BADGE SYSTEM (NEW — overlay on top-right of card) ───────────────────────────

Implement these badges as absolute-positioned pills on the top-right corner
of the card image area. Only show ONE badge per card (priority order below).
Badge style: pill shape, border-radius 999px, font Space Mono 10px bold,
letter-spacing 1.5px, padding 5px 12px, with a small icon prefix.

Badge priority and styles:

1. 🔥 HOT badge
   - Condition: sold > 70% of total capacity
   - Background: linear-gradient(135deg, #FF6584, #FF4757)
   - Text: "🔥 HOT"
   - Add a subtle pulse animation (scale 1 → 1.05 → 1, 1.5s infinite)

2. ⚡ ALMOST SOLD OUT badge
   - Condition: sold > 90% of total capacity
   - Background: linear-gradient(135deg, #FFB347, #FF6B35)
   - Text: "⚡ SOLD OUT SOON"
   - Overrides HOT badge

3. 🎉 NEW badge
   - Condition: event created within last 48 hours
   - Background: linear-gradient(135deg, #43C6AC, #2ECC71)
   - Text: "✨ NEW"

4. 🔒 PRIVATE badge
   - Condition: event.visibility === 'private'
   - Background: rgba(0,0,0,0.55), backdrop-filter: blur(4px)
   - Text: "🔒 PRIVATE"
   - Border: 1px solid rgba(255,255,255,0.2)

5. FREE badge
   - Condition: all ticket types have price === 0
   - Background: linear-gradient(135deg, #6C63FF, #9B59B6)
   - Text: "🎟 FREE"

─── ROLE BADGE (inside bottom panel, top-left) ──────────────────────────────────

On "Acara Saya" page only — show the user's resolved role for that event
as a small pill inside the panel, positioned below the avatar overlap area:
- "Creator" → violet #6C63FF background, white text
- "Admin" → teal #43C6AC background, white text
Font: Space Mono, 9px, letter-spacing 2px, padding 3px 10px, border-radius 999px

─── TICKET AVAILABILITY INDICATOR (NEW) ─────────────────────────────────────────

At the bottom of the image zone (just above the diagonal cut), show a thin
availability bar — a horizontal progress bar:
- Height: 4px, full width
- Background track: rgba(255,255,255,0.2)
- Fill: white (or accent color)
- Fill width: percentage of tickets sold (sold_count / quantity * 100%)
- Only show if event has ticket data available

─── HOVER STATE ─────────────────────────────────────────────────────────────────

On card hover:
- Scale: 1.02 (transform: scale(1.02))
- Shadow increases: 0 16px 48px rgba(0,0,0,0.35)
- Transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)  ← spring feel
- "Learn More" button border brightens slightly
- The cover image subtly zooms: img { transform: scale(1.05) } inside the clip-path

─── CARD GRID LAYOUT ────────────────────────────────────────────────────────────

Discovery page grid:
- Desktop: 3 columns, gap 20px
- Tablet (768px): 2 columns
- Mobile (< 480px): 1 column, card width 100%

"Acara Saya" grid:
- Desktop: 3 columns (same)
- Cards here show "Kelola Acara" button instead of "Learn More"
- Cards here show role badge (Creator/Admin)
- On click: navigate to /events/:eventId/manage (not individual buttons)

─── ADDITIONAL IMPROVEMENTS ─────────────────────────────────────────────────────

1. Skeleton loader
   While event data is loading, show a card skeleton:
   - Top 55%: gray shimmer block (animate shimmer left to right)
   - Bottom 45%: 3 lines of shimmer text at 80%, 60%, 40% width
   - Use CSS @keyframes shimmer with background-position animation

2. Empty state card (when no events)
   - Same card dimensions but dashed border 2px rgba(255,255,255,0.15)
   - Center: + icon (48px) in muted color
   - Below: "Buat Acara Baru" text
   - Clicking navigates to create event flow

3. Card color assignment
   Assign panel color based on event category:
   Music → coral #FF6584
   Workshop → violet #6C63FF
   Art → teal #43C6AC
   Community → amber #FFB347
   Other → use a hash of event.id to pick deterministically from the 4 colors
   (so the same event always gets the same color)

4. Accessibility
   - card has role="article" and aria-label="{event title}"
   - "Learn More" button has aria-label="Learn more about {event title}"
   - Badge has aria-label matching its text
   - Focus ring: 2px solid white, 2px offset, visible on keyboard navigation