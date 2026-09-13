-- ============================================================
-- Barangay Batinguel E-System
-- 007 — permanent "ineligible" outcome + safe self-editing
--       of profile details
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-13 as migration `ineligible_status_and_profile_edit_guard`.
--
-- Verified by impersonating a resident in SQL (each test inside a
-- transaction that was rolled back):
--   1. verified resident renames themselves  -> allowed, but the row
--      drops to 'pending', verified_at clears, and a note is left
--      for the reviewing official                          PASS
--   2. pending resident sets themselves 'verified'
--      -> "Only an official can verify an account."        PASS
--   3. ineligible account sets itself back to 'pending'
--      -> "This account has been marked ineligible."       PASS
--   4. ineligible account renames itself to slip the block
--      -> same exception, raised by the full_name guard    PASS
--   5. declined resident corrects name/contact/purok and
--      re-enters the queue -> succeeds                     PASS
--
-- Test 2 is worth a note: the first attempt at it passed for the
-- wrong reason. The test account was already 'verified', so
-- `NEW.verification_status IS DISTINCT FROM OLD.verification_status`
-- was false and the trigger never ran. A guard test has to change
-- the value it is guarding, or it proves nothing.
--
-- WHY
-- Two gaps found while walking through what happens after an
-- official declines an account.
--
-- 1. A declined resident could not fix what was wrong.
--    `rejected` tells someone their information is incorrect, but
--    the dashboard never offered a way to edit full_name,
--    contact_number or purok. The only thing they could resubmit
--    was the ID photo -- so a misspelled name stayed misspelled
--    forever and the review loop never closed.
--
-- 2. `rejected` was doing two incompatible jobs. It meant both
--    "your details are wrong, fix them and come back" and "you are
--    not a resident of this barangay". The first should re-open;
--    the second should not. Because a resident may reset their own
--    status to 'pending' (by design, so they can resubmit), someone
--    from another barangay could bounce themselves back into the
--    review queue indefinitely. Not a breach -- they still cannot
--    obtain a document -- but officials had no way to refuse
--    someone permanently.
--
-- There is also a quieter problem underneath both. The trigger
-- guarded `role` and `verification_status` and nothing else, so
-- `full_name` was writable by the account holder at any time. The
-- UI never showed the field, but the API accepted it. That allowed:
-- verify as one person, then rename to another, and request a
-- Barangay Clearance under a name no official ever checked against
-- an ID -- while still reading as `verified`. Hiding an input does
-- not prevent that; only the database can.
--
-- WHAT THIS DOES
-- a. Adds 'ineligible' as a fourth verification_status.
-- b. Residents may still reset themselves to 'pending', EXCEPT
--    from 'ineligible', which only an official can lift.
-- c. If a *verified* resident changes their own full_name, the
--    account drops back to 'pending' automatically. Change your
--    identity, get re-checked.
-- d. Officials editing a resident's name are exempt from (c) --
--    correcting a typo during review should not undo the review.
--
-- NOT DONE HERE
-- Deleting the uploaded ID image when an account is marked
-- ineligible. Supabase's `protect_objects_delete` trigger blocks
-- deletes from storage.objects in SQL, so that removal happens in
-- the official's browser (OfficialDashboard.jsx) before this status
-- is written. Retention matters: RA 10173 keeps personal data only
-- as long as its purpose requires, and once someone is established
-- not to be a resident, holding a photo of their government ID
-- has no purpose left.
-- ============================================================


-- ── a. Allow the new status ──────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_verification_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_verification_status_check
  CHECK (verification_status IN ('pending', 'verified', 'rejected', 'ineligible'));


-- ── b, c, d. Rewrite the guard ───────────────────────────────
-- CREATE OR REPLACE keeps trg_prevent_role_self_change bound to
-- this function, so the trigger itself is not touched.
--
-- `auth.role()` is NULL on a direct database connection (SQL
-- Editor, psql, a migration) and non-NULL on every PostgREST
-- request, so is_api_caller is how this distinguishes "a user did
-- this through the app" from "a developer did this by hand".
CREATE OR REPLACE FUNCTION public.prevent_role_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_api_caller      boolean := auth.role() IS NOT NULL
                                AND auth.role() <> 'service_role';
  caller_is_official boolean := public.is_official(auth.uid());
BEGIN
  -- Nobody promotes themselves to official or nurse.
  IF NEW.role IS DISTINCT FROM OLD.role AND is_api_caller THEN
    RAISE EXCEPTION 'You cannot change your own account role.';
  END IF;

  -- Verification status: officials may set anything. Everyone else
  -- may only put themselves back into the queue -- and not at all
  -- once they have been ruled ineligible.
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND is_api_caller
     AND NOT caller_is_official THEN

    IF NEW.verification_status <> 'pending' THEN
      RAISE EXCEPTION 'Only an official can verify an account.';
    END IF;

    IF OLD.verification_status = 'ineligible' THEN
      RAISE EXCEPTION
        'This account has been marked ineligible. Please visit the Barangay Hall.';
    END IF;
  END IF;

  -- Identity changes. The name on a verified account is a claim an
  -- official checked against an ID; changing it invalidates that
  -- check, so the account returns to the queue rather than keeping
  -- a verification that no longer describes anyone.
  IF NEW.full_name IS DISTINCT FROM OLD.full_name
     AND is_api_caller
     AND NOT caller_is_official THEN

    IF OLD.verification_status = 'ineligible' THEN
      RAISE EXCEPTION
        'This account has been marked ineligible. Please visit the Barangay Hall.';
    END IF;

    IF OLD.verification_status = 'verified' THEN
      NEW.verification_status := 'pending';
      NEW.verified_by        := NULL;
      NEW.verified_at        := NULL;
      NEW.verification_notes :=
        'The name on this account was changed after it was verified. '
        'Please re-check it against the resident''s ID.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
