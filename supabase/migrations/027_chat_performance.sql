-- Composite index for chat messages ordering by thread
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created
  ON chat_messages(thread_id, created_at DESC);

-- Batched enrichments for chat threads (last message + unread count per thread)
CREATE OR REPLACE FUNCTION get_chat_enrichments(p_thread_ids UUID[], p_user_id UUID)
RETURNS TABLE(thread_id UUID, last_message JSONB, unread_count BIGINT)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id AS thread_id,
    COALESCE(
      (SELECT jsonb_build_object('content', cm.content, 'created_at', cm.created_at, 'sender_id', cm.sender_id)
       FROM chat_messages cm
       WHERE cm.thread_id = t.id
       ORDER BY cm.created_at DESC
       LIMIT 1),
      'null'::jsonb
    ) AS last_message,
    COALESCE(
      (SELECT COUNT(*)
       FROM chat_messages cm
       WHERE cm.thread_id = t.id
         AND cm.sender_id != p_user_id
         AND cm.created_at > COALESCE(
           (SELECT crr.last_read_at
            FROM chat_read_receipts crr
            WHERE crr.thread_id = t.id AND crr.user_id = p_user_id),
           '1970-01-01'::timestamp
         )
      ),
      0
    ) AS unread_count
  FROM unnest(p_thread_ids) AS t(id);
END;
$$;
