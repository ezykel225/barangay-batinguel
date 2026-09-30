-- ============================================================
-- Barangay Batinguel E-System
-- 020 — covered court booking window and office-hours exceptions
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-30 via the Supabase connector as migration
-- `reservation_hours_window`.
--
-- THE RULE
-- Ordinary covered court bookings run 5:00 PM - 10:00 PM. The court is
-- available to book after office hours, so the window is when the
-- FACILITY is open: a booking must FINISH by 10:00 PM, not merely start
-- before it. Maximum duration stays 4 hours, so the latest ordinary
-- start for a 4-hour booking is 6:00 PM.
--
-- Office-hour bookings are allowed as EXCEPTIONS, decided one at a time
-- by the barangay. A resident asks for one deliberately and must explain
-- the activity. Ayuda distributions, health activities and city or
-- government activities are the examples the barangay gave.
--
-- ⚠️ THOSE EXAMPLES ARE NOT APPROVAL CATEGORIES. Nothing in this
-- migration, and nothing in the app, treats `activity_type` as grounds
-- for anything. Whether an event can be accommodated depends on the day
-- and on which officials are available, so an official decides every
-- one. Do not add logic that approves an exception because a category
-- was selected.
--
-- The daytime slots (8:00 AM - 5:00 PM) are INHERITED SYSTEM BEHAVIOUR,
-- not a documented statement of barangay office hours. They are the
-- range this system has always offered; nobody has told us the hall's
-- hours are exactly those. User-facing text says "office hours" without
-- claiming a span.
--
-- ── VERIFIED, each case in a transaction that was rolled back ──
--
-- STRUCTURE after the column rewrite:
--   exclusion constraint still present, definition unchanged     PASS
--   slot_hour still GENERATED ALWAYS                             PASS
--   trg_protect_reservation_status still present                 PASS
--   6 RLS policies, "Treasurer can update reservations" intact   PASS
--   get_reservation_slots result shape unchanged, and neither
--     slot function mentions exception_reason                     PASS
--   reservation_slot_hour is IMMUTABLE + SECURITY INVOKER         PASS
--
-- DATA after the rewrite:
--   21 rows, 0 with slot_hour NULL, 0 with exception_reason      PASS
--   min slot 8 / max slot 14 — history unchanged                 PASS
--   mapping: 8:00 AM->8, 5..9 PM->17..21, '9:30 PM'->NULL        PASS
--
-- WINDOW, as `authenticated` (20 cases, all as intended):
--   5 PM  4h -> ends 9 PM                            ACCEPTED
--   6 PM  4h -> ends 10 PM exactly                   ACCEPTED
--   7 PM  4h -> ends 11 PM                           REJECTED
--   9 PM  1h -> ends 10 PM exactly                   ACCEPTED
--   9 PM  2h -> ends 11 PM                           REJECTED
--   '9:30 PM' (not a slot the court offers)          REJECTED
--   ordinary evening booking WITH a reason           REJECTED
--   office hours 8 AM, no reason                     REJECTED
--   office hours 8 AM, whitespace-only reason        REJECTED
--   office hours 8 AM with a reason                  ACCEPTED
--   office hours 4 PM 3h -> ends 7 PM                ACCEPTED
--   office hours 11 AM 3h, spanning the lunch gap    ACCEPTED
--
-- OVERLAP still works in the new hours:
--   5 PM 2h holds [17,19)                            ACCEPTED
--   6 PM 1h against it                               REJECTED 23P01
--   7 PM 1h adjacent to it                           ACCEPTED
--   5 PM 1h same slot, different date                ACCEPTED
--
-- AS `anon` (the publishable-key path — item 9 of the brief):
--   office hours, no reason                          REJECTED
--   evening booking ending after 10 PM               REJECTED
--   unknown time                                     REJECTED
--   ordinary evening booking                         ACCEPTED
--
-- HISTORY STAYS USABLE — the regression a CHECK would have caused:
--   legacy 8 AM row -> approved  (as the Treasurer)  ACCEPTED, 1 row
--   legacy 8 AM row -> declined                      ACCEPTED, 1 row
--   legacy 8 AM row -> cancelled                     ACCEPTED, 1 row
--
-- The accepting cases matter as much as the refusals. A guard that
-- rejected everything would pass every refusal test and break the site.
--
-- ⚠️ NOON IS NOT A CLOSURE FOR AN EXCEPTION — corrected 2026-09-30.
-- The "11 AM 3h, spanning the lunch gap ACCEPTED" case above was first
-- recorded here as a gap, with a proposed `v_hour < 13 AND v_end > 12`
-- condition to close it. The barangay then decided the opposite, and
-- that decision stands: an office-hours exception MAY run continuously
-- across 12 NN - 1 PM, because an ayuda or distribution activity can
-- take most or all of the day. So the case is a PASS, and no rule
-- prohibiting a noon-spanning exception is to be added here.
--
-- What was actually wrong was the CLIENT. Its slot walk stopped at the
-- 11 AM / 1 PM label gap, so it under-reported a booking's extent --
-- including an approved 10:00 AM / 3-hour row already in this table,
-- whose exclusion range is [10,13) while the form printed "Ends At:
-- 12:00 PM". Fixed in src/utils/reservationWindow.js by computing the
-- extent in hours (coveredHours) to match that range exactly. The
-- database needed no change: verified that the constraint refuses both
-- an 11:00 AM and a 1:00 PM booking against a 10 AM / 4-hour
-- exception, so overlap protection already covers every hour of a long
-- span, noon included.
--
-- ⚠️ TWO THINGS THIS GUARD STILL DOES NOT DO, both pre-existing:
--   * It does not cap duration. reservations_duration_hours_check
--     allows 1..8 and predates this migration, so the 4-hour cap on an
--     ORDINARY booking lives only in the client. Verified: a 5:00 PM
--     5-hour booking with no reason is ACCEPTED over the API. The
--     exception cap of 8 is deliberately that CHECK's own ceiling, so
--     client and database agree there without a schema change.
--   * A 12:00 NN start is refused (P0001, unknown time) rather than
--     stored -- reservation_slot_hour() has no such case, and a NULL
--     slot_hour would escape the constraint's partial WHERE. Noon is a
--     coverable hour, not a startable one. Making it startable means
--     adding the mapping here, which is a migration.
-- Both recorded in CLAUDE.md under *The office-hours exception*.
--
-- get_advisors(security): the SECURITY DEFINER RPC lints went 11 -> 12,
-- adding `enforce_reservation_window`, exactly like every other trigger
-- function in this project. Confirmed not usable that way: a direct call
-- returns `0A000 trigger functions can only be called as triggers`.
-- `reservation_slot_hour` is not flagged at all — it is SECURITY
-- INVOKER. No new `rls_disabled_in_public` finding; no new table.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_enforce_reservation_window ON public.reservations;
--   DROP FUNCTION IF EXISTS public.enforce_reservation_window();
--   ALTER TABLE public.reservations DROP COLUMN IF EXISTS exception_reason;
--   ALTER TABLE public.reservations DROP CONSTRAINT reservations_activity_type_check;
--   ALTER TABLE public.reservations ADD CONSTRAINT reservations_activity_type_check
--     CHECK (activity_type IS NULL OR activity_type = ANY (ARRAY[
--       'Basketball','Volleyball','Badminton','E-sports / Gaming',
--       'Practice / Training','Meeting / Assembly','Community Event',
--       'Private Event','Other']));
--   -- Put the nine-label map back INLINE, not through the helper, then
--   -- drop the helper. Dropping it while the column depends on it fails.
--   ALTER TABLE public.reservations ALTER COLUMN slot_hour SET EXPRESSION AS (
--     CASE preferred_time
--       WHEN '8:00 AM' THEN 8 WHEN '9:00 AM' THEN 9 WHEN '10:00 AM' THEN 10
--       WHEN '11:00 AM' THEN 11 WHEN '1:00 PM' THEN 13 WHEN '2:00 PM' THEN 14
--       WHEN '3:00 PM' THEN 15 WHEN '4:00 PM' THEN 16 WHEN '5:00 PM' THEN 17
--       ELSE NULL::integer END);
--   DROP FUNCTION IF EXISTS public.reservation_slot_hour(text);
--   -- ⚠️ Rolling back with evening bookings in the table would null
--   -- their slot_hour and silently drop them from the overlap guard.
--   -- Check for slot_hour >= 18 first and decide what to do with them.
-- ============================================================


