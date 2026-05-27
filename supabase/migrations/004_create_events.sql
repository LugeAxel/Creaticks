-- Events table: core entity for the platform

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  banner_url TEXT DEFAULT '',
  date TIMESTAMPTZ NOT NULL,
  location TEXT DEFAULT '',
  max_tickets INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Foreign key from event_roles to events (table created in 003)
ALTER TABLE event_roles ADD CONSTRAINT fk_event_roles_event
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- Creator owns their events: full CRUD
CREATE POLICY "Creator can CRUD own events"
  ON events FOR ALL
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- Anyone can view published events
CREATE POLICY "Anyone can view published events"
  ON events FOR SELECT
  USING (status = 'published');

-- Admin with accepted role can view assigned events
CREATE POLICY "Admin can view assigned events"
  ON events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_roles
      WHERE event_roles.event_id = events.id
      AND event_roles.user_id = auth.uid()
      AND event_roles.status = 'accepted'
    )
  );

-- Creator can also view their own events regardless of status
CREATE POLICY "Creator can view own events"
  ON events FOR SELECT
  USING (auth.uid() = creator_id);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_events_creator_id ON events(creator_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- Now that events table exists, enable RLS on event_roles and add policies
ALTER TABLE event_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_role_activity ENABLE ROW LEVEL SECURITY;

-- Creator can manage event_roles for their own events
CREATE POLICY "Creator manages own event roles"
  ON event_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_roles.event_id
      AND events.creator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_roles.event_id
      AND events.creator_id = auth.uid()
    )
  );

-- Users can view their own role assignments
CREATE POLICY "Users view own event roles"
  ON event_roles FOR SELECT
  USING (user_id = auth.uid());

-- Users can accept/reject their own pending invitations
CREATE POLICY "Users accept own invitations"
  ON event_roles FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status IN ('accepted', 'rejected'));

-- Creator can view activity for their events
CREATE POLICY "Creator views activity for own events"
  ON event_role_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_roles
      JOIN events ON events.id = event_roles.event_id
      WHERE event_roles.id = event_role_activity.event_role_id
      AND events.creator_id = auth.uid()
    )
  );

-- Creator can insert activity for their events
CREATE POLICY "Creator inserts activity for own events"
  ON event_role_activity FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_roles
      JOIN events ON events.id = event_roles.event_id
      WHERE event_roles.id = event_role_activity.event_role_id
      AND events.creator_id = auth.uid()
    )
  );

-- Admin can view activity for events they are assigned to
CREATE POLICY "Admin views activity for assigned events"
  ON event_role_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_roles AS er
      WHERE er.id = event_role_activity.event_role_id
      AND er.user_id = auth.uid()
      AND er.status = 'accepted'
    )
  );
