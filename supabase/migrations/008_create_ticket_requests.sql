CREATE TABLE IF NOT EXISTS ticket_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_name TEXT DEFAULT 'Regular',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ticket_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own tickets
CREATE POLICY "Users view own tickets"
  ON ticket_requests FOR SELECT
  USING (user_id = auth.uid());

-- Creator can view tickets for their events
CREATE POLICY "Creator views tickets for own events"
  ON ticket_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = ticket_requests.event_id
      AND events.creator_id = auth.uid()
    )
  );

-- Authenticated users can request tickets
CREATE POLICY "Users can request tickets"
  ON ticket_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Creator can update ticket status
CREATE POLICY "Creator updates ticket status"
  ON ticket_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = ticket_requests.event_id
      AND events.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = ticket_requests.event_id
      AND events.creator_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ticket_requests_user_id ON ticket_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_requests_event_id ON ticket_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_ticket_requests_status ON ticket_requests(status);
