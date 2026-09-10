-- ============================================================
-- Barangay Batinguel E-System
-- 006 — drop the fee-model columns from reservations
-- ============================================================
-- Renumbered from 004 — see the note at the top of 005.
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-10 as migration `drop_fee_model_columns`, and verified:
-- reservations now has 19 columns, none of them money-related.
--
-- Follows 005, which had already null-scrubbed these columns and
-- zeroed the amounts. This removes them entirely.
--
-- WHY
-- The covered court is free. Donations are voluntary, handed over
-- in person (cash or in kind), and recorded in the Treasurer's own
-- ledger. After this migration the system has nowhere to store a
-- peso figure, so it cannot represent a charge even by accident.
-- That is the point: "the system cannot charge you" is a stronger
-- claim than "the system is configured not to charge you."
--
-- ORDER MATTERS
-- The frontend had to stop naming these columns FIRST.
-- Reservation.jsx listed them explicitly in its insert payload,
-- and PostgREST returns 400 on an insert naming a column that does
-- not exist. Dropping the columns before the code change would
-- have broken every new booking — the public reservation form
-- would fail on submit for anonymous and logged-in users alike.
--
-- The matching frontend changes are:
--   src/pages/Reservation.jsx            insert payload trimmed
--   src/dashboards/OfficialDashboard.jsx Donation column removed
--   src/dashboards/ResidentDashboard.jsx Donation column removed
-- ============================================================

ALTER TABLE reservations
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS payment_reference,
  DROP COLUMN IF EXISTS payment_screenshot,
  DROP COLUMN IF EXISTS payment_status,
  DROP COLUMN IF EXISTS amount,
  DROP COLUMN IF EXISTS final_amount,
  DROP COLUMN IF EXISTS discount_percentage,
  DROP COLUMN IF EXISTS discount_amount,
  DROP COLUMN IF EXISTS residency_proof,
  DROP COLUMN IF EXISTS residency_verification_status;

-- NOT dropped: residency_status. That is the resident /
-- non-resident answer on the booking form and is still in use.
-- Do not confuse it with residency_verification_status, which was
-- part of the abandoned proof-of-residency upload flow.

-- ============================================================
-- VERIFICATION (run after applying)
-- ============================================================
-- Expected: 19 columns, and none of the dropped names present.
--
-- select string_agg(column_name, ', ' order by ordinal_position)
--        as remaining_columns, count(*) as n
-- from information_schema.columns
-- where table_schema='public' and table_name='reservations';
--
-- Also confirm the availability calendar still resolves, since it
-- reads this table through a SECURITY DEFINER function:
--
-- select count(*) from get_reservation_slots_range(
--          current_date, current_date + 30);
