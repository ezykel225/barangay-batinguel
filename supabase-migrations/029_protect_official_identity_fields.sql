-- ============================================================
-- Barangay Batinguel E-System
-- 029 — close the multi-step escalation 028 left open
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-10-07 via the Supabase connector as migration
-- `protect_official_identity_fields`.
--
-- ⚠️ STILL A1. The identity work (A2-A5) has NOT been done and
-- `profiles.full_name = barangay_officials.full_name` is STILL what
-- resolves every position-specific permission. This migration exists
-- precisely BECAUSE that is still true -- see WHY THIS IS TEMPORARY.
--
-- ─── WHAT 028 LEFT OPEN (A1b §1, measured 2026-10-07) ────────────────
--
-- 028 stopped an official rewriting `position` on an existing row. It
-- did nothing about `full_name`, and nothing about INSERT. Since
-- authorization is still a NAME match, an official could reach the same
-- place in three steps instead of one.
--
-- Reproduced as Harold Katada Baroy (Kagawad), impersonated with
-- SET LOCAL ROLE authenticated and his own JWT claims, in a block that
-- always ends in RAISE EXCEPTION so nothing commits:
--
--   0. baseline doc UPDATE       rows=0   (correctly refused)
--   1. rename OWN row X -> TEMP  rows=1   ALLOWED
--   2. archive the REAL Secretary rows=1  ALLOWED  (not a self-archive)
--   3. INSERT X as 'Barangay Secretary'
--                                rows=1   ALLOWED
--   4. doc UPDATE as "Secretary" rows=1   ESCALATION COMPLETE
--
-- And the Treasurer chain, identically: rows=1 on `reservations`.
--
-- ⚠️ BOTH UNIQUE INDEXES WERE DOING THEIR JOB -- they are what forced
-- three steps instead of one, and that is worth recording because it
-- would otherwise look like they failed. Measured:
--
--   INSERT a duplicate active name, without step 1
--        -> 23505 barangay_officials_one_active_per_name
--   INSERT a SECOND active Treasurer, without step 2
--        -> 23505 barangay_officials_one_active_per_powered_position
--
-- So each index refuses the shortcut. Neither refuses the sequence,
-- because after step 1 the name is free and after step 2 the position
-- is vacant. An index cannot see intent across three statements; only a
-- rule about who may write these columns can.
--
-- ─── WHAT 029 ADDS ───────────────────────────────────────────────────
--
-- One function, now branching on TG_OP, and a second trigger so the
-- same rule covers INSERT:
--
--   UPDATE, API caller   -- refuse a change to
--                           position      (028)
--                           full_name     (NEW)
--                           created_at / created_by  (028)
--   INSERT, API caller   -- refuse `position` IN the three POWERED
--                           positions     (NEW)
--
-- ⚠️ `IS DISTINCT FROM` throughout, so a form that re-submits the SAME
-- name or position unchanged still saves. Both forms send every field
-- on every save; rejecting an unchanged value would break ordinary
-- edits that have nothing to do with identity.
--
-- ⚠️ INSERT of a NON-powered position is deliberately still allowed.
-- Kagawad and SK Chairperson carry no permissions, and Add Official is
-- how the missing Kagawad of 2026-09-30 was restored -- with no code
-- change, which is the property worth keeping. Only the three positions
-- that decide something are closed.
--
-- ⚠️ A SECOND TRIGGER, not an altered one. Changing
-- `trg_protect_official_record` to BEFORE INSERT OR UPDATE needs
-- DROP TRIGGER, which the Supabase connector treats as destructive and
-- times out on (024's header, re-measured in X5). So
-- `trg_protect_official_insert` is added beside it and both call the
-- same function -- one rule, one place to read it.
--
-- ─── THE TRUSTED-CALLER TEST, UNCHANGED FROM 028 ─────────────────────
--
-- `auth.role() IS NULL OR auth.role() = 'service_role'`, measured in
-- this database rather than copied: NULL for the connector/SQL Editor,
-- 'authenticated'/'anon'/'service_role' over the API. Direct SQL and
-- the service_role key remain able to correct a name AND to appoint a
-- replacement Secretary or Treasurer -- both verified below.
--
-- ─── ⚠️ WHY THIS IS TEMPORARY, AND WHAT UNDOES IT ────────────────────
--
-- Protecting `full_name` is NOT a statement that display names should
-- be un-editable. It is a statement that a display name currently IS an
-- authorization key, which is the actual defect. A2/A3 move
-- authorization to the private `official_account_links` table; once
-- `can_see_audience()`, `official_id_for_current_user()` and the two
-- position policies read that table instead of this column, a name is
-- just a name again.
--
-- AT THAT POINT, DELIBERATELY RESTORE NAME EDITING: remove the
-- `full_name` branch from this function and put the field back in the
-- Edit Official form. The `position` branch and the INSERT branch stay
-- -- those are about permissions, not about identity, and A3 does not
-- change who may appoint a Secretary.
--
-- ⚠️ `portraitWillBeLost()` in the Edit handler becomes unreachable
-- while this holds, because the name it warns about can no longer
-- change. It is deliberately NOT deleted: it is exactly what A3 needs
-- back, and removing it now would mean rewriting it later.
--
-- ─── NOT CHANGED BY THIS MIGRATION ───────────────────────────────────
--
--   * the two position RLS policies, which still join on full_name
--   * can_see_audience(), official_id_for_current_user()
--   * stamp_official_archive() and its FAIL-OPEN self-archive guard
--   * kapitan_status / kapitan_availability, still "any official"
--   * every grant; no REVOKE is issued here
--   * archive and restore, which never touch a protected column
-- ============================================================


-- ── 1. One rule, both timings ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_official_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- ⚠️ The same three the partial unique index names, and the same
  -- three the dashboard gates on. A fourth powered position has to be
  -- added here, to that index, and to the dashboard together.
  powered constant text[] :=
    ARRAY['Punong Barangay', 'Barangay Secretary', 'Barangay Treasurer'];
BEGIN
  -- Direct database connections (SQL Editor, psql, a migration) and the
  -- service_role key are the sanctioned maintenance paths. Measured,
  -- not assumed -- see 028's header.
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.position = ANY (powered) THEN
      RAISE EXCEPTION
        'A directory record for % cannot be created from the app. The '
        'positions that approve document requests and reservations are '
        'assigned directly in the database.', NEW.position
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE from here on.
  IF NEW.position IS DISTINCT FROM OLD.position THEN
    RAISE EXCEPTION
      'An official''s position cannot be changed from the app. Positions '
      'decide who may approve document requests and reservations, so they '
      'are maintained directly in the database.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ TEMPORARY, and only because the name IS the authorization key.
  -- Remove this branch in A3, once official_account_links carries
  -- identity and a rename can no longer move a permission.
  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    RAISE EXCEPTION
      'An official''s name cannot be changed from the app at the moment. '
      'The name is still what links an account to its position, so a '
      'correction is made directly in the database.'
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

-- ── 2. Cover INSERT as well ─────────────────────────────────────────
-- A DO block rather than DROP/CREATE: the connector gates DROP TRIGGER.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.barangay_officials'::regclass
      AND tgname = 'trg_protect_official_insert'
  ) THEN
    CREATE TRIGGER trg_protect_official_insert
      BEFORE INSERT ON public.barangay_officials
      FOR EACH ROW EXECUTE FUNCTION public.protect_official_record();
  END IF;
