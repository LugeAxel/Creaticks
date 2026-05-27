-- Chat system for buyer-admin communication

CREATE TABLE IF NOT EXISTS chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_request_id UUID NOT NULL REFERENCES ticket_requests(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(ticket_request_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'system')),
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Participants can view their threads
CREATE POLICY "Participants view own threads"
  ON chat_threads FOR SELECT
  USING (
    buyer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM event_roles
      WHERE event_roles.event_id = chat_threads.event_id
      AND event_roles.user_id = auth.uid()
      AND event_roles.status = 'accepted'
    )
    OR EXISTS (
      SELECT 1 FROM events
      WHERE events.id = chat_threads.event_id
      AND events.creator_id = auth.uid()
    )
  );

-- Participants can view messages in their threads
CREATE POLICY "Participants view messages"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
      AND (
        chat_threads.buyer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM event_roles
          WHERE event_roles.event_id = chat_threads.event_id
          AND event_roles.user_id = auth.uid()
          AND event_roles.status = 'accepted'
        )
        OR EXISTS (
          SELECT 1 FROM events
          WHERE events.id = chat_threads.event_id
          AND events.creator_id = auth.uid()
        )
      )
    )
  );

-- Authenticated users can insert messages
CREATE POLICY "Users can insert messages"
  ON chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
      AND (
        chat_threads.buyer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM event_roles
          WHERE event_roles.event_id = chat_threads.event_id
          AND event_roles.user_id = auth.uid()
          AND event_roles.status = 'accepted'
        )
        OR EXISTS (
          SELECT 1 FROM events
          WHERE events.id = chat_threads.event_id
          AND events.creator_id = auth.uid()
        )
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_chat_threads_ticket ON chat_threads(ticket_request_id);
CREATE INDEX IF NOT EXISTS idx_chat_threads_event ON chat_threads(event_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
