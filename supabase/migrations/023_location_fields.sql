-- 023_location_fields.sql — Add structured location fields to events
-- Adds lat/lng coordinates for Leaflet maps and a separate detail field

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location_lng DECIMAL(10,7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location_detail TEXT DEFAULT '';

-- location column repurposed as the place/venue name (e.g. "Universitas Indonesia")
-- location_detail stores the street/address detail (e.g. "Gedung Serbaguna, Jl. Margonda Raya")
-- location_lat / location_lng store GPS coordinates from Leaflet picker
