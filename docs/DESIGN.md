---
name: Creatick
colors:
  surface: '#fef8f4'
  surface-dim: '#ded9d5'
  surface-bright: '#fef8f4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f2ef'
  surface-container: '#f3ede9'
  surface-container-high: '#ede7e3'
  surface-container-highest: '#e7e1de'
  on-surface: '#1d1b19'
  on-surface-variant: '#464555'
  inverse-surface: '#32302e'
  inverse-on-surface: '#f5f0ec'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#0060ac'
  on-secondary: '#ffffff'
  secondary-container: '#64a8fe'
  on-secondary-container: '#003c70'
  tertiary: '#8f1721'
  on-tertiary: '#ffffff'
  tertiary-container: '#b03136'
  on-tertiary-container: '#ffd0ce'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#d4e3ff'
  secondary-fixed-dim: '#a4c9ff'
  on-secondary-fixed: '#001c39'
  on-secondary-fixed-variant: '#004883'
  tertiary-fixed: '#ffdad8'
  tertiary-fixed-dim: '#ffb3b0'
  on-tertiary-fixed: '#410006'
  on-tertiary-fixed-variant: '#8c1520'
  background: '#fef8f4'
  on-background: '#1d1b19'
  surface-variant: '#e7e1de'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter-mobile: 16px
  margin-mobile: 20px
  gutter-desktop: 24px
  margin-desktop: auto
---

## Brand & Style

The brand personality is a high-energy fusion of playful accessibility and professional reliability. It captures the warmth and community-focused nature of lifestyle apps like GoFood with the gamified, encouraging clarity of Duolingo. The visual language is designed to feel energetic, youthful, and incredibly easy to navigate, specifically catering to community organizers who need a stress-free ticketing experience.

The design style is **Corporate / Modern** with a **Playful twist**. It utilizes high-quality whitespace, vibrant accents, and soft, tactile elements to create an interface that feels more like an inviting social hub than a dry administrative tool. The emotional response should be one of optimism and confidence, signaling that managing an event is not a chore, but an extension of the community's joy.

**Emoji Policy:** Do NOT use emoji in UI copy, error messages, or any user-facing text. Communication should remain text-only and professional while still warm and approachable.

## Colors

The palette is anchored by a deep **Indigo** primary, providing the "trust" foundation essential for financial transactions and ticketing. The **Warm White** background is a strategic departure from sterile whites, making the interface feel more organic and approachable.

**Coral Red** serves as a high-visibility accent for primary calls to action or urgent notifications, while **Sky Blue** acts as a secondary, calming support color for informational chips and supplementary features. Status colors follow global standards but use slightly softened hues to maintain the approachable aesthetic.

## Typography

The typography system prioritizes personality in the hierarchy. **Plus Jakarta Sans** (substituted for Poppins for a more modern, open feel) is used for headings to inject a sense of friendliness and geometric clarity. Its tight letter-spacing in larger sizes provides a punchy, editorial look.

**Inter** is utilized for all functional UI and body copy. It ensures maximum legibility for ticket details and dashboard data. Line heights are generous across all levels to maintain the "airy" feel of the design. Mobile-specific variants are implemented for display sizes to prevent text wrapping issues on small viewports.

## Layout & Spacing

This design system uses a **Fluid Grid** model built on an 8px base unit. For mobile devices, a 4-column layout is standard with 20px side margins to keep the focus on the central content. Desktop layouts shift to a 12-column grid with a maximum container width of 1280px.

Spacing is applied liberally to avoid visual clutter. Section headers should use `xl` spacing from the preceding content. Interactive elements like buttons and input fields are sized in 8px increments to ensure a large, thumb-friendly tap target on mobile devices (minimum height of 48px).

## Elevation & Depth

Depth is achieved through **Tonal Layers** supplemented by very soft, colored ambient shadows. Surfaces do not use harsh black shadows; instead, shadows are tinted with the primary indigo or neutral brown to maintain warmth.

