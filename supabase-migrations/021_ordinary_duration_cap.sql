-- ============================================================
-- Barangay Batinguel E-System
-- 021 — the ordinary 4-hour maximum, enforced server-side
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-10-01 via the Supabase connector as migration
-- `ordinary_duration_cap`.
--
-- WHAT THIS CHANGES, AND NOTHING ELSE
-- One new rule inside `enforce_reservation_window()`: an ORDINARY
-- evening booking may not exceed 4 hours. That limit has existed since
-- the booking form was written, and it lived ONLY in the client.
-- Verified before this migration, as `authenticated` over the API:
--
--   5:00 PM, 5 hours, no reason   ->  ACCEPTED
--
-- Which is the whole reason this file exists. The publishable key ships
-- inside the JavaScript bundle by design, so "the form does not offer
-- it" is not a control -- the same argument migration 018 made about
-- hiding archived officials with a React filter.
--
-- ⚠️ THE EXCEPTION CAP IS DELIBERATELY NOT RESTATED HERE.
-- An office-hours exception may run up to 8 hours, and that ceiling is
-- already `reservations_duration_hours_check`
-- (`duration_hours BETWEEN 1 AND 8`), which has been on the table since
-- it was created. Repeating "8" in this function would give one rule
-- two homes that can drift. A 9-hour exception is refused by the CHECK
-- as `23514`; this guard says nothing about it.
--
-- ⚠️ NOT CHANGED BY THIS MIGRATION, all verified below:
--   * the CHECK itself, which stays `BETWEEN 1 AND 8`
--   * the end-by-10:00-PM rule
--   * the required `exception_reason`, and the refusal of a reason on an
--     evening booking
--   * the unknown-time refusal (`'9:30 PM'`, `'12:00 PM'`)
--   * noon-spanning exceptions, which remain allowed and remain
--     protected across their whole continuous range
--   * BEFORE INSERT only, so every historical row stays approvable,
--     declinable and cancellable
--   * every RLS policy, including Treasurer-only approval
--   * `get_reservation_slots` / `get_reservation_slots_range`
--
-- WHY A TRIGGER AND NOT A CHECK, again
-- Same reason as 020. A CHECK is revalidated on every UPDATE, so
-- `duration_hours <= 4 OR exception_reason IS NOT NULL` as a constraint
-- would be re-tested when an official approves a row -- and any
-- pre-existing evening row longer than 4 hours would become
-- un-approvable and un-cancellable. There is no such row today (stored
-- durations run 1..4), but the trigger does not depend on that
-- remaining true.
--
-- ── VERIFIED, each case in a transaction that was rolled back ──
--
-- THE CASES THE BRIEF ASKED FOR, as `authenticated`:
--   ordinary 5 PM 4h, no reason                      ACCEPTED
--   ordinary 5 PM 5h, no reason                      REJECTED P0001
--   ordinary 6 PM 4h, no reason                      ACCEPTED
--   ordinary 7 PM 4h -> ends 11 PM                   REJECTED P0001
--   ordinary 9 PM 1h -> ends 10 PM exactly           ACCEPTED
--   exception 8 AM 8h with a reason                  ACCEPTED
--   exception 8 AM 9h with a reason                  REJECTED 23514
--   exception 11 AM 3h spanning noon, with reason    ACCEPTED
--   exception 1 PM 8h -> ends 9 PM, with reason      ACCEPTED
--   exception 8 AM 2h, no reason                     REJECTED P0001
--   ordinary 5 PM 2h carrying a reason               REJECTED P0001
--   '9:30 PM' 1h                                     REJECTED P0001
--   '12:00 PM' 2h with a reason                      REJECTED P0001
--
-- THE SAME ORDINARY CAP AS `anon` (the publishable-key path):
--   ordinary 5 PM 5h, no reason                      REJECTED P0001 (cap)
--   ordinary 5 PM 8h, no reason                      REJECTED P0001
--     ⚠️ by the 10:00 PM rule, NOT by the cap -- 5 PM + 8 is 1 AM, so
--     the end check fires first. 5 PM / 5h is the case that isolates
--     the cap: it ends at 10:00 PM exactly, so only the cap can refuse
--     it. Worth saying, because a refusal proves nothing until you know
--     which step produced it.
--   ordinary 5 PM 4h, no reason                      ACCEPTED
--   exception 8 AM 8h with a reason                  ACCEPTED
--
-- THE CAP IS NOT REACHABLE BY CALLING IT AN EXCEPTION:
--   5 PM 5h WITH a reason                            REJECTED P0001
--   (refused for carrying a reason at all, so there is no evening path
--   to more than 4 hours in either direction)
--
-- A NOON-SPANNING EXCEPTION IS STILL PROTECTED END TO END:
--   8 AM 8h exception holds [8,16)                   ACCEPTED
--     then 11 AM 1h  (inside, before noon)           REJECTED 23P01
--     then 1 PM  1h  (inside, after noon)            REJECTED 23P01
--     then 3 PM  1h  (inside)                        REJECTED 23P01
--     then 4 PM  1h  (adjacent, outside)             ACCEPTED
--
-- HISTORY STAYS USABLE:
--   legacy 8 AM row -> approved  (as the Treasurer)  1 row
--   legacy 8 AM row -> declined                      1 row
--   legacy 8 AM row -> cancelled                     1 row
--   the approved 10 AM / 3h noon-spanning row, too   1 row each
--
-- UNCHANGED, re-read after applying:
--   reservations_duration_hours_check still 1..8               PASS
--   exclusion constraint definition unchanged                  PASS
--   slot_hour still GENERATED ALWAYS                           PASS
--   6 RLS policies, "Treasurer can update reservations" intact PASS
--   both slot functions' result shapes unchanged, and neither
--     mentions exception_reason                                PASS
--   21 stored rows, 0 with slot_hour NULL, durations 1..4,
--     0 carrying a reason, 0 evening rows at all -- so no existing row
--     could have been made un-approvable even by a CHECK             PASS
--     (⚠️ read AFTER the rollback. The same count taken inside the
--      harness transaction read 23 rows and 1..8, because two of its
--      own synthetic rows were still there. Always ask which step
--      produced the number.)
--
-- get_advisors(security): no new finding. The SECURITY DEFINER RPC lint
-- count is unchanged at 12 -- this replaces a function rather than
-- adding one, and it keeps `SET search_path = public`. The lint names
-- this function as anon-executable; re-confirmed it is not usable that
-- way, a direct call returns `0A000 trigger functions can only be
-- called as triggers`. The pre-existing `btree_gist in public` and the
-- Pro-only leaked-password notices are unrelated and unchanged.
--
-- ROLLBACK — restore 020's body by dropping the one IF block:
--   CREATE OR REPLACE FUNCTION public.enforce_reservation_window() ...
--   ...with the `v_hours > 4` block removed. The rest of the function,
--   the trigger, the CHECK and the exclusion constraint are untouched by
--   this migration, so nothing else has to be put back.
-- ============================================================


