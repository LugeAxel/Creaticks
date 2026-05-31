-- 1. Add settings columns to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS claim_message_template_enabled BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS claim_message_template TEXT DEFAULT 'Halo! Saya akan membantu proses tiket Anda. Silakan kirimkan bukti pembayaran di sini.';
ALTER TABLE events ADD COLUMN IF NOT EXISTS auto_release_claims_enabled BOOLEAN DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS auto_release_claims_timeout INTEGER DEFAULT 15;

-- 2. Create admin_audit_log table for creator-only auditing
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID REFERENCES events(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  target_id   VARCHAR(255) DEFAULT '',
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Drop policies if exist to make it idempotent
DROP POLICY IF EXISTS admin_audit_log_select ON admin_audit_log;
DROP POLICY IF EXISTS admin_audit_log_insert ON admin_audit_log;

-- Creator views audit logs exclusively
CREATE POLICY admin_audit_log_select ON admin_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND e.creator_id = auth.uid()
    )
  );

-- Any authenticated user can insert (so actions performed by admins can be inserted)
CREATE POLICY admin_audit_log_insert ON admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_event ON admin_audit_log(event_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at);

-- 3. Atomically confirm a ticket request and increment sold_count
CREATE OR REPLACE FUNCTION public.confirm_ticket_request(_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id uuid;
  v_tier_name text;
BEGIN
  UPDATE ticket_requests
  SET status = 'confirmed', updated_at = now()
  WHERE id = _ticket_id AND status = 'pending'
  RETURNING event_id, tier_name INTO v_event_id, v_tier_name;

  IF FOUND THEN
    UPDATE ticket_tiers
    SET sold_count = COALESCE(sold_count, 0) + 1
    WHERE event_id = v_event_id AND name = v_tier_name;
  END IF;
END;
$$;

-- 4. Atomically decrement sold_count on refund
CREATE OR REPLACE FUNCTION public.decrement_tier_sold_count(_event_id uuid, _tier_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE ticket_tiers
  SET sold_count = GREATEST(0, COALESCE(sold_count, 0) - 1)
  WHERE event_id = _event_id AND name = _tier_name;
END;
$$;
