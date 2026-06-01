ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_start_time TIME NOT NULL DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS event_end_time   TIME NOT NULL DEFAULT '23:59',
  ADD COLUMN IF NOT EXISTS timezone         VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta';

UPDATE events
SET
  event_start_time = date::time,
  event_end_time   = (date::time + INTERVAL '3 hours')::time
WHERE
  event_start_time = '00:00'::time AND event_end_time = '23:59'::time AND date IS NOT NULL;
