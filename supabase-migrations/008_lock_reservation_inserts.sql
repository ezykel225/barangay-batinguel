-- ============================================================
-- Barangay Batinguel E-System
-- 008 — stop anyone from inserting a pre-approved reservation
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-13 as migration `lock_reservation_inserts`.
--
-- Verified, each case in a transaction that was rolled back:
--   anon, status='approved'              -> refused          PASS
--   anon, status='pending'               -> succeeds         PASS
--   resident, resident_id = someone else -> refused          PASS
--   resident, resident_id = own          -> succeeds         PASS
-- The two positive controls matter as much as the two attacks: a
-- policy that refuses everything would pass the attack tests and
-- break every real booking on the site.
--
-- WHY
-- Both INSERT policies on `reservations` were `WITH CHECK (true)`:
--
--   "Allow public insert reservations"        anon          true
--   "Allow authenticated insert reservations" authenticated true
--
-- `true` places no constraint on the row being inserted, so every
-- column was attacker-controlled. Confirmed against the live
-- database by inserting as `anon` -- no account, just the
-- publishable key that ships in the JavaScript bundle:
--
--   INSERT INTO reservations (..., status) VALUES (..., 'approved');
--   -- succeeded
--
-- That is a booking that is already approved, with no Treasurer
-- involved. The court is free, so nothing is stolen, but the
-- Treasurer's approval is the barangay's control over who uses the
-- covered court and when -- and it could be skipped entirely.
-- `resident_id` was equally unconstrained, so a booking could also
-- be planted on another resident's account, and `reviewed_by` could
-- name an official who never saw it.
--
-- Public booking itself is deliberate and stays: a resident without
-- an account can reserve the court, the same as walking into the
-- Barangay Hall. What changes is that a caller may now only create
-- the kind of row the form creates.
--
-- NOTE ON TESTING
-- The first attempt to demonstrate this reported the insert as
-- BLOCKED, which was wrong. The test used `INSERT ... RETURNING`,
-- and RETURNING needs a SELECT policy to pass as well -- anon has
-- none here, so the statement failed while reading the row back,
-- not while writing it. The rejection looked identical. Re-running
-- without RETURNING showed the insert succeeding. A negative result
-- is only trustworthy once you know which step produced it.
-- ============================================================


DROP POLICY IF EXISTS "Allow public insert reservations"        ON public.reservations;
DROP POLICY IF EXISTS "Allow authenticated insert reservations" ON public.reservations;

-- Anonymous visitors: a walk-in booking. It must arrive pending,
-- unreviewed, and unattached to any account -- an anonymous caller
-- has no account to attach it to.
CREATE POLICY "Anyone can request a reservation"
  ON public.reservations FOR INSERT TO anon
  WITH CHECK (
    status = 'pending'
    AND resident_id IS NULL
    AND reviewed_by IS NULL
  );

-- Signed-in residents: same rules, except the booking may be
-- attached to their own account -- and only their own, so a booking
-- cannot be planted on someone else.
CREATE POLICY "Signed-in users can request a reservation"
  ON public.reservations FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND reviewed_by IS NULL
    AND (resident_id IS NULL OR resident_id = auth.uid())
  );
