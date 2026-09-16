-- ============================================================
-- Barangay Batinguel E-System
-- 014 — lunch break on the clinic schedule
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-16 as migration `clinic_lunch_break`. All five weekday rows
-- now carry 12:00 PM - 1:00 PM, and 'on-break' is accepted by the
-- status constraint.
--
-- The time parser added alongside it is covered by 15 cases, the
-- important ones being the stored format that caused the bug
-- ("8:00 AM" -> "8:00 AM", not "8:00 AM AM"), plain 24-hour input in
-- case a nurse types it that way, and junk returning unchanged rather
-- than inventing a time.
--
-- WHY
-- The clinic closes for lunch, and the page did not say so. It read
-- "8:00 AM - 5:00 PM", so a resident arriving at half past twelve
-- found a closed counter and a schedule that had told them otherwise.
--
-- The covered court already carries this lesson: 11:00 AM and 1:00 PM
-- are adjacent in the slot list and two hours apart on the clock, and
-- ignoring that silently double-booked the lunch hour. Same building,
-- same closed hour, same fix -- write the gap down rather than
-- implying continuous hours.
--
-- TWO WAYS OF BEING ON BREAK, DELIBERATELY
--
-- break_start / break_end are the SCHEDULED break. The page compares
-- them against the current Manila time and shows "on lunch break"
-- by itself. Nobody has to remember to flip anything, which matters
-- because the one thing that will never happen reliably at 12:00 on a
-- busy day is a nurse opening a dashboard to press a button.
--
-- 'on-break' as a status is the UNSCHEDULED break -- stepped out, an
-- emergency, an early lunch. The nurse sets it and clears it.
--
-- Automatic handles the predictable case; manual handles the rest.
-- Either alone would be wrong: only-manual goes stale the first busy
-- day, only-automatic cannot say anything about an unplanned absence.
--
-- TIMES ARE TEXT HERE
-- time_start and time_end are text holding display strings like
-- "8:00 AM", not `time` values, and break_start/break_end match them
-- rather than introducing a second convention in the same table.
--
-- That existing choice is also behind the "8:00 AM AM - 5:00 PM AM"
-- on the live page: formatTime() assumed 24-hour "HH:MM", split
-- "8:00 AM" on the colon, took "00 AM" as the minutes and appended
-- its own suffix on top. Fixed in HealthCenter.jsx in the same change
-- as this migration.
-- ============================================================


ALTER TABLE public.nurse_availability
  ADD COLUMN IF NOT EXISTS break_start text,
  ADD COLUMN IF NOT EXISTS break_end   text;

-- 'on-break' joins the existing statuses.
ALTER TABLE public.nurse_availability
  DROP CONSTRAINT IF EXISTS nurse_availability_status_check;

ALTER TABLE public.nurse_availability
  ADD CONSTRAINT nurse_availability_status_check
  CHECK (status IN ('available', 'on-break', 'on-leave', 'unavailable'));


-- The barangay's stated hours: 8-12, one hour for lunch, 1-5.
UPDATE public.nurse_availability
SET break_start = '12:00 PM',
    break_end   = '1:00 PM'
WHERE break_start IS NULL;
