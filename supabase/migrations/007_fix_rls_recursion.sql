CREATE OR REPLACE FUNCTION public.is_event_creator(event_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM events WHERE id = event_id AND creator_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Creator manages own event roles" ON event_roles;
DROP POLICY IF EXISTS "Creator views activity for own events" ON event_role_activity;
DROP POLICY IF EXISTS "Creator inserts activity for own events" ON event_role_activity;

CREATE POLICY "Creator manages own event roles"
  ON event_roles FOR ALL
  USING (public.is_event_creator(event_id))
  WITH CHECK (public.is_event_creator(event_id));

CREATE POLICY "Creator views activity for own events"
  ON event_role_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_roles
      WHERE event_roles.id = event_role_activity.event_role_id
      AND public.is_event_creator(event_roles.event_id)
    )
  );

CREATE POLICY "Creator inserts activity for own events"
  ON event_role_activity FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_roles
      WHERE event_roles.id = event_role_activity.event_role_id
      AND public.is_event_creator(event_roles.event_id)
    )
  );
