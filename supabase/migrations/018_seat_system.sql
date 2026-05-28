-- 018_seat_system.sql — Seat system, audit log, refunds, schema hardening
-- Apply after all previous migrations (001-017)

-- ============================================================
-- 1. venue_seats — grid-based seat storage
-- ============================================================
CREATE TABLE IF NOT EXISTS venue_seats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  seat_code       VARCHAR(10) NOT NULL,
  tier_id         UUID REFERENCES ticket_tiers(id) ON DELETE SET NULL,
  x               INTEGER NOT NULL,
  y               INTEGER NOT NULL,
  status          VARCHAR(20) DEFAULT 'available'
                    CHECK (status IN ('available','reserved','owned','checked_in')),
  reserved_by     VARCHAR(255),
  reserved_until  TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_venue_seats_event ON venue_seats(event_id);
CREATE INDEX IF NOT EXISTS idx_venue_seats_tier ON venue_seats(tier_id);
CREATE INDEX IF NOT EXISTS idx_venue_seats_reserved_until
  ON venue_seats(reserved_until)
  WHERE status = 'reserved';

ALTER TABLE venue_seats ENABLE ROW LEVEL SECURITY;

-- Creator + admins can view seats for their events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Event access can view seats'
    AND tablename = 'venue_seats'
  ) THEN
    CREATE POLICY "Event access can view seats"
      ON venue_seats FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM events WHERE id = venue_seats.event_id
        )
      );
  END IF;
END $$;

-- Creator can manage seats
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Creator manages seats'
    AND tablename = 'venue_seats'
  ) THEN
    CREATE POLICY "Creator manages seats"
      ON venue_seats FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM events
        WHERE events.id = venue_seats.event_id
          AND events.creator_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM events
        WHERE events.id = venue_seats.event_id
          AND events.creator_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================
-- 2. ticket_audit_log — append-only audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID REFERENCES ticket_requests(id) ON DELETE SET NULL,
  actor_id    UUID REFERENCES auth.users(id),
  actor_role  VARCHAR(50),
  action      VARCHAR(100) NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_request ON ticket_audit_log(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON ticket_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON ticket_audit_log(created_at);

ALTER TABLE ticket_audit_log ENABLE ROW LEVEL SECURITY;

-- Creator can view audit for their events (via request_id -> ticket_requests -> events)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Creator views audit logs'
    AND tablename = 'ticket_audit_log'
  ) THEN
    CREATE POLICY "Creator views audit logs"
      ON ticket_audit_log FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM ticket_requests tr
          JOIN events e ON e.id = tr.event_id
          WHERE tr.id = ticket_audit_log.request_id
          AND e.creator_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Admin can view audit for assigned events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Admin views audit logs'
    AND tablename = 'ticket_audit_log'
  ) THEN
    CREATE POLICY "Admin views audit logs"
      ON ticket_audit_log FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM ticket_requests tr
          JOIN event_roles er ON er.event_id = tr.event_id
          WHERE tr.id = ticket_audit_log.request_id
          AND er.user_id = auth.uid()
          AND er.status = 'accepted'
        )
      );
  END IF;
END $$;

-- ============================================================
-- 3. refund_requests — refund workflow
-- ============================================================
CREATE TABLE IF NOT EXISTS refund_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID REFERENCES ticket_requests(id) ON DELETE SET NULL,
  buyer_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason          TEXT NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     UUID REFERENCES auth.users(id),
  review_note     TEXT,
  requested_at    TIMESTAMP DEFAULT NOW(),
  reviewed_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refund_ticket ON refund_requests(ticket_id);
CREATE INDEX IF NOT EXISTS idx_refund_buyer ON refund_requests(buyer_id);

ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Buyer views own refunds'
    AND tablename = 'refund_requests'
  ) THEN
    CREATE POLICY "Buyer views own refunds"
      ON refund_requests FOR SELECT
      USING (buyer_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Creator views refunds for own events'
    AND tablename = 'refund_requests'
  ) THEN
    CREATE POLICY "Creator views refunds for own events"
      ON refund_requests FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM ticket_requests tr
          JOIN events e ON e.id = tr.event_id
          WHERE tr.id = refund_requests.ticket_id
          AND e.creator_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Buyer creates refund request'
    AND tablename = 'refund_requests'
  ) THEN
    CREATE POLICY "Buyer creates refund request"
      ON refund_requests FOR INSERT
      WITH CHECK (buyer_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 4. Extend events with refund policy + seat_map
-- ============================================================
ALTER TABLE events ADD COLUMN IF NOT EXISTS refund_policy VARCHAR(20) DEFAULT 'no_refund'
  CHECK (refund_policy IN ('full_refund','partial_refund','no_refund','custom'));

ALTER TABLE events ADD COLUMN IF NOT EXISTS refund_custom_terms TEXT DEFAULT '';

ALTER TABLE events ADD COLUMN IF NOT EXISTS seat_map JSONB DEFAULT NULL;

-- ============================================================
-- 5. Add sold_count to ticket_tiers (for speed; reconciled via cron)
-- ============================================================
ALTER TABLE ticket_tiers ADD COLUMN IF NOT EXISTS sold_count INTEGER DEFAULT 0;

-- ============================================================
-- 6. Extend ticket_requests status values
-- ============================================================
ALTER TABLE ticket_requests DROP CONSTRAINT IF EXISTS ticket_requests_status_check;
ALTER TABLE ticket_requests ADD CONSTRAINT ticket_requests_status_check
  CHECK (status IN ('pending','confirmed','cancelled','completed','owned','expired','pending_payment'));

ALTER TABLE ticket_requests ADD COLUMN IF NOT EXISTS qr_data TEXT DEFAULT NULL;

-- ============================================================
-- 7. Extend invoices with transfer proof fields
-- ============================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS transfer_reference TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sender_bank VARCHAR(50) DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS transfer_amount BIGINT DEFAULT 0;

-- ============================================================
-- 8. canned_responses for admin inbox efficiency
-- ============================================================
CREATE TABLE IF NOT EXISTS canned_responses (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id  UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title     VARCHAR(100) NOT NULL,
  body      TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE canned_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Creator manages canned responses'
    AND tablename = 'canned_responses'
  ) THEN
    CREATE POLICY "Creator manages canned responses"
      ON canned_responses FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM events WHERE id = canned_responses.event_id AND creator_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM events WHERE id = canned_responses.event_id AND creator_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Admin views canned responses'
    AND tablename = 'canned_responses'
  ) THEN
    CREATE POLICY "Admin views canned responses"
      ON canned_responses FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM event_roles
          WHERE event_roles.event_id = canned_responses.event_id
          AND event_roles.user_id = auth.uid()
          AND event_roles.status = 'accepted'
        )
      );
  END IF;
END $$;
