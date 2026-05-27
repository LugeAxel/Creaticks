-- Event roles: per-event admin assignments
-- An admin can have multiple roles (attendance, support, secretary)
-- Invitations must be accepted by the user before taking effect

CREATE TABLE IF NOT EXISTS event_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roles TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  invited_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Activity log for tracking all changes to event roles
CREATE TABLE IF NOT EXISTS event_role_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_role_id UUID NOT NULL REFERENCES event_roles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies are added in migration 004 after events table exists
