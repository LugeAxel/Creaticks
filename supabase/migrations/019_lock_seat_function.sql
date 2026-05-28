-- 019_lock_seat_function.sql — Atomic seat lock/unlock via PG functions
-- Uses FOR UPDATE NOWAIT to prevent race conditions between concurrent buyers

-- ============================================================
-- lock_seat: atomically reserve a seat
-- Returns (success BOOLEAN, expires_at TIMESTAMP)
-- If seat is not available, success = false
-- If another tx holds the lock, fails immediately (NOWAIT)
-- ============================================================
CREATE OR REPLACE FUNCTION public.lock_seat(
  _seat_id UUID,
  _session_id VARCHAR,
  _lock_minutes INTEGER DEFAULT 10
)
RETURNS TABLE(success BOOLEAN, expires_at TIMESTAMP)
LANGUAGE plpgsql
AS $$
DECLARE
  _status VARCHAR(20);
BEGIN
  SELECT status INTO _status
  FROM venue_seats
  WHERE id = _seat_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    success := false;
    expires_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF _status != 'available' THEN
    success := false;
    expires_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE venue_seats
  SET status = 'reserved',
      reserved_by = _session_id,
      reserved_until = NOW() + (_lock_minutes * INTERVAL '1 minute')
  WHERE id = _seat_id;

  success := true;
  expires_at := NOW() + (_lock_minutes * INTERVAL '1 minute');
  RETURN NEXT;
END;
$$;

-- ============================================================
-- release_seat: release a seat lock (buyer cancelled / timer expired)
-- Only releases if the seat is reserved by the given session
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_seat(
  _seat_id UUID,
  _session_id VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  _current_status VARCHAR(20);
  _current_session VARCHAR(255);
BEGIN
  SELECT status, reserved_by INTO _current_status, _current_session
  FROM venue_seats
  WHERE id = _seat_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- If session_id provided, only release if owned by that session
  IF _session_id IS NOT NULL AND _current_session != _session_id THEN
    RETURN false;
  END IF;

  -- Only release reserved seats
  IF _current_status != 'reserved' THEN
    RETURN false;
  END IF;

  UPDATE venue_seats
  SET status = 'available',
      reserved_by = NULL,
      reserved_until = NULL
  WHERE id = _seat_id;

  RETURN true;
END;
$$;

-- ============================================================
-- confirm_seats: transition reserved seats to owned after payment
-- Called when admin confirms payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_seats(
  _seat_ids UUID[]
)
RETURNS SETOF venue_seats
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE venue_seats
  SET status = 'owned',
      reserved_by = NULL,
      reserved_until = NULL
  WHERE id = ANY(_seat_ids)
  AND status = 'reserved'
  RETURNING *;
END;
$$;