-- ── The ordinary maximum becomes a database rule ─────────────────
-- Only the evening branch gains a check. An exception's ceiling stays
-- where it already was: reservations_duration_hours_check.
CREATE OR REPLACE FUNCTION public.enforce_reservation_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour   integer;
  v_hours  integer;
  v_end    integer;
  v_reason text;
BEGIN
  -- Direct database connections and the service role are not restricted:
  -- the SQL Editor has to be able to correct data. There is deliberately
  -- NO is_official() bypass -- an official booking on a walk-in's behalf
  -- obeys the same rule as the walk-in would.
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Whitespace is not an explanation.
  NEW.exception_reason := nullif(btrim(NEW.exception_reason), '');
  v_reason := NEW.exception_reason;

  v_hour := public.reservation_slot_hour(NEW.preferred_time);

  -- An unrecognised label used to yield slot_hour = NULL, which the
  -- overlap guard's partial index excludes -- so a booking at '9:30 PM'
  -- was accepted and then covered by nothing. '12:00 PM' lands here
  -- too: noon is an hour a booking may RUN THROUGH, not one it may
  -- start at, and there is no mapping for it.
  IF v_hour IS NULL THEN
    RAISE EXCEPTION
      'That time is not one the covered court offers. Please choose a time from the list.';
  END IF;

  -- The same coercion the exclusion constraint applies, so the hours
  -- this guard reasons about are exactly the hours the constraint will
  -- hold.
  v_hours := GREATEST(COALESCE(NEW.duration_hours, 1), 1);
  v_end   := v_hour + v_hours;

  -- The court closes at 10 PM, for an exception as much as for an
  -- ordinary booking. 5-10 PM is when the facility is available, so a
  -- booking has to finish inside it rather than merely start inside it.
  IF v_end > 22 THEN
    RAISE EXCEPTION
      'A booking has to finish by 10:00 PM. Please choose a shorter duration or an earlier start.';
  END IF;

  IF v_hour >= 17 THEN
    -- Ordinary evening booking.
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION
        'This time is inside the normal 5:00 PM to 10:00 PM window, so it does not need an office-hours reason.';
    END IF;

    -- MIGRATION 021. Until now this lived only in the booking form, and
    -- a direct API call with the publishable key could file a 5-hour
    -- evening booking. Checked after the reason check above, so the two
    -- together mean there is no evening path to more than 4 hours:
    -- without a reason this refuses it, and with one the reason itself
    -- is refused.
    --
    -- ⚠️ Not applied to the office-hours branch on purpose. An exception
    -- may run longer -- an ayuda activity can take most of the day --
    -- and its ceiling is reservations_duration_hours_check (1..8), which
    -- is the only place that number should live.
    IF v_hours > 4 THEN
      RAISE EXCEPTION
        'An ordinary booking may run for at most 4 hours. Please choose a shorter duration, or ask for an office-hours booking if your activity needs longer.';
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

-- The trigger itself is unchanged and is NOT recreated here: it already
-- points at this function, and CREATE OR REPLACE keeps the binding.
-- Re-creating it would be a no-op at best and a window with no guard at
-- worst.
