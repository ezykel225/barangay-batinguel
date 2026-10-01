-- ============================================================
-- Barangay Batinguel E-System
-- 023 — protect_reservation_status must ignore a GENERATED column
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-10-01 via the Supabase connector as migration
-- `fix_reservation_allowlist_generated_column`.
--
-- ⚠️ THIS FIXES A REGRESSION INTRODUCED BY MIGRATION 020, found while
-- verifying 022. It has nothing to do with notifications; it was caught
-- because a notification probe tried to cancel a booking as a resident
-- and the cancellation was refused.
--
-- ─── WHAT WAS BROKEN ──────────────────────────────────────────────────
-- Migration 020 added `slot_hour` as a GENERATED ALWAYS column.
-- Generated values are computed AFTER before-triggers run -- which
-- CLAUDE.md already records for the INSERT case, as the reason
-- enforce_reservation_window() calls reservation_slot_hour() instead of
-- reading NEW.slot_hour.
--
-- The same fact breaks protect_reservation_status (BEFORE UPDATE), and
-- that was missed. Its allowlist compares
--   to_jsonb(NEW) - <allowed>   against   to_jsonb(OLD) - <allowed>
-- and inside a before-trigger NEW.slot_hour is NULL while OLD.slot_hour
-- holds the stored value. So EVERY resident UPDATE looked like it had
-- changed a column it was not allowed to change.
--
-- Measured directly, by attaching a probe trigger that printed the
-- differing keys:
--
--   status=cancelled/was:pending  slot_hour=NULL/was:17
--
-- Measured as `authenticated`, BEFORE this migration:
--
--   resident cancels own pending booking
--     -> P0001 "You can only cancel this reservation, not change its
--        details."
--   resident writes resident_viewed_at
--     -> P0001 "Only an official can change a reservation."
--
-- Both are documented resident rights. The second one is the quieter
-- half: resident_viewed_at is what clears the unseen-status-change
-- badge, so the badge could never be cleared either.
--
-- This affected every booking whose preferred_time maps to an hour --
-- which, since 020 constrained preferred_time, is all of them.
--
-- `protect_document_request_status` is UNAFFECTED: document_requests has
-- no generated column. Checked across the whole schema --
-- reservations.slot_hour is the ONLY generated column in it, so this is
-- the only trigger with the problem.
--
-- ─── ⚠️ WHY SUBTRACTING slot_hour CANNOT OPEN A HOLE ──────────────────
-- The allowlist's whole point (015 onward) is that it names the
-- PERMITTED columns, so anything unlisted is refused and a column added
-- later is protected by default. Subtracting slot_hour looks like a
-- denylist entry, and is not one:
--
--   * slot_hour is GENERATED ALWAYS, so Postgres itself refuses any
--     client attempt to write it -- error 428C9, raised before this
--     trigger is reached. Verified below.
--   * its value is a pure function of preferred_time, which the
--     allowlist still protects. A resident cannot change the hour
--     without changing preferred_time, and changing preferred_time is
--     still refused.
--
-- Excluding a column that nobody can write, and that is derived from one
-- still guarded, leaves the allowlist's guarantee intact.
--
-- ⚠️ ANY FUTURE GENERATED COLUMN ON A TABLE WITH A protect_* TRIGGER
-- NEEDS THE SAME TREATMENT, and will present exactly like this: a
-- documented user action refused with the trigger's own message, for
-- every row, with nothing in the diff to explain it.
-- ============================================================

create or replace function public.protect_reservation_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
BEGIN
  -- UNCHANGED: officials approve and decline; the service role runs
  -- migrations and admin tasks. Neither is restricted here.
  IF auth.role() IS NULL
     OR auth.role() = 'service_role'
     OR public.is_official(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- UNCHANGED: a resident may release their own booking -- pending or
  -- already approved -- so an unused slot goes back on the calendar
  -- instead of being blocked by a no-show. Only the status may move, and
  -- only for a date that hasn't passed yet (Asia/Manila).
  IF OLD.resident_id = auth.uid()
     AND OLD.status IN ('pending', 'approved')
     AND NEW.status = 'cancelled'
     AND OLD.preferred_date >= (now() AT TIME ZONE 'Asia/Manila')::date
  THEN
    -- CHANGED: '- slot_hour'. See the header.
    IF (to_jsonb(NEW) - 'status' - 'updated_at' - 'resident_viewed_at' - 'slot_hour')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'updated_at' - 'resident_viewed_at' - 'slot_hour')
    THEN
      RAISE EXCEPTION 'You can only cancel this reservation, not change its details.';
    END IF;
    RETURN NEW;
  END IF;

  -- UNCHANGED: otherwise the only thing a resident may write is the
  -- timestamp recording that they have seen the decision.
  -- CHANGED: '- slot_hour'.
  IF (to_jsonb(NEW) - 'resident_viewed_at' - 'slot_hour')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'resident_viewed_at' - 'slot_hour')
  THEN
    RAISE EXCEPTION 'Only an official can change a reservation.';
  END IF;

  RETURN NEW;
END;
$fn$;

-- ============================================================
-- VERIFICATION — run 2026-10-01 as `authenticated`, inside a
-- transaction that was rolled back, against synthetic accounts and
-- synthetic bookings only.
-- ============================================================
--
-- NOW WORKS (was refused before this migration)
--   [x] resident cancels their own PENDING booking      -> allowed
--   [x] resident cancels their own APPROVED booking     -> allowed
--   [x] resident writes resident_viewed_at              -> allowed
--
-- STILL REFUSED (the allowlist is intact)
--   [x] resident sets their own booking to 'approved'   -> P0001
--   [x] cancel AND edit `purpose` in one UPDATE         -> P0001
--   [x] cancel AND change `duration_hours` in one UPDATE-> P0001
--   [x] cancel SOMEBODY ELSE'S booking   -> zero rows (RLS filtered; the
--         trigger is never reached, which is the layer that should stop
--         it)
--   [x] cancel their own booking for a PAST date        -> P0001
--   [x] write slot_hour directly                        -> 428C9, raised
--         by Postgres before the trigger runs. This is the proof that
--         subtracting it is not a denylist entry.
--
-- ⚠️ Both directions, deliberately. A fix that only shows the previously
-- broken case now passing would not establish that the guard still
-- guards anything.
-- ============================================================