- **Level 0 (Base):** Warm White background.
- **Level 1 (Cards):** White surfaces with a 1px soft border (#E2E8F0) and a subtle 4px blur shadow.
- **Level 2 (Modals/Overlays):** White surfaces with a 12px blur shadow, used for bottom sheets on mobile.

This low-contrast approach ensures the UI feels cohesive and integrated rather than floating and disconnected.

## Shapes

The shape language is defined by two extremes: **Rounded Rectangles** for structure and **Pills** for interaction.

- **Cards and Containers:** Use a 16px radius (`rounded-xl`) to create a soft, friendly container for content.
- **Buttons and Badges:** Use a fully rounded radius (999px) to provide a "bouncy," inviting tactile quality that mimics physical buttons.
- **Input Fields:** Use a 12px radius to sit comfortably between the softness of the cards and the roundness of the buttons.

## Components

### Buttons
Primary buttons are pill-shaped, using the Indigo background with white text. They should include a subtle bottom-heavy shadow to feel "pressable." Secondary buttons use the Sky Blue tint with Indigo text.

### Cards
Cards are the primary organizational unit. They must feature a 16px corner radius and a 1px border. For ticket cards, use a dashed line separator to mimic a physical perforated ticket.

### Input Fields
Inputs should have a Warm White background (slightly darker than the page base) to create a "hollowed out" feel. On focus, the border should transition to a 2px Indigo stroke.

### Chips & Badges
Used for categories and status. These are always pill-shaped with low-opacity background tints of their respective status colors (e.g., Success green at 10% opacity with solid green text).

### Icons
Use **Filled** icons exclusively. This adds visual weight and complements the bold typography. Icons should be encased in a circular background when used as primary navigation triggers.

**Implementation note:** The actual code uses Material Symbols Outlined with `FILL=1` via `fontVariationSettings` rather than the Filled variant. This achieves the same visual weight while keeping icon rendering consistent.

### Back Button (Kembali)
All back buttons must be positioned **left-aligned** consistently across all pages. Use `<BackButton />` component which renders a labeled left arrow. Do not place back buttons on the right side.

### Bottom Navigation
- Height: `h-16` (64px)
- Padding: `pb-[calc(0.5rem+env(safe-area-inset-bottom))]` for notched devices
- Active state: filled pill (`rounded-full bg-primary-container text-on-primary-container px-5 py-2`) surrounding the icon + label
- Hidden on desktop (`md:hidden`), full browser width
- 3-4 items: Beranda, Acara, Tiket Saya, Profil

### Event Card Grid Density
AcaraBrowse and similar card grids must show 4-5 cards on mobile viewport and 6-8 cards on desktop viewport.

**Mobile (4-5 cards visible):**
- `grid-cols-2 gap-3`
- Compact card: no banner image, `p-3`, `text-[11px]` icons, `text-xs` labels
- 2-line title clamp
- Compact chip (smaller padding/font)

**Desktop (6-8 cards visible):**
- `lg:grid-cols-4 gap-4`
- Cards may include compact banner (`aspect-[4/3]`), `p-3` or `p-4`

### Dark Mode Implementation
Dark mode uses localStorage key `creaticks-theme`. To prevent flash of unstyled content (FOUC) on page load, an inline `<script>` in `index.html` before `</head>` reads the value and applies `class="dark"` to `<html>` synchronously before first paint. The `useDarkMode` composable handles toggling and storage.

### Missing CSS Tokens (Must Be Defined)
The following tokens are used extensively in components but must be explicitly defined in `style.css`:

```css
/* Surface variant — used for card skeletons, empty states, input backgrounds */
--color-surface-variant: #e7e1de;       /* light */
--color-surface-variant: #3e3e5e;       /* dark */

/* Primary fixed — used for active pills, selected states */
--color-primary-fixed: #e2dfff;          /* light */
--color-primary-fixed: #3323cc;          /* dark */
```

### Progress Indicators
Adopt a Duolingo-style thick progress bar with rounded ends, using the Primary Indigo color to show completion of event setup or ticket sales.