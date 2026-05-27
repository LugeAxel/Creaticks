CREATE TABLE IF NOT EXISTS ticket_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Regular',
  price INTEGER DEFAULT 0,
  quota INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ticket_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creator manages own ticket tiers"
  ON ticket_tiers FOR ALL
  USING (public.is_event_creator(event_id))
  WITH CHECK (public.is_event_creator(event_id));

CREATE POLICY "Anyone can view ticket tiers for published events"
  ON ticket_tiers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events WHERE id = event_id AND status = 'published'
    )
  );

CREATE POLICY "Creator and admins can view ticket tiers for their events"
  ON ticket_tiers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events WHERE id = event_id AND (
        creator_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM event_roles
          WHERE event_roles.event_id = events.id
          AND event_roles.user_id = auth.uid()
          AND event_roles.status = 'accepted'
        )
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_ticket_tiers_event_id ON ticket_tiers(event_id);
