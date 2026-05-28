-- Migration: create reserve_ticket_requests function
-- This function reserves and inserts ticket_requests atomically per tier.

CREATE OR REPLACE FUNCTION public.reserve_ticket_requests(
  _event_id uuid,
  _tier_name text,
  _user_id uuid,
  _quantity int
)
RETURNS TABLE(id uuid, event_id uuid, user_id uuid, tier_name text, status text, payment_deadline timestamptz)
LANGUAGE plpgsql
AS $$
DECLARE
  tier_row record;
  existing_count int;
  i int;
  inserted record;
BEGIN
  -- Lock the ticket_tiers row to serialize checks/updates
  SELECT * INTO tier_row FROM ticket_tiers tt WHERE tt.event_id = _event_id AND tt.name = _tier_name FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIER_NOT_FOUND';
  END IF;

  IF tier_row.quota > 0 THEN
    SELECT count(*) INTO existing_count FROM ticket_requests tr
      WHERE tr.event_id = _event_id
      AND tr.tier_name = _tier_name
      AND tr.status NOT IN ('cancelled','completed');

    IF (tier_row.quota - existing_count) < _quantity THEN
      RAISE EXCEPTION 'NOT_ENOUGH_TICKETS';
    END IF;
  END IF;

  FOR i IN 1.._quantity LOOP
    INSERT INTO ticket_requests (event_id, user_id, tier_name, status, payment_deadline)
    VALUES (
      _event_id,
      _user_id,
      _tier_name,
      CASE WHEN COALESCE(tier_row.price,0) = 0 THEN 'confirmed' ELSE 'pending' END,
      now() + interval '30 minutes'
    )
    RETURNING ticket_requests.*
    INTO inserted;

    -- Assign the OUT parameters from the inserted record, then return the row
    id := inserted.id;
    event_id := inserted.event_id;
    user_id := inserted.user_id;
    tier_name := inserted.tier_name;
    status := inserted.status;
    payment_deadline := inserted.payment_deadline;

    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;
