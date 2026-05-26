# CREATICK
## Product Requirements Document (PRD)
### Version 2.0 — Community Event Ticketing Platform

---

# 1. Product Overview

## Product Name
Creatick

## Product Type
Web-Based Community Event Ticketing Platform

## Target Users
- Small event organizers
- Community leaders
- Campus event committees
- Workshop organizers
- Music gig organizers
- Event admins/staff
- Event attendees

---

# 1.1 Vision Statement

Creatick is a lightweight community-focused event management and digital ticketing platform designed for small-to-medium events in Indonesia.

Creatick prioritizes:
- fast event creation,
- manual but flexible ticket handling,
- community communication,
- QR-based attendance systems,
- collaborative event management,
- creator-friendly workflows.

---

# 1.2 Problem Statement

Small event organizers in Indonesia often manage ticket sales manually through:
- WhatsApp,
- Instagram DMs,
- spreadsheets,
- and manual attendance systems.

Existing ticketing platforms are:
- too expensive,
- too complex,
- or require payment gateway verification too early.

Creatick simplifies:
- event creation,
- ticket handling,
- buyer communication,
- QR attendance,
- and team collaboration
inside one platform.

---

# 2. Product Goals

## Business Goals
- Become the easiest ticketing platform for Indonesian community events.
- Reduce operational complexity for organizers.
- Support collaborative event management.
- Create scalable workflows for high ticket demand.

## User Goals

### Creators
- Create events quickly.
- Manage hundreds of buyers efficiently.
- Collaborate with admins/staff.
- Customize ticket appearance.

### Admins
- Confirm payments.
- Manage chats.
- Scan QR tickets.
- Handle attendance operations.

### Buyers
- Request tickets easily.
- Communicate directly with organizers.
- Receive QR tickets instantly after confirmation.

---

# 3. Product Scope

## In Scope (v2.0)
- Event creation
- Ticket request system
- Buyer-organizer chat system
- Admin/team collaboration
- QR ticket generation
- QR attendance system
- Ticket customization
- Mobile dashboards
- Attendance tracking
- Request pipeline management

## Out of Scope (v2.0)
- Automated payment gateway integration
- Automated payouts
- Refund automation
- Native mobile apps
- Seat reservation systems

---

# 4. User Roles

## Creator
Full access:
- create/edit/delete events
- assign admins
- customize ticket themes
- confirm payments
- manage analytics

## Event Admin
Allowed:
- manage chats
- confirm payments
- scan QR
- manage attendees

Restricted:
- cannot delete events
- cannot delete tickets
- cannot transfer ownership

## Staff (Future)
- QR scanning only
- attendance checking only

---

# 5. Core Features

## F1 — Event Creation
Creators can:
- create events,
- upload banners,
- configure ticket types,
- publish event pages.

---

## F2 — Ticket Type Configuration
Creators can:
- create ticket tiers,
- set ticket limits,
- configure pricing,
- set availability windows.

---

## F3 — Ticket Request Workflow

1. Buyer selects ticket
2. Buyer submits request
3. Chat room opens
4. Buyer uploads payment proof
5. Admin confirms payment
6. Ticket status becomes OWNED
7. QR ticket activates automatically

---

## F4 — Buyer & Organizer Chat System

Features:
- real-time messaging,
- payment proof uploads,
- unread indicators,
- request status badges,
- conversation assignment,
- mobile-friendly interface.

---

## F5 — Ticket Request Pipeline

Queue categories:
- New Requests
- Waiting Payment
- Payment Proof Sent
- Confirmed
- Ticket Issued
- Cancelled

---

## F6 — Creator Dashboard

Includes:
- ticket statistics,
- attendance tracking,
- revenue tracking,
- event performance charts,
- team activity.

---

## F7 — Admin Dashboard

Includes:
- buyer request queue,
- active chats,
- QR scanner access,
- payment confirmation tools,
- attendance monitoring.

Designed for handling 200+ buyers efficiently.

---

## F8 — QR Ticket System

Each ticket contains:
- unique QR code,
- ticket owner,
- event details,
- ticket status,
- branding.

---

## F9 — QR Check-In System

Admins can:
- scan QR codes,
- validate tickets,
- detect duplicate scans,
- track attendance in real time.

---

## F10 — Ticket Customization

Creators can customize:
- colors,
- typography,
- banner image,
- logo,
- ticket themes.

Preset themes:
- Minimal
- Concert
- Neon
- Campus
- Elegant
- Dark Mode

---

# 6. Database Overview

## Core Entities
- Users
- Events
- TicketTypes
- TicketRequests
- Chats
- Messages
- Tickets
- CheckIns
- AdminRoles

---

# 7. Recommended Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + Vite |
| Routing | Vue Router |
| Styling | Tailwind CSS |
| Backend | Node.js + Express |
| Database & Auth | Supabase (PostgreSQL) |
| Realtime | Socket.IO |
| File Storage | Cloudinary |
| Caching | memory-cache |
| Hosting | TBD |

---

# 8. Design System

## Design Direction

Creatick should feel:
- warm,
- energetic,
- modern,
- community-focused,
- colorful yet professional.

Avoid:
- overly corporate,
- cold enterprise UI styles.

Do NOT use emoji in UI copy, error messages, or any user-facing text.

---

## Color Palette

| Token | Color |
|---|---|
| Primary | #4F46E5 |
| Accent | #FF6B6B |
| Surface | #FFF9F5 |
| Secondary | #60A5FA |
| Success | #22C55E |
| Error | #EF4444 |

---

## Typography
Primary font:
- Inter

Secondary font:
- Poppins

---

# 9. Main Screens

## Buyer Screens
- Homepage
- Event Detail
- Ticket Request Form
- Chat Screen
- Buyer Dashboard
- QR Ticket Screen

## Creator Screens
- Creator Dashboard
- Event Editor
- Analytics Dashboard
- Team Management

## Admin Screens
- Request Queue
- Chat Inbox
- Payment Confirmation
- QR Scanner
- Attendance Panel

---

# 10. Core Workflows

## Event Creation Workflow
1. Creator registers
2. Creates event
3. Configures tickets
4. Adds admins
5. Publishes event
6. Shares event link

---

## Ticket Request Workflow
1. Buyer visits event page
2. Buyer requests ticket
3. Chat room opens
4. Buyer sends payment proof
5. Admin confirms request
6. Ticket activates
7. QR ticket generated

---

## Check-In Workflow
1. Admin opens scanner
2. Buyer presents QR
3. System validates ticket
4. Attendance updates live

---

# 11. Future Roadmap

## v2.1
- WhatsApp integration
- Push notifications
- Staff-only scanner mode
- Quick reply templates

## v2.2
- Xendit integration
- QRIS support
- Automated confirmation
- Refund handling

## v3.0
- Native mobile apps
- AI moderation
- Public creator profiles
- Social event feeds

---

# 12. Product Positioning

Creatick focuses on:
- communities,
- local events,
- campus organizations,
- creator gatherings,
- collaborative event operations.

Core positioning:

> “Cara paling gampang untuk kelola tiket event komunitas secara digital.”

---

# 13. Development Conventions

## Emoji Policy
Do NOT use emoji anywhere in the project — UI copy, error messages, code comments, commit messages, log messages, or documentation. Keep all communication text-only and professional.

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
- Log level label (INFO, WARN, ERR, DBG)
- Request ID (8-char UUID via crypto.randomUUID())
- Structured JSON metadata (userId, requestId, path, etc.)
- Errors written to stderr, others to stdout

Attach requestId to every request via Express middleware:
- Generate ID at request start
- Log response on finish with status code and duration
