# seatclient.md
## Creatick Seat Client System Specification
### Version 1.0
### Status: Draft

---

# 1. Overview

This document defines the seat selection client system for Creatick event detail pages.

The system must solve these problems:

1. Leaflet map on event detail page sometimes appears as a blank canvas.
2. Event coordinates must be visible and easy to copy.
3. Ticket tiers with seats must only allow seat-based booking.
4. Ticket tiers without seats must not show seat selection.
5. Mixed orders must support both seat tickets and non-seat tickets in the same order.
6. Seat selection must be tied to the correct ticket tier and ticket quantity.
7. The UI must prevent invalid seat choices by design, not just by validation after submission.

---

# 2. Product Intent

Creatick is not only selling tickets. It is managing ticket types with different fulfillment rules.

There are two ticket models:

- **Seat-based ticket**
  - Requires seat selection
  - Uses seat map
  - Seat must belong to the selected tier
  - Seat cannot be shared with other tiers

- **Non-seat ticket**
  - Does not require seat selection
  - No seat map interaction
  - Can be sold as general admission or standing access

The client must distinguish these two models clearly.

---

# 3. Core Rules

## 3.1 Seat Tier Rules

If a ticket tier has seats enabled:

- The buyer may only select seats from that tier’s seat map.
- Other tier seats must be disabled or hidden.
- Other tier seat options must appear grayscale and non-interactive.
- The buyer cannot submit the order unless the required number of seats is chosen.
- Seat quantity must match the ticket quantity for that seat tier.

## 3.2 Non-Seat Tier Rules

If a ticket tier does not have seats enabled:

- No seat map should appear.
- No seat picker should appear.
- The buyer should only choose quantity.
- The order should proceed without seat assignment.

## 3.3 Mixed Order Rules

An order may contain multiple ticket tiers at once.

Example:
- 2 seat tickets from Tier A
- 1 regular ticket from Tier B

In this case:
- Tier A must open its own seat map.
- Tier B must not open any seat map.
- Seat selection must be done separately per seat tier.

The system must not let one seat selection be reused across different tiers.

---

# 4. Event Detail Page Requirements

## 4.1 Map Section

The event detail page must show:

- Map preview
- Event address
- Latitude and longitude
- Copy coordinates button
- Open in Google Maps button

### If the map fails to load:
Fallback must show:
- static map container,
- event address,
- coordinates,
- copy button,
- open maps button.

The page must never show a dead blank area without fallback UI.

## 4.2 Coordinate Copy Feature

The coordinates display should look like this:

```text
-6.200000, 106.816666
```

Add a button:
- `Copy Coordinates`

When clicked:
- copy latitude and longitude to clipboard
- show success toast
- change label briefly to `Copied`

If coordinates are missing:
- hide the copy button
- show `Location not available`

---

# 5. Seat Selection System

## 5.1 Ticket Tier Model

Each ticket tier must have a seat mode.

### Tier Fields
- `hasSeatMap` boolean
- `seatMapId` optional
- `seatSelectionMode`
  - `none`
  - `required`
  - `optional` is not allowed for MVP

### Logic
- `none` means no seats
- `required` means seats must be selected
- `optional` should be avoided because it creates confusing UX

---

## 5.2 Seat Map Rules

Each seat map belongs to exactly one ticket tier.

That means:

- Tier A seat map belongs to Tier A only
- Tier B seat map belongs to Tier B only
- Seat map from one tier cannot be used for another tier

This prevents:
- seat duplication,
- pricing confusion,
- tier mismatch,
- booking errors.

---

## 5.3 Disabled Seat Behavior

When a buyer opens a tier that is not allowed for the current seat map:

- seats from other tiers must appear in grayscale
- hover state must be disabled
- click state must be blocked
- cursor should indicate disabled state
- tooltip may explain:
  - `This seat belongs to another ticket tier`

---

# 6. Order Composition Rules

An order can contain multiple line items.

Each line item must be processed independently.

## Example Order
- 2x Tier A Seat Ticket
- 1x Tier B General Ticket

### Required Behavior
- Tier A opens seat map and requires 2 seats
- Tier B does not open seat map
- Tier B quantity is selected normally
- Buyer cannot accidentally assign Tier A seats to Tier B

---

## 6.1 Seat Count Matching

If buyer selects:
- 3 seat tickets

Then:
- 3 seats must be selected
- 1 selected seat is not enough
- 4 selected seats is invalid

Seat quantity and seat selection must always match.

---

## 6.2 Seat Assignment Mapping

Each selected seat should be linked to:

- `ticketTypeId`
- `ticketLineItemId`
- `seatId`

This prevents incorrect allocation.

---

# 7. Client State Model

## 7.1 Suggested Frontend State

```ts
type TicketLineItem = {
  id: string;
  ticketTypeId: string;
  name: string;
  quantity: number;
  hasSeatMap: boolean;
  selectedSeats: string[];
};

type SeatSelectionState = {
  eventId: string;
  lineItems: TicketLineItem[];
  activeTierId: string | null;
  activeSeatMapId: string | null;
  copiedCoordinates: boolean;
};
```

---

## 7.2 State Rules

- Only one tier seat map should be active at a time
- Non-seat tiers should not create seat selection state
- Selected seats must always be stored per line item
- Seat state should reset if quantity changes
- Seat state should reset if tier changes

---

# 8. UI Behavior

## 8.1 Ticket Tier Cards

Each tier card should display:

- tier name
- price
- quantity selector
- seat requirement badge
- availability badge

### Badge Examples
- `Seat Required`
- `General Admission`
- `Sold Out`
- `Limited Seats`

---

