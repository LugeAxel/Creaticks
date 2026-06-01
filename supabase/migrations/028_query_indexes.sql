-- 028: Additional database indexes for query performance

-- Chat: buyer thread listing + ordering (GET /chat/me)
CREATE INDEX IF NOT EXISTS idx_chat_threads_buyer_updated
  ON chat_threads(buyer_id, updated_at DESC);

-- Chat: admin thread listing + ordering (GET /chat/event/:eventId)
CREATE INDEX IF NOT EXISTS idx_chat_threads_event_updated
  ON chat_threads(event_id, updated_at DESC);

-- Tickets: event queue + status filtering (queue endpoint, cron tasks)
CREATE INDEX IF NOT EXISTS idx_ticket_requests_event_status
  ON ticket_requests(event_id, status);

-- Tickets: queue ordering (GET /event/:eventId)
CREATE INDEX IF NOT EXISTS idx_ticket_requests_created_desc
  ON ticket_requests(created_at DESC);

-- Tickets: confirmed_at for cron autoclose query
CREATE INDEX IF NOT EXISTS idx_ticket_requests_confirmed_at
  ON ticket_requests(confirmed_at);

-- Event roles: admin verification (most-frequent query pattern)
CREATE INDEX IF NOT EXISTS idx_event_roles_event_user_status
  ON event_roles(event_id, user_id, status);

-- Event roles: creator activity query
CREATE INDEX IF NOT EXISTS idx_event_roles_invited_by
  ON event_roles(invited_by);

-- Events: category filter for browse page
CREATE INDEX IF NOT EXISTS idx_events_category
  ON events(category);
