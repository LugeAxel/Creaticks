-- Add payment_deadline to ticket_requests
ALTER TABLE ticket_requests
ADD COLUMN IF NOT EXISTS payment_deadline TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes');

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_request_id UUID NOT NULL REFERENCES ticket_requests(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price BIGINT NOT NULL,
  total_amount BIGINT NOT NULL,
  payment_date TIMESTAMPTZ DEFAULT now(),
  payment_method TEXT DEFAULT 'Manual Transfer',
  status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Invoices
CREATE POLICY "Creator can view all invoices for their events"
  ON invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = invoices.event_id
      AND events.creator_id = auth.uid()
    )
  );

CREATE POLICY "Admin can view invoices for assigned events"
  ON invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_roles
      WHERE event_roles.event_id = invoices.event_id
      AND event_roles.user_id = auth.uid()
      AND event_roles.status = 'accepted'
    )
  );

CREATE POLICY "Buyer can view their own invoices"
  ON invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ticket_requests
      WHERE ticket_requests.id = invoices.ticket_request_id
      AND ticket_requests.user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_event_id ON invoices(event_id);
CREATE INDEX IF NOT EXISTS idx_invoices_ticket_request_id ON invoices(ticket_request_id);