-- ── One definition of the hour map ───────────────────────────────
-- The generated column and the INSERT guard both need it, and a second
-- copy is exactly how migration 010's header warned this would break:
-- "If the two ever disagree the constraint silently stops covering the
-- affected rows." IMMUTABLE so a generation expression may use it —
-- verified before applying that PostgreSQL accepts a user-defined
-- immutable function there, and that SET EXPRESSION keeps the exclusion
-- constraint.
CREATE OR REPLACE FUNCTION public.reservation_slot_hour(p_label text)
RETURNS integer
LANGUAGE sql
IMMUTABLE STRICT
SET search_path = public
AS $$
  SELECT CASE p_label
    WHEN '8:00 AM'  THEN 8
    WHEN '9:00 AM'  THEN 9
    WHEN '10:00 AM' THEN 10
    WHEN '11:00 AM' THEN 11
    WHEN '1:00 PM'  THEN 13
    WHEN '2:00 PM'  THEN 14
    WHEN '3:00 PM'  THEN 15
    WHEN '4:00 PM'  THEN 16
    WHEN '5:00 PM'  THEN 17
    WHEN '6:00 PM'  THEN 18
    WHEN '7:00 PM'  THEN 19
    WHEN '8:00 PM'  THEN 20
    WHEN '9:00 PM'  THEN 21
    ELSE NULL::integer
  END
