ALTER TABLE events ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_format TEXT DEFAULT 'offline' CHECK (event_format IN ('offline', 'online', 'hybrid'));

ALTER TABLE events ALTER COLUMN max_tickets SET DEFAULT 0;
