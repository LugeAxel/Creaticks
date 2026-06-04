ALTER TABLE events ADD COLUMN slug TEXT UNIQUE;
CREATE INDEX idx_events_slug ON events(slug);

CREATE OR REPLACE FUNCTION generate_slug(title TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(REGEXP_REPLACE(TRIM(title), '[^a-zA-Z0-9]+', '-', 'g'));
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  r RECORD;
  base_slug TEXT;
  final_slug TEXT;
  counter INT;
BEGIN
  FOR r IN SELECT id, title FROM events WHERE slug IS NULL LOOP
    base_slug := LEFT(COALESCE(NULLIF(generate_slug(r.title), ''), 'event'), 100);
    final_slug := base_slug;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM events WHERE slug = final_slug AND id != r.id) LOOP
      final_slug := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;
    UPDATE events SET slug = final_slug WHERE id = r.id;
  END LOOP;
END;
$$;

DROP FUNCTION generate_slug;
