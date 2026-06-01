-- Add configurable payment_deadline_minutes to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS payment_deadline_minutes INTEGER NOT NULL DEFAULT 30;
