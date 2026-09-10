-- ============================================================
-- Barangay Batinguel E-System
-- 005 — remove the old fee-based model
-- ============================================================
-- Renumbered from 003: migrations 003 and 004 were already taken
-- by the resident row lockdown and the activity_type column, which
-- were applied earlier (2026-09-04 and 09-05). This work was done
-- in parallel and applied afterwards, so it sorts here.
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-08, as two migrations:
--   `remove_legacy_payment_data`
--   `close_legacy_upload_buckets`
-- Both were verified afterwards (see VERIFICATION at the bottom).
--
-- One step could NOT be done in SQL and is still outstanding —
-- see MANUAL STEP at the bottom.
--
-- BACKGROUND
-- The covered court was originally designed around a ₱150/hour
-- fee with GCash payment proof. The barangay later clarified that
-- the court is free and any donation is voluntary, given in person
-- (cash or in kind), and recorded by the Treasurer afterwards.
--
-- Reservation.jsx was updated for this and has been inserting
-- amount/final_amount/discount_* as 0 with payment fields null
-- ever since. The DATABASE was never updated to match, leaving
-- three things behind:
--
--   1. amount and final_amount still DEFAULT 150.00
--   2. 15 rows carrying 150/300/450/600 (= 150 x duration_hours)
--      and 10 rows carrying GCash method/reference/screenshot
--   3. 18 uploaded files in two public = true buckets, readable
--      by anyone with the URL
--
-- No UI renders a peso figure — the Treasurer's "Donation" column
-- reads payment_status only. But for those 10 legacy rows it did
-- render a "pledged" badge, the GCash reference, and a "View
-- Proof" link straight to the public bucket.
-- ============================================================


-- ============================================================
-- MIGRATION 1 — remove_legacy_payment_data
-- ============================================================

-- The reservations themselves are KEPT, not deleted: the Reports
-- tab derives its 6-month trend and busiest-day charts from these
-- rows, and deleting them would empty both charts.
UPDATE reservations
SET payment_method                = NULL,
    payment_reference             = NULL,
    payment_screenshot            = NULL,
    payment_status                = 'unpaid',
    residency_proof               = NULL,
    residency_verification_status = 'not_required',
    amount                        = 0,
    final_amount                  = 0,
    discount_percentage           = 0,
    discount_amount               = 0
WHERE payment_method IS NOT NULL
   OR payment_reference IS NOT NULL
   OR payment_screenshot IS NOT NULL
   OR residency_proof IS NOT NULL
   OR payment_status <> 'unpaid'
   OR amount <> 0
   OR final_amount <> 0
   OR discount_percentage <> 0
   OR discount_amount <> 0;

-- Stop the database inventing a peso figure on future inserts.
-- These defaults are what put 150.00 on rows the form never
-- intended to charge for — any insert that omits the column, or
-- any direct API call, would pick them up again.
ALTER TABLE reservations ALTER COLUMN amount       SET DEFAULT 0;
ALTER TABLE reservations ALTER COLUMN final_amount SET DEFAULT 0;


-- ============================================================
-- MIGRATION 2 — close_legacy_upload_buckets
-- ============================================================

UPDATE storage.buckets
SET public = false
WHERE id IN ('reservation-payments', 'residency-proofs');

-- These granted anonymous callers both READ and WRITE on the two
-- buckets. Nothing in the app touches either one, so the open
-- anon INSERT was purely a way for anyone holding the publishable
-- key (which ships in the JS bundle by design) to fill the
-- project's storage quota.
DROP POLICY IF EXISTS "Public can upload payment screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public can view payment screenshots"   ON storage.objects;
DROP POLICY IF EXISTS "Public can upload residency proofs"    ON storage.objects;
DROP POLICY IF EXISTS "Public can view residency proofs"      ON storage.objects;


-- ============================================================
-- MANUAL STEP — STILL OUTSTANDING
-- ============================================================
-- The 18 files themselves are still in storage. They cannot be
-- removed from SQL: Supabase installs a storage.protect_delete()
-- trigger that raises
--
--   42501: Direct deletion from storage tables is not allowed.
--          Use the Storage API instead.
--
-- because deleting the storage.objects row would leave the actual
-- blob orphaned in the backend rather than actually deleting it.
--
-- Delete them from the Supabase Dashboard -> Storage:
--   reservation-payments/proofs/   15 files (2026-05-13 .. 08-19)
--   residency-proofs/proofs/        3 files (2026-05-13 .. 05-28)
--
-- Making the buckets private already closed the public exposure,
-- so this is now cleanup rather than an open hole.


-- ============================================================
-- VERIFICATION (run after applying)
-- ============================================================
-- Expected: 19, 0, 0, 0, "0, 0", 0, 0 — and files_remaining 0
-- once the manual step above is done.
--
-- select
--   (select count(*) from reservations) as total_reservations,
--   (select count(*) from reservations where amount <> 0 or final_amount <> 0
--       or discount_amount <> 0 or discount_percentage <> 0) as rows_with_money,
--   (select count(*) from reservations where payment_method is not null
--       or payment_reference is not null or payment_screenshot is not null
--       or residency_proof is not null) as rows_with_payment_refs,
--   (select count(*) from reservations where payment_status <> 'unpaid') as rows_not_unpaid,
--   (select string_agg(column_default,', ') from information_schema.columns
--      where table_name='reservations' and column_name in ('amount','final_amount')) as money_defaults,
--   (select count(*) from storage.buckets
--      where id in ('reservation-payments','residency-proofs') and public) as still_public,
--   (select count(*) from storage.objects
--      where bucket_id in ('reservation-payments','residency-proofs')) as files_remaining;


-- ============================================================
-- NOT DONE HERE
-- ============================================================
-- The payment_method / payment_reference / payment_screenshot /
-- discount_percentage / discount_amount / residency_proof /
-- residency_verification_status columns are all now unused and
-- entirely null. They were left in place rather than dropped,
-- because OfficialDashboard.jsx still reads payment_status,
-- payment_reference and payment_screenshot when rendering the
-- Donation column. Dropping the columns without editing that
-- component first would break the reservations table.
--
-- If you want them gone, the frontend change comes first.
