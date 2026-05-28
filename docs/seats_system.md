seat_system.md

Creatick Seat System

Overview

Creatick uses a grid-based seat editor for small to middle-scale events (up to ~500 seats).

Creators can:

- Define custom grid size
- Paint seat areas using seat tiers
- Automatically generate seats and ticket quantities
- Manage realtime seat reservation during ticket purchase

The system is designed to be:

- Simple
- Fast
- Easy to use
- Scalable enough for MVP launch

---

Seat Editor

Grid System

Creator defines grid size:

- Example:
  - 25x20
  - 40x15

Recommended maximum:

- ~1000 visible cells
- Target usage: ≤500 seats

Grid uses:

- CSS Grid
- Div-based rendering
- No WebGL or canvas required for MVP

---

Editor Tools

Supported Tools

Paint Tool

Paint selected cells as a seat tier.

Erase Tool

Remove painted seats.

Drag Fill

Click and drag to fill multiple seats at once.

---

Seat Tiers

Each color represents a ticket tier.

Example:

- Red → VIP
- Blue → Regular
- Green → Festival

Non-seat colors are treated as:

- stage
- screen
- aisle
- decoration
- empty space

Only seat-tier cells are counted as valid seats.

---

Seat Generation

After creator finishes editing:

System automatically:

1. Scans all painted cells
2. Generates seat objects
3. Generates seat codes
4. Calculates total ticket quantity

Example:

Row A:

- A1
- A2
- A3

Row B:

- B1
- B2

---

Seat Data Structure

Do NOT store full grid matrix.

Store only valid seats.

Example:

[
  {
    "x": 1,
    "y": 1,
    "tier": "VIP",
    "seatCode": "A1"
  }
]

---

Database Structure

venue_seats

id
event_id
seat_code
tier_id
x
y
status
reserved_until

Seat Status

Possible statuses:

- available
- reserved
- owned
- checked_in

---

Reservation System

Seat Locking

When user selects a seat:

- seat status becomes "reserved"
- reservation expires after 10 minutes if checkout is incomplete

Purpose:

- prevent double booking
- handle ticket wars safely

---

Concurrency Protection

Seat reservation must use:

- database transactions
- row-level locking

Example:

SELECT * FROM venue_seats
WHERE id = ?
FOR UPDATE;

This prevents two users from buying the same seat simultaneously.

---

Realtime Updates

For MVP:

- frontend may use polling every few seconds

Future upgrade:

- WebSocket realtime synchronization

When a seat changes status:

- all users viewing the venue should see updates

---

Validation Rules

System should prevent:

- isolated seats
- invalid empty rows
- duplicated seat codes

---

MVP Scope

Included

- Grid editor
- Paint system
- Tier coloring
- Auto numbering
- Seat reservation
- Basic realtime sync
- PostgreSQL locking

Excluded (Future Features)

- Stadium-scale venues
- WebGL rendering
- Advanced topology system
- Custom numbering logic
- Offline check-in sync
- AI seat optimization

---

Design Philosophy

Creatick seat system prioritizes:

- simplicity
- usability
- reliability

The goal is not to create a stadium-grade editor,
but a stable and efficient seat system for small and middle-scale events.