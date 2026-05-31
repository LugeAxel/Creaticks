-- Add auto-close ticket settings to events
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS auto_close_ticket_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_close_ticket_timeout INTEGER DEFAULT 1440;

-- Add confirmed_at to track when tickets were confirmed
ALTER TABLE public.ticket_requests
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Update confirm function to also set confirmed_at
CREATE OR REPLACE FUNCTION public.confirm_ticket_request(_ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_id uuid;
  v_tier_name text;
BEGIN
  UPDATE ticket_requests
  SET status = 'confirmed', confirmed_at = now(), updated_at = now()
  WHERE id = _ticket_id AND status = 'pending'
  RETURNING event_id, tier_name INTO v_event_id, v_tier_name;

  IF FOUND THEN
    UPDATE ticket_tiers
    SET sold_count = COALESCE(sold_count, 0) + 1
    WHERE event_id = v_event_id AND name = v_tier_name;
  END IF;
END;
$$;
