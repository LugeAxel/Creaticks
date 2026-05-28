-- CORE_FIX.md Section 4 Fix B: Immutable Audit Log
-- Append-only log for all ticket request actions.
-- No UPDATE or DELETE ever performed on this table.

CREATE TABLE IF NOT EXISTS ticket_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID REFERENCES ticket_requests(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role  VARCHAR(50)   NOT NULL DEFAULT 'buyer',
  action      VARCHAR(100)  NOT NULL,
  metadata    JSONB         DEFAULT '{}'::jsonb,
  ip_address  VARCHAR(45)   DEFAULT '',
  created_at  TIMESTAMP     DEFAULT NOW()
);

-- Index for fast lookup by request
CREATE INDEX IF NOT EXISTS idx_ticket_audit_log_request_id ON ticket_audit_log(request_id);
CREATE INDEX IF NOT EXISTS idx_ticket_audit_log_created_at ON ticket_audit_log(created_at);

-- Revoke all update/delete permissions
ALTER TABLE ticket_audit_log ENABLE ROW LEVEL SECURITY;

-- Only allow INSERT and SELECT, never UPDATE or DELETE
CREATE POLICY ticket_audit_log_insert ON ticket_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY ticket_audit_log_select ON ticket_audit_log FOR SELECT
  TO authenticated
  USING (
    actor_id = auth.uid() OR
    EXISTS (SELECT 1 FROM events e JOIN ticket_requests tr ON tr.event_id = e.id WHERE tr.id = request_id AND (e.creator_id = auth.uid() OR EXISTS (SELECT 1 FROM event_roles er WHERE er.event_id = e.id AND er.user_id = auth.uid() AND er.status = 'accepted')))
  );
