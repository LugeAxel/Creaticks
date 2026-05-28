-- Create ticket_designs table for event ticket customization
CREATE TABLE IF NOT EXISTS ticket_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  layout TEXT NOT NULL DEFAULT 'classic' CHECK (layout IN ('classic', 'split', 'minimal')),
  font TEXT NOT NULL DEFAULT 'syne' CHECK (font IN ('syne', 'bebas', 'playfair', 'mono')),
  accent_color TEXT NOT NULL DEFAULT '#6C63FF',
  bg_color TEXT NOT NULL DEFAULT '#1a1a2e',
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  artwork_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id)
);

-- Enable RLS
ALTER TABLE ticket_designs ENABLE ROW LEVEL SECURITY;

-- Creator can manage their own event designs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Creator can manage designs for their events'
    AND tablename = 'ticket_designs'
  ) THEN
    CREATE POLICY "Creator can manage designs for their events"
      ON ticket_designs FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM events
          WHERE events.id = ticket_designs.event_id
          AND events.creator_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Admin can view designs for assigned events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Admin can view designs for assigned events'
    AND tablename = 'ticket_designs'
  ) THEN
    CREATE POLICY "Admin can view designs for assigned events"
      ON ticket_designs FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM event_roles
          WHERE event_roles.event_id = ticket_designs.event_id
          AND event_roles.user_id = auth.uid()
          AND event_roles.status = 'accepted'
        )
      );
  END IF;
END $$;

-- Index for event lookups
CREATE INDEX IF NOT EXISTS idx_ticket_designs_event_id ON ticket_designs(event_id);
