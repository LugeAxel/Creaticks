# Creatick — AI Agent Context File

## Project Overview

Creatick is a community-focused digital event ticketing platform designed for small-to-medium events in Indonesia.

The platform focuses on:
- event management,
- manual ticket confirmation,
- QR attendance systems,
- collaborative admin workflows,
- and community-driven event operations.

Creatick is NOT an enterprise event platform.

It is designed for:
- campus events,
- workshops,
- creator communities,
- music gigs,
- local organizations,
- hobby communities,
- and small event teams.

---

# Core Product Philosophy

Creatick prioritizes:
- simplicity,
- operational clarity,
- fast workflows,
- warm and friendly UX,
- mobile-first interactions,
- and collaborative event management.

The platform should feel:
- energetic,
- community-focused,
- modern,
- colorful yet professional,
- operationally efficient.

Avoid:
- cold enterprise aesthetics,
- fintech-heavy experiences,
- corporate dashboard feeling,
- crypto startup styling.

---

# Main Product Workflow

## Ticket Purchase Flow

Creatick currently uses a manual confirmation workflow instead of automated payment gateways.

Flow:

1. Buyer selects ticket
2. Buyer submits ticket request
3. Chat room opens between buyer and organizer/admin
4. Buyer uploads payment proof
5. Organizer/admin confirms payment manually
6. Ticket status changes to OWNED
7. QR ticket activates automatically
8. Buyer uses QR ticket for attendance

This workflow is intentional.

DO NOT redesign the platform into a fully automated payment-first system unless explicitly requested.

---

# Main User Roles

## Creator

Full permissions:
- create/edit/delete events
- manage tickets
- assign admins
- manage branding
- customize ticket themes
- access analytics
- confirm payments

---

## Event Admin

Allowed:
- manage buyer chats
- confirm payments
- scan QR tickets
- manage attendance
- manage request queue

Restricted:
- cannot delete events
- cannot delete tickets
- cannot transfer ownership

---

## Staff (Future)

Limited access:
- QR scanning only
- attendance checking only

---

# Core Features

## Event Management
Creators can:
- create events,
- upload banners,
- configure ticket tiers,
- manage attendees,
- publish event pages.

---

## Ticket Request Queue

The platform includes a categorized operational queue:

- New Requests
- Waiting Payment
- Payment Proof Sent
- Confirmed
- Ticket Issued
- Cancelled

This queue is critical for scalability.

Design systems and workflows should optimize for handling:
- 200+ buyers,
- multiple admins,
- real-time operational activity.

---

## Chat System

The buyer-organizer chat system is a core product feature.

Features include:
- real-time messaging,
- payment proof uploads,
- request status tracking,
- admin assignment,
- mobile-friendly interactions.

The chat should feel:
- lightweight,
- fast,
- operational,
- and easy to manage.

Avoid overly complex messaging systems.

---

## QR Ticket System

Each ticket contains:
- unique QR code,
- ticket owner information,
- event details,
- ticket status,
- event branding.

QR validation must:
- prevent duplicate scans,
- validate quickly,
- support real-time attendance updates.

---

# Design System

## Visual Direction

Creatick uses a:
- motion-first,
- colorful professional,
- playful SaaS,
- community-focused design system.

The UI should feel:
- warm,
- energetic,
- modern,
- interactive,
- operationally efficient.

---

# Motion Design Philosophy

Motion should communicate:
- activity,
- event energy,
- communication,
- operational flow,
- platform liveliness.

Use:
- floating UI elements,
- smooth transitions,
- animated status indicators,
- subtle hover interactions,
- layered motion.

Avoid:
- excessive glassmorphism,
- overcomplicated 3D,
- crypto-style effects,
- distracting animations.

---

# Recommended Visual Style

Primary style:
- Soft Modern SaaS

Secondary influence:
- Playful Community UI

Accent style:
- Light Neobrutalism

Layout direction:
- Bento UI sections

Motion direction:
- Kinetic Interface Design

---

# Color Palette

Primary:
#4F46E5

Accent:
#FF6B6B

Surface:
#FFF9F5

Secondary:
#60A5FA

Success:
#22C55E

Error:
#EF4444

Text Primary:
#1F2937

Text Secondary:
#6B7280

---

# Typography

Primary Font:
- Inter

Secondary Font:
- Poppins

Alternative:
- Satoshi

Avoid:
- futuristic fonts,
- condensed fonts,
- luxury serif styles.

---

# Landing Page Direction

The landing page should feel:
- alive,
- community-driven,
- motion-heavy,
- interactive,
- creator-focused.

Recommended elements:
- floating ticket cards,
- animated QR previews,
- fake live activity feed,
- dynamic dashboard previews,
- animated status badges,
- motion storytelling.

Avoid:
- static corporate hero sections,
- empty minimalist layouts,
- fintech-like landing pages.

---

# Dashboard Direction

Dashboards prioritize:
- operational clarity,
- fast scanning,
- scalable workflows,
- queue management,
- admin collaboration.

Dashboard UX is more important than visual decoration.

Use:
- modular bento layouts,
- clear hierarchy,
- status-based color systems,
- compact but readable information density.

---

# Recommended Tech Stack

Frontend:
- Vue 3 + Vite
- Vue Router
- Tailwind CSS

Backend:
- Node.js + Express

Database & Auth:
- Supabase (PostgreSQL)

Realtime:
- Socket.IO

File Storage:
- Cloudinary

Caching:
- memory-cache

Hosting:
- TBD

---

# Coding Conventions

## Emoji Policy
Do NOT use emoji anywhere in the project:
- UI copy and user-facing text
- Error messages and notifications
- Code comments
- Commit messages
- Log messages
- Documentation

Keep all communication text-only and professional.

## Logging Standards
Use a custom logger utility (no external logging library).

Log methods:
- `logger.info(msg, meta?)` — general operational info
- `logger.warn(msg, meta?)` — non-critical issues
- `logger.error(msg, meta?)` — errors with stack traces
- `logger.debug(msg, meta?)` — development-only details
- `logger.request(req, msg, data?)` — log incoming requests with context
- `logger.response(req, res, durationMs)` — auto-log responses on finish

All log entries must include:
- ISO 8601 timestamp
- Log level label (`INFO`, `WARN`, `ERR`, `DBG`)
- Request ID (8-char UUID via `crypto.randomUUID()`)
- Structured JSON metadata (userId, requestId, path, etc.)
- Errors written to stderr, others to stdout

Attach requestId to every request via Express middleware:
- Generate ID at request start
- Log response on finish with status code and duration

---

# Product Positioning

Creatick is NOT:
- Eventbrite clone,
- enterprise ticketing,
- fintech platform.

Creatick IS:
- community event infrastructure,
- collaborative event operations platform,
- lightweight digital ticketing solution for Indonesian communities.

Core positioning:

"Cara paling gampang untuk kelola tiket event komunitas secara digital."

---

# AI Agent Instructions

When generating:
- UI,
- UX,
- copywriting,
- components,
- workflows,
- animations,
- architecture,
- or branding,

always prioritize:
- simplicity,
- operational scalability,
- mobile-first interactions,
- warmth,
- creator friendliness,
- and community energy.

Do NOT over-engineer the platform into enterprise software.

Do NOT use emoji in UI copy, code, or documentation.

Always follow the logging standards defined in Coding Conventions.

The product should always feel:
- approachable,
- modern,
- active,
- and easy to operate.