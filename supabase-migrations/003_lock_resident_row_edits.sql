-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-05. Verified by impersonating a resident in SQL: date and
-- time edits blocked, status flips blocked, activity_type edits
-- blocked, mark-as-seen allowed, and cancelling an own booking
-- allowed for pending and approved bookings whose date hasn't passed.

-- ============================================================
-- Lock down what a resident may change on their own rows
-- ============================================================
-- RLS decides WHICH ROWS you can touch, never which columns. The
-- "mark viewed" policies grant UPDATE on the caller's own row, so a
-- resident could rewrite an approved booking's date and time, or
-- change an approved document request's type.
--
-- The old triggers named the forbidden columns, which fails open:
-- anything not listed was allowed, and any column added later was
-- unprotected by default. These name the ALLOWED columns instead
-- and reject every other difference.
-- ============================================================


-- ============================================================
-- 1. RESERVATIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_reservation_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Officials approve and decline; the service role runs migrations
  -- and admin tasks. Neither is restricted here.
  IF auth.role() IS NULL
     OR auth.role() = 'service_role'
     OR public.is_official(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- A resident may release their own booking -- pending or already
  -- approved -- so an unused slot goes back on the calendar instead
  -- of being blocked by a no-show. Only the status may move, and only
  -- for a date that hasn't passed yet.
  IF OLD.resident_id = auth.uid()
     AND OLD.status IN ('pending', 'approved')
     AND NEW.status = 'cancelled'
     AND OLD.preferred_date >= (now() AT TIME ZONE 'Asia/Manila')::date
  THEN
    IF (to_jsonb(NEW) - 'status' - 'updated_at' - 'resident_viewed_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'updated_at' - 'resident_viewed_at')
    THEN
      RAISE EXCEPTION 'You can only cancel this reservation, not change its details.';
    END IF;
    RETURN NEW;
  END IF;

  -- Otherwise the only thing a resident may write is the timestamp
  -- recording that they have seen the decision.
  IF (to_jsonb(NEW) - 'resident_viewed_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'resident_viewed_at')
  THEN
    RAISE EXCEPTION 'Only an official can change a reservation.';
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 2. DOCUMENT REQUESTS
-- ============================================================
-- No resident-side cancel here, so the rule is simpler: mark as seen
-- and nothing else. Which official may update is still decided by the
-- "Secretary can update document requests" policy — this trigger only
-- stops residents.
CREATE OR REPLACE FUNCTION public.protect_document_request_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF auth.role() IS NULL
     OR auth.role() = 'service_role'
     OR public.is_official(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'resident_viewed_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'resident_viewed_at')
  THEN
    RAISE EXCEPTION 'Only an official can change a document request.';
  END IF;

  RETURN NEW;
END;
$$;

-- Both triggers already exist as BEFORE UPDATE on their tables and
-- pick up the new function bodies automatically.