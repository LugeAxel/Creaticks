-- Add seat_tier column to ticket_tiers
-- When true, this tier requires seat selection during purchase
-- and its quota auto-syncs with the painted seat count

ALTER TABLE ticket_tiers ADD COLUMN IF NOT EXISTS seat_tier BOOLEAN DEFAULT FALSE;

-- Backfill existing tiers: if event has seat_map, mark tiers that appear in seat data as seat_tier
DO $$
DECLARE
  seat_data jsonb;
  seat_tiers text[];
  ev RECORD;
BEGIN
  FOR ev IN SELECT id, seat_map FROM events WHERE seat_map IS NOT NULL AND seat_map != 'null'::jsonb LOOP
    seat_data := ev.seat_map;
    IF jsonb_typeof(seat_data) = 'object' AND seat_data ? 'seats' THEN
      SELECT array_agg(DISTINCT s->>'tier') INTO seat_tiers
      FROM jsonb_array_elements(seat_data->'seats') s
      WHERE s->>'tier' IS NOT NULL AND s->>'tier' != '';
      
      IF seat_tiers IS NOT NULL AND array_length(seat_tiers, 1) > 0 THEN
        UPDATE ticket_tiers
        SET seat_tier = TRUE
        WHERE event_id = ev.id
        AND name = ANY(seat_tiers);
      END IF;
    END IF;
  END LOOP;
END $$;
