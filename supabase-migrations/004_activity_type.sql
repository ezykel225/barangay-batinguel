-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-05. Verified that get_reservation_slots returns the new
-- activity_type column and that the booking form writes it.
-- ============================================================
-- Show WHAT a booked slot is for, without exposing who or why
-- ============================================================
-- Residents planning an event want to know what's already on a date,
-- not just that 4 slots are gone. But `purpose` is a free-text box —
-- people write "birthday party for my daughter" or "wake for my
-- father" in it. Publishing that to every anonymous visitor is a
-- privacy leak we can't take back.
--
-- So we add a fixed category. The category is public; the free-text
-- purpose stays visible only to officials reviewing the booking.
-- ============================================================

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS activity_type text;

-- Nullable on purpose: bookings made before this feature existed have
-- no category, and the UI shows those as a plain "Booked".
ALTER TABLE reservations ADD CONSTRAINT reservations_activity_type_check
  CHECK (activity_type IS NULL OR activity_type IN (
    'Basketball',
    'Volleyball',
    'Badminton',
    'E-sports / Gaming',
    'Practice / Training',
    'Meeting / Assembly',
    'Community Event',
    'Private Event',
    'Other'
  ));


-- ============================================================
-- Teach the public availability RPCs to return the category
-- ============================================================
-- These are SECURITY DEFINER so anonymous visitors can see which
-- slots are taken WITHOUT being able to read the reservations table
-- (which holds names, emails and phone numbers). Adding a column to
-- RETURNS TABLE changes the function's return type, and Postgres
-- won't let CREATE OR REPLACE do that — so each is dropped first.

DROP FUNCTION IF EXISTS public.get_reservation_slots(date);

CREATE FUNCTION public.get_reservation_slots(p_date date)
RETURNS TABLE(
  preferred_time text,
  duration_hours integer,
  status text,
  activity_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT preferred_time, duration_hours, status, activity_type
  FROM public.reservations
  WHERE preferred_date = p_date
    AND status IN ('pending', 'approved');
$$;


DROP FUNCTION IF EXISTS public.get_reservation_slots_range(date, date);

CREATE FUNCTION public.get_reservation_slots_range(p_start date, p_end date)
RETURNS TABLE(
  preferred_date date,
  preferred_time text,
  duration_hours integer,
  status text,
  activity_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT preferred_date, preferred_time, duration_hours, status, activity_type
  FROM public.reservations
  WHERE preferred_date BETWEEN p_start AND p_end
    AND status IN ('pending', 'approved');
$$;