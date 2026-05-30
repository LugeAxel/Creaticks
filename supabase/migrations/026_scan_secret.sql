ALTER TABLE events ADD COLUMN IF NOT EXISTS scan_secret UUID DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_events_scan_secret ON events(scan_secret);
