-- ============================================================
-- Barangay Batinguel E-System
-- 010 — stop two bookings holding the same court hours
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-15 as migration `prevent_overlapping_bookings`.
--
-- Verified against live data, each case in a transaction that was
-- rolled back:
--   built cleanly over all 21 existing rows            PASS
--   9 AM 1h refused against an existing 8 AM 2h
--     ([9,10) conflicts with [8,10))                   PASS
--   adjacent booking 10 AM after 8 AM 2h accepted      PASS
--   same slot on a different date accepted             PASS
--   11 AM and 1 PM both accepted (lunch gap)           PASS
--   hour rebooked after its holder cancelled           PASS
--
-- The four positive cases matter as much as the refusal: a constraint
-- that rejected everything would pass the overlap test and break every
-- booking on the site.
--
-- WHY
-- Reservation.jsx re-checks for conflicts immediately before it
-- inserts, and says so in its own comment: this "narrows (but does not
-- eliminate) the race window where two people could submit for the
-- same slot at nearly the same time -- a database-level uniqueness
-- constraint is the only way to fully prevent that."
--
-- There was no such constraint. Two people submitting within the same
-- second both passed the re-check and both got a booking, and nobody
-- found out until two groups turned up at the court.
--
-- WHY NOT A UNIQUE INDEX
-- The obvious fix -- unique on (preferred_date, preferred_time) --
-- only catches identical start times. Bookings have a duration, so an
-- 8:00 AM booking for 2 hours and a 9:00 AM booking for 1 hour collide
-- while having different start times. A unique index would let that
-- through and look like it had done its job.
--
-- What is actually needed is an overlap test, which is what an
-- exclusion constraint does: same date, and hour ranges that intersect.
--
-- HOW THE HOURS ARE DERIVED
-- preferred_time is stored as the display label ('8:00 AM', '1:00 PM'),
-- not a time value, so slot_hour translates it with the same mapping
-- the front end uses in SLOT_HOURS. It is a generated column, so it
-- cannot drift from preferred_time and cannot be set by a caller.
--
-- If the two ever disagree the constraint silently stops covering the
-- affected rows, because an unrecognised label yields NULL and NULL is
-- excluded by the WHERE clause. Adding a slot to the front end means
-- adding it here.
--
-- THE LUNCH GAP
-- 11:00 AM and 1:00 PM are adjacent in the slot list but two hours
-- apart on the clock, and the court is closed between them. The ranges
-- handle this without special cases: 11:00-12:00 is [11,12) and
-- 1:00-2:00 is [13,14), which do not intersect, so both are allowed.
-- getCoveredSlots() already refuses to let a booking span the gap, so
-- no range can straddle it either.
--
-- ONLY ACTIVE BOOKINGS HOLD A SLOT
-- The constraint applies to 'pending' and 'approved' only. A declined
-- or cancelled booking releases its hours immediately, which is the
-- behaviour the dashboard and the availability calendar already
-- assume.
-- ============================================================


-- Needed so a GIST index can hold `preferred_date WITH =` alongside a
-- range. Postgres ships it; it just is not enabled by default.
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- Mirrors SLOT_HOURS in src/pages/Reservation.jsx.
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS slot_hour integer GENERATED ALWAYS AS (
    CASE preferred_time
      WHEN '8:00 AM'  THEN 8
      WHEN '9:00 AM'  THEN 9
      WHEN '10:00 AM' THEN 10
      WHEN '11:00 AM' THEN 11
      WHEN '1:00 PM'  THEN 13
      WHEN '2:00 PM'  THEN 14
      WHEN '3:00 PM'  THEN 15
      WHEN '4:00 PM'  THEN 16
      WHEN '5:00 PM'  THEN 17
    END
  ) STORED;


-- greatest(coalesce(...), 1) guards the range builder: int4range errors
-- outright if its lower bound exceeds its upper, so a null or zero
-- duration would fail the insert with something unreadable instead of
-- the clear conflict message this constraint produces.
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_no_overlapping_slots
  EXCLUDE USING gist (
    preferred_date WITH =,
    int4range(slot_hour, slot_hour + greatest(coalesce(duration_hours, 1), 1)) WITH &&
  )
  WHERE (status IN ('pending', 'approved') AND slot_hour IS NOT NULL);
