-- ============================================================
-- Barangay Batinguel E-System — close privilege escalation
-- ============================================================
-- STATUS: NOT YET APPLIED. Run this against the live project
-- (mpcyqwasurhtdztzobwg) via the SQL Editor, then change this
-- line to record when it was applied.
--
-- Two holes, both reachable by anyone with the publishable key —
-- which is embedded in the deployed JS bundle and is public by
-- design. The key is not what protects the data; these policies
-- are.
-- ============================================================


-- ============================================================
-- 1. ANYONE COULD MAKE THEMSELVES AN OFFICIAL
-- ============================================================
-- The INSERT policy on profiles only checked that the row's id
-- matched the caller — it never constrained `role`. And
-- trg_prevent_role_self_change is BEFORE UPDATE, so it does not
-- see INSERTs at all.
--
-- Attack: call auth.signUp() directly WITHOUT the
-- role: 'resident' metadata, so handle_new_resident_signup does
-- not fire and no profile row is created. Then insert your own
-- row with role = 'official'. You now pass is_official() and can
-- read every resident's profile, every reservation, and every
-- document request.
--
-- Fix: the only profile a user may create for themselves is a
-- resident one. Officials and nurses are created by an admin
-- through the Supabase dashboard (service_role), which bypasses
-- RLS and is unaffected by this.
DROP POLICY "Users can insert their own profile" ON profiles;

CREATE POLICY "Users can insert their own resident profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id AND role = 'resident');


-- ============================================================
-- 2. RESIDENTS COULD VERIFY THEMSELVES
-- ============================================================
-- "Users can update their own profile" is USING (auth.uid() = id)
-- with no WITH CHECK and no column restriction, so a resident can
-- write any column on their own row — including
-- verification_status = 'verified'. That satisfies the
-- document_requests INSERT policy and skips the official's
-- verification queue entirely.
--
-- The app does legitimately need residents to write this column:
-- ResidentDashboard.handleIdUpload resets a rejected account back
-- to 'pending' when a new ID is uploaded. So rather than removing
-- the write, this extends the existing role guard to allow only
-- that one transition.
CREATE OR REPLACE FUNCTION public.prevent_role_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'You cannot change your own account role.';
  END IF;

  -- A non-official may only ever move their own account back to
  -- 'pending' (re-submitting an ID for review). Promoting yourself
  -- to 'verified', or clearing a 'rejected' flag, stays with the
  -- officials.
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND auth.role() <> 'service_role'
     AND NOT public.is_official(auth.uid())
     AND NEW.verification_status <> 'pending' THEN
    RAISE EXCEPTION 'Only an official can verify an account.';
  END IF;

  RETURN NEW;
END;
$$;

-- The trigger itself already exists (BEFORE UPDATE ON profiles)
-- and picks up the new function body automatically — no need to
-- drop and recreate it.


-- ============================================================
-- NOTES — RELATED, NOT FIXED HERE
-- ============================================================
-- 1. The same "whole-row UPDATE" shape exists on two more tables.
--    "Residents can mark their own reservations viewed" and
--    "Residents can mark their own document requests viewed" both
--    grant UPDATE on every column of the caller's own row; the
--    protect_* triggers only guard status/reviewed_by/
--    reviewer_notes. So a resident can still rewrite their own
--    approved booking's preferred_date/preferred_time, or change
--    an approved request's document_type. Worth locking down to
--    just resident_viewed_at, but it needs a column-level guard
--    per table and is a bigger change than these two.
-- 2. barangay_officials is still empty. Until it is seeded, no
--    one matches the Treasurer/Secretary/Punong Barangay joins,
--    so reservation approvals, document requests and Kapitan
--    status stay inert regardless of this migration.
