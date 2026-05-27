-- Add queue claiming columns to ticket_requests
ALTER TABLE ticket_requests
ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_checked_in BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_ticket_requests_claimed_by ON ticket_requests(claimed_by);
CREATE INDEX IF NOT EXISTS idx_ticket_requests_checked_in ON ticket_requests(is_checked_in);
