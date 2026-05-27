ALTER TABLE events ADD COLUMN visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private'));

DROP POLICY IF EXISTS "Anyone can view published events" ON events;
CREATE POLICY "Anyone can view public published events"
  ON events FOR SELECT
  USING (status = 'published' AND visibility = 'public');

CREATE INDEX IF NOT EXISTS idx_events_visibility ON events(visibility);