$$;

COMMENT ON FUNCTION public.reservation_slot_hour(text) IS
  'Display label -> hour of day. Used by the generated slot_hour column '
  'and by enforce_reservation_window(). Changing it does NOT recompute '
  'stored slot_hour values: that needs ALTER COLUMN slot_hour SET '
  'EXPRESSION in a migration, which rewrites the table.';

-- ── Extend slot_hour through 9:00 PM ─────────────────────────────
-- 12:00 NN is absent on purpose: the court closes for lunch, so there is
-- no 12 PM slot and never was. 11 AM is [11,12) and 1 PM is [13,14),
-- which do not intersect, so the overlap guard needs no special case.
--
-- SET EXPRESSION (PostgreSQL 17; this project runs 17.6) rewrites the
-- table and RECOMPUTES every stored value, which is why the map above
-- must keep all nine original labels: dropping one would null its rows'
-- slot_hour and quietly remove them from the overlap guard's partial
-- WHERE clause. Verified after applying: 21 rows, 0 nulls.
ALTER TABLE public.reservations
  ALTER COLUMN slot_hour
  SET EXPRESSION AS (public.reservation_slot_hour(preferred_time));

-- ── The resident's explanation for an office-hours request ───────
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS exception_reason text;

COMMENT ON COLUMN public.reservations.exception_reason IS
  'Why this booking needs office hours. NULL for an ordinary evening '
  'booking and for every reservation made before migration 020, which is '
  'what keeps historical daytime bookings from being relabelled as '
  'exception requests. Officials only -- never added to '
  'get_reservation_slots or get_reservation_slots_range.';

