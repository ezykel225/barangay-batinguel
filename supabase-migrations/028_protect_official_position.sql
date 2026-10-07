-- ============================================================
-- Barangay Batinguel E-System
-- 028 — close the position write path on barangay_officials
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-10-07 via the Supabase connector as migration
-- `protect_official_position`.
--
-- ⚠️ THIS CLOSES A PROVEN PRIVILEGE ESCALATION. It is the A1 half of
-- MASTER-A; the identity work (A2-A5) has NOT been done and the
-- `profiles.full_name = barangay_officials.full_name` join is still
-- what resolves every position-specific permission. That is deliberate
-- and temporary -- see THE PART THIS DOES NOT FIX at the bottom.
--
-- ─── WHAT WAS WRONG (A0, measured 2026-10-07) ─────────────────────────
--
-- `barangay_officials` carries Supabase's default table-wide
-- `GRANT ALL` for `authenticated` -- all 12 columns, no column-level
-- grant anywhere -- and its UPDATE policy is:
--
--   "Officials can update directory"
--     USING      (EXISTS … profiles.id = auth.uid() AND role = 'official')
--     WITH CHECK (same)
--
-- No row restriction, no column restriction. The only trigger on the
-- table, `trg_stamp_official_archive`, governs `archived_at` and
-- `archived_by` and inspects nothing else. `position` has no CHECK
-- constraint and no unique index.
--
-- So ANY official could rewrite ANY row's `position`. Reproduced as
-- Harold Katada Baroy (Kagawad) inside a transaction that was always
-- rolled back, impersonating him with SET LOCAL ROLE authenticated and
-- his own JWT claims:
--
--   STEP 1 baseline  : document_requests UPDATE  rows=0   (correctly refused)
--   STEP 2 escalate  : SET position = 'Barangay Secretary' on his OWN row
--                                                rows=1   ACCEPTED
--   STEP 3 exercise  : document_requests UPDATE  rows=1   status -> 'approved'
--
-- And the reservation half:
--
--   STEP 1 baseline  : reservations UPDATE       rows=0   (correctly refused)
--   STEP 2 escalate  : SET position = 'Barangay Treasurer'
--                                                rows=1   ACCEPTED
--   STEP 3 exercise  : reservations UPDATE       rows=1   TREASURER POWER
--   STEP 4 demote    : demote the REAL Secretary to Kagawad
--                                                rows=1   ACCEPTED
--
-- ⚠️ It was reachable through the shipped UI, not only by a crafted
-- API call. The Officials Directory ⋮ menu offers **Edit** on every
-- row INCLUDING the official's own (only `Archive` is withheld there),
-- and the Edit modal sends `position` as a client value. Four clicks.
--
-- ⚠️ `barangay_officials_one_active_per_name` did not help: it indexes
-- `full_name`, not `position`, so a SECOND active Barangay Secretary
-- was permitted and the incumbent was not displaced. Nothing looked
-- wrong in the directory.
--
-- The move IS recorded -- `logActivity({action:'edited'})` fires and
-- migration 015 stamps the actor truthfully -- but only in a log that
-- every official can read, including the one who did it.
--
-- ─── THE TRUSTED-CALLER TEST, VERIFIED RATHER THAN COPIED ─────────────
--
-- Measured in this database before choosing the expression:
--
--   connector / SQL Editor (no JWT)  auth.role() = NULL
--   API, signed in                   auth.role() = 'authenticated'
--   API, anonymous                   auth.role() = 'anon'
--   API, service_role key            auth.role() = 'service_role'
--
-- So the guard trusts `auth.role() IS NULL OR auth.role() = 'service_role'`
-- -- byte-for-byte the test `protect_document_request_status` already
-- uses, and the same set `stamp_official_archive` already treats as
-- "not an API caller" ON THIS SAME TABLE. Two triggers on one table
-- with two different trust models would be a trap; there is now one.
--
-- ⚠️ service_role is trusted ON PURPOSE. CLAUDE.md records that
-- official and nurse accounts are created "manually by devs
-- (service_role)", so position maintenance has to remain possible
-- through the same path that creates the account it belongs to.
--
-- ─── TRIGGER ORDER ───────────────────────────────────────────────────
--
-- Postgres fires same-timing triggers in ALPHABETICAL order, so
-- `trg_protect_official_record` runs BEFORE `trg_stamp_official_archive`
-- ('p' < 's'). That is immaterial here and is stated so nobody has to
-- work it out again: this guard reads only `position`, `created_at` and
-- `created_by`, and the stamp trigger writes only `archived_at` and
-- `archived_by`. The two share no column, so neither order changes any
-- outcome. (Contrast migration 011, where the order IS load-bearing.)
--
-- ─── WHAT IS PROTECTED, AND WHAT IS DELIBERATELY NOT ──────────────────
--
-- Rejected for an API caller when the value actually CHANGES:
--   * position     -- the escalation above
--   * created_at   -- provenance
--   * created_by   -- provenance
--
-- ⚠️ `IS DISTINCT FROM`, so a form that re-submits the SAME position
-- unchanged still saves. The Edit modal sends every field on every
-- save; rejecting an unchanged value would break ordinary edits that
-- have nothing to do with position.
--
-- Verified that NO update path in the application writes `created_at`
-- or `created_by`: the Edit modal sends full_name, position, committee,
-- contact_number, display_order, updated_by; archive sends archived_at;
-- restore sends archived_at + display_order; the photo upload sends
-- photo_url. `created_by` is written on INSERT only, which a BEFORE
-- UPDATE trigger never sees.
--
-- STILL FREELY EDITABLE by any official, unchanged:
--   full_name, committee, contact_number, display_order, photo_url,
--   updated_by, and archive/restore through archived_at (which keeps
--   its own existing protection).
--
-- ─── THE PART THIS DOES NOT FIX ──────────────────────────────────────
--
-- ⚠️ Authorization STILL resolves through the `full_name` string join.
-- Renaming an official in one table and not the other still silently
-- removes their position powers. That is MASTER-A's A2-A5 and the
-- approved design is a PRIVATE MAPPING TABLE, `official_account_links`
-- -- NOT a `profile_id` column on this table, because this table is
-- read by `anon` with `select('*')` on the public Officials page and a
-- column here would publish the auth identifier of every official.
--
-- Concretely, A2-A5 still have to convert every reader of that join:
-- the `Secretary can update document requests` and `Treasurer can
-- update reservations` policies, `can_see_audience()` (the secretary
-- and treasurer notification audiences), `official_id_for_current_user()`
-- (which feeds all four `official_availability` policies), and the
-- dashboard's own `officialInfo` lookup. NONE of them is touched here.
--
-- ⚠️ The self-archive guard in `stamp_official_archive` still compares
-- `profiles.full_name` to `NEW.full_name` and still FAILS OPEN on a
-- mismatch. Untouched here on purpose: making it fail closed requires
-- the link table to exist first, or every official loses the ability
-- to archive anybody.
--
-- ⚠️ `kapitan_status` and `kapitan_availability` UPDATE are still
-- "any official" at the database, gated only by `isKapitan` in React.
-- Also A2-A5. This migration makes that gap smaller but not closed:
-- an official can no longer PROMOTE themselves to Punong Barangay,
-- but any official can still write those two tables directly.
-- ============================================================