## 8.2 Seat Tier Card Behavior

If tier has seats:
- show `Choose Seats`
- show seat requirement indicator
- show seat count required

If tier has no seats:
- hide `Choose Seats`
- show only quantity selector

---

## 8.3 Grayscale Disabled Seat Style

Disabled seats should have:

- gray fill
- reduced opacity
- no hover animation
- no pointer interaction
- small legend note

Example:
- `Belongs to VIP tier`
- `Unavailable for this ticket type`

---

# 9. Seat Map Interaction Flow

## Flow for Seat Tickets

1. Buyer selects seat-enabled ticket tier
2. Buyer sets quantity
3. System opens that tier’s seat map
4. Buyer selects exact number of seats
5. System validates seat ownership and count
6. Buyer continues checkout

---

## Flow for Non-Seat Tickets

1. Buyer selects non-seat ticket tier
2. Buyer sets quantity
3. System skips seat map
4. Buyer continues checkout

---

# 10. Validation Rules

## 10.1 Client Validation

Before submit:

- each seat tier must have selected seats equal to quantity
- each selected seat must belong to the correct tier
- no duplicate seat selection allowed
- no seat selected for non-seat tier
- no seat from other tier allowed

---

## 10.2 Server Validation

Server must re-check:

- seat ownership
- seat availability
- seat count
- tier-to-seat mapping
- event ID match
- order ID match

Never trust frontend validation alone.

---

# 11. Database Design

## 11.1 Events

```sql
events
- id
- title
- description
- location
- latitude
- longitude
- map_provider
- created_at
```

---

## 11.2 Ticket Types

```sql
ticket_types
- id
- event_id
- name
- price
- quantity
- has_seat_map
- seat_map_id
- status
```

---

## 11.3 Seat Maps

```sql
seat_maps
- id
- event_id
- ticket_type_id
- name
- layout_json
- rows
- columns
- created_at
```

---

## 11.4 Seats

```sql
seats
- id
- seat_map_id
- label
- row_label
- column_label
- status
- tier_lock_ticket_type_id
```

---

## 11.5 Orders

```sql
orders
- id
- buyer_id
- event_id
- status
- created_at
```

---

## 11.6 Order Items

```sql
order_items
- id
- order_id
- ticket_type_id
- quantity
- has_seat_map
```

---

## 11.7 Seat Assignments

```sql
seat_assignments
- id
- order_item_id
- seat_id
- ticket_id
- created_at
```

---

# 12. API Requirements

## 12.1 Event Detail API

```http
GET /api/events/:id
```

Must return:
- event details
- coordinates
- map data
- ticket types
- seat map metadata

---

## 12.2 Seat Map API

```http
GET /api/events/:id/ticket-types/:ticketTypeId/seat-map
```

Must return:
- allowed seat map
- seats
- disabled seats
- seat availability
- tier lock information

---

## 12.3 Seat Reservation API

```http
POST /api/orders/:orderId/seat-reserve
```

Payload:
- ticketTypeId
- seatIds[]
- quantity

Must validate:
- correct tier
- correct count
- seat availability

---

## 12.4 Copy Coordinates Behavior

This is frontend-only, but the event API must expose:

- `latitude`
- `longitude`
- `formattedAddress`

---

# 13. Leaflet Map Fix Strategy

If the Leaflet map appears blank, the client should check:

## Common causes
- container height is 0
- CSS missing
- map initialized before DOM render
- tiles blocked
- invalid coordinates
- map invalidation not called after render

## Required fix behavior
- Ensure the map container has explicit height
- Call invalidation after mount if needed
- Render fallback UI if tile layer fails
- Never leave an empty map box without context

---

# 14. UI Components Needed

## 14.1 Event Location Card
Shows:
- map preview
- address
- coordinates
- copy button
- open map button

---

## 14.2 Tier Card
Shows:
- ticket name
- price
- seat badge
- quantity selector
- choose seats button if needed

---

## 14.3 Seat Map Panel
Shows:
- seat grid
- legend
- selected seat count
- disabled tiers in grayscale

---

## 14.4 Order Summary
Shows:
- selected tier
- quantity
- selected seats
- total price
- validation warnings

---

# 15. UX Edge Cases

## 15.1 Quantity Changed After Seats Selected
If the buyer changes quantity:
- selected seats must be revalidated
- extra seats must be removed or buyer must reselect

## 15.2 Seat Became Unavailable
If a selected seat is taken by another user:
- show warning
- remove seat from selection
- ask user to pick another seat

## 15.3 Mixed Seat and Non-Seat Order
If order contains both:
- process seat tiers separately
- process non-seat tiers normally
- do not merge selection logic

---

# 16. Acceptance Criteria

The system is correct only if:

- Seat tiers only allow their own seats
- Other tier seats are disabled or grayscale
- Non-seat tiers do not show seat map
- Mixed orders work correctly
- Seat quantity matches selected seat count
- Coordinates can be copied from event detail
- Map never shows a blank empty box without fallback
- Server re-validates all seat selections

---

# 17. Developer Notes

This system should be implemented as a strict rule-based flow.

Do not make seat selection flexible in a way that breaks tier separation.

Do not allow:
- cross-tier seat reuse
- seat selection without ticket tier
- seat map display for general admission tickets
- silent failure when map does not load

The UI must guide the user toward valid behavior before submission.

---

# 18. Summary

Creatick seat handling must support:

- seat-based tiers,
- non-seat tiers,
- mixed-ticket orders,
- tier-locked seat maps,
- disabled out-of-tier seats,
- coordinate copy functionality,
- and robust map fallback behavior.

The system should be strict, readable, and hard to misuse.