-- ── Three descriptive categories ─────────────────────────────────
-- Labels only, and publicly visible on the availability calendar like
-- every other activity_type. Nothing treats them as grounds for
-- approval. Existing rows all hold one of the original nine, so
-- re-adding the constraint validates cleanly.
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_activity_type_check;

ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_activity_type_check
  CHECK (activity_type IS NULL OR activity_type = ANY (ARRAY[
    'Basketball', 'Volleyball', 'Badminton', 'E-sports / Gaming',
    'Practice / Training', 'Meeting / Assembly', 'Community Event',
    'Private Event', 'Other',
    'Ayuda / Distribution', 'Health Activity', 'City / Government Activity'
  ]));

-- ── The booking window, enforced on INSERT ───────────────────────
--
-- BEFORE INSERT and NOT a CHECK constraint, deliberately.
--
-- A CHECK is revalidated on every UPDATE. All 21 reservations that
-- existed when this shipped start before 5 PM with no exception_reason,
-- so a window CHECK -- even one added NOT VALID -- would have failed the
-- moment a Treasurer approved or declined any of them, or a resident
-- cancelled one. Enforcing on insert leaves history untouched and fully
-- updatable, which the verification above proves for all three
-- transitions.
--
-- The cost is that this does not police an UPDATE that moves a booking's
-- time. That path is already narrow: residents may only cancel or mark
-- viewed (protect_reservation_status), and officials who can change a
-- time are trusted and Treasurer-gated by RLS.
--
-- ⚠️ NEW.slot_hour is NOT usable here: PostgreSQL computes generated
-- columns AFTER before-triggers, so it is still NULL at this point. The
-- hour is derived through the shared helper instead. Reading NEW.slot_hour
-- would make every check silently pass.
CREATE OR REPLACE FUNCTION public.enforce_reservation_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour   integer;
  v_end    integer;
  v_reason text;
BEGIN
  -- Direct database connections and the service role are not restricted:
  -- the SQL Editor has to be able to correct data, which is the same
  -- bypass protect_reservation_status uses and for the same reason.
  --
  -- There is deliberately NO is_official() bypass. An official booking
  -- on a walk-in's behalf obeys the rule the walk-in would.
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Whitespace is not an explanation. Normalising here means the two
  -- branches below can test for NULL and nothing else.
  NEW.exception_reason := nullif(btrim(NEW.exception_reason), '');
  v_reason := NEW.exception_reason;

  v_hour := public.reservation_slot_hour(NEW.preferred_time);

  -- preferred_time has no CHECK constraint and never did, so an
  -- unrecognised label used to yield slot_hour = NULL -- which the
  -- overlap guard's partial WHERE excludes. A booking at '9:30 PM' was
  -- accepted and then protected by nothing at all.
  IF v_hour IS NULL THEN
    RAISE EXCEPTION
      'That time is not one the covered court offers. Please choose a time from the list.';
  END IF;

  v_end := v_hour + GREATEST(COALESCE(NEW.duration_hours, 1), 1);

  -- The court closes at 10 PM, for an exception as much as for an
  -- ordinary booking. 5-10 PM is when the facility is available, so a
  -- booking has to finish inside it rather than merely start inside it.
  IF v_end > 22 THEN
    RAISE EXCEPTION
      'A booking has to finish by 10:00 PM. Please choose a shorter duration or an earlier start.';
  END IF;

  IF v_hour >= 17 THEN
    -- Ordinary evening booking. Refusing a reason here keeps the
    -- Official queue honest: a row carrying one IS an exception request,
    -- with nothing else to check.
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION
        'This time is inside the normal 5:00 PM to 10:00 PM window, so it does not need an office-hours reason.';
    END IF;
  ELSE
    -- Office-hours request. The reason is what an official reads when
    -- deciding; without it there is nothing to decide on.
    IF v_reason IS NULL THEN
      RAISE EXCEPTION
        'An office-hours booking needs a reason. Please explain the activity, or choose a time from 5:00 PM onwards.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_reservation_window ON public.reservations;

CREATE TRIGGER trg_enforce_reservation_window
  BEFORE INSERT ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_reservation_window();