-- ── 1. The guard ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_official_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Direct database connections (SQL Editor, psql, a migration) and the
  -- service_role key are the sanctioned maintenance paths. Both are
  -- measured above; neither is reachable from a browser.
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.position IS DISTINCT FROM OLD.position THEN
    RAISE EXCEPTION
      'An official''s position cannot be changed from the app. Positions '
      'decide who may approve document requests and reservations, so they '
      'are maintained directly in the database.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION
      'The creation details of a directory record cannot be changed.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 2. Wire it ──────────────────────────────────────────────────────
-- A DO block rather than `DROP TRIGGER IF EXISTS`: the Supabase
-- connector treats DROP TRIGGER as destructive and times out waiting
-- for a confirmation that never arrives (recorded in 024's header and
-- re-measured in X5). This form is idempotent without a DROP.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.barangay_officials'::regclass
      AND tgname = 'trg_protect_official_record'
  ) THEN
    CREATE TRIGGER trg_protect_official_record
      BEFORE UPDATE ON public.barangay_officials
      FOR EACH ROW EXECUTE FUNCTION public.protect_official_record();
  END IF;
END $$;

-- ── 3. One active holder per powered position ───────────────────────
-- Precondition re-verified immediately before creating this, against
-- the live table: Punong Barangay = 1 (Hon. Frankie Credo), Barangay
-- Secretary = 1 (Alexis Theress P. Tan), Barangay Treasurer = 1
-- (Adelina Fabillar Remata).
--
-- ⚠️ ONLY the three positions that carry permissions. Kagawad is a
-- seven-seat office and SK Chairperson is outside this model; neither
-- is constrained.
--
-- ⚠️ ONLY active rows. An archived historical holder does not
-- participate, so archiving a Secretary and appointing a successor
-- still works, and so does restoring a row into a vacant position.
--
-- This is defence in depth, not the control -- the trigger above is.
-- It exists so that if the guard is ever removed or bypassed, a second
-- active Secretary fails loudly with 23505 instead of silently holding
-- the same powers as the real one.
CREATE UNIQUE INDEX IF NOT EXISTS barangay_officials_one_active_per_powered_position
  ON public.barangay_officials (position)
  WHERE archived_at IS NULL
    AND position IN ('Punong Barangay', 'Barangay Secretary', 'Barangay Treasurer');


-- ─── VERIFICATION ────────────────────────────────────────────────────
-- Every case below was run after applying, as the named role, inside a
-- transaction that was always rolled back. Results recorded in the
-- MASTER-A A1 report and summarised here:
--
--   Kagawad -> own position = 'Barangay Secretary'     P0001 REFUSED
--   Kagawad -> another official's position             P0001 REFUSED
--   Kagawad -> document_requests UPDATE                rows=0
--   Kagawad -> reservations UPDATE                     rows=0
--   Kagawad -> edit own full_name/committee/contact    rows=1  (unaffected)
--   Kagawad -> re-submit the SAME position unchanged   rows=1  (unaffected)
--   Secretary -> document_requests UPDATE              rows=1  (unchanged)
--   Treasurer -> reservations UPDATE                   rows=1  (unchanged)
--   official -> archive another official               rows=1  (unchanged)
--   official -> restore                                rows=1  (unchanged)
--   official -> archive OWN record                     refused (unchanged)
--   direct SQL -> change a position                    rows=1  (maintenance works)
--   insert a 2nd active Barangay Secretary             23505   REFUSED
--   archived row sharing a powered position            allowed (no conflict)