END $$;


-- ─── VERIFICATION ────────────────────────────────────────────────────
-- Each case run as the named role inside a transaction that was always
-- rolled back. Full results in the MASTER-A A1b report:
--
--   THE CHAIN, re-run end to end:
--     rename own row                                 P0001 REFUSED  <- stops here
--     (and independently) archive the Secretary      rows=1 still allowed
--     (and independently) INSERT X as Secretary      P0001 REFUSED
--     doc UPDATE                                     rows=0
--     reservations UPDATE                            rows=0
--
--   Kagawad -> own full_name                         P0001 REFUSED
--   Kagawad -> another official's full_name          P0001 REFUSED
--   Kagawad -> own/other position                    P0001 REFUSED
--   Kagawad -> INSERT active Punong Barangay         P0001 REFUSED
--   Kagawad -> INSERT active Barangay Secretary      P0001 REFUSED
--   Kagawad -> INSERT active Barangay Treasurer      P0001 REFUSED
--   Kagawad -> INSERT active Kagawad                 rows=1  (still allowed)
--   Kagawad -> INSERT active SK Chairperson          rows=1  (still allowed)
--   Kagawad -> edit committee/contact/display_order  rows=1  (unaffected)
--   Kagawad -> edit re-sending the SAME name+position rows=1 (unaffected)
--   direct SQL -> correct a name                     rows=1
--   direct SQL -> appoint a replacement Secretary    rows=1
--   service_role -> correct a name                   rows=1
--   service_role -> INSERT a powered position        rows=1
--   Secretary -> document_requests UPDATE            rows=1  (unchanged)
--   Treasurer -> reservations UPDATE                 rows=1  (unchanged)
--   official -> archive another / restore            rows=1  (unchanged)
--   official -> archive OWN record                   refused (unchanged)
