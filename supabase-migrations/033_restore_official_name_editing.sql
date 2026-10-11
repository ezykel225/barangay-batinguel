-- ============================================================
-- Barangay Batinguel E-System
-- 033 — an official's name is description again (MASTER-A A5)
-- ============================================================
-- STATUS: see the APPLIED block at the foot of this file.
--
-- ⚠️ THIS REMOVES ONE BRANCH, AND ONLY BECAUSE IT HAS BECOME UNNECESSARY.
--
-- Migration 029 (A1b) made `protect_official_record()` refuse an API
-- caller's change to `barangay_officials.full_name`. Its own comment
-- said why, and said it was temporary:
--
--     -- TEMPORARY: only because the name is still the authorization key.
--     -- Remove in A3 once official_account_links carries identity.
--
-- The reason has gone, in three steps, each proven in its own header:
--
--   031 (A3)  every position permission in the database — the
--             Secretary's and Treasurer's UPDATE policies, both kapitan
--             UPDATE policies, `can_see_audience()` and
--             `official_id_for_current_user()` — resolves through the
--             private `official_account_links` mapping. Measured: a
--             one-sided rename grants nothing and strips nothing.
--   032 (A4)  `stamp_official_archive()`'s self-archive guard stopped
--             comparing names and started following the mapping, and
--             fails closed without a link. It was the last runtime
--             identity join in the DATABASE.
--   A5        the FRONTEND stopped resolving the signed-in official by
--             name. `OfficialDashboard`'s `officialInfo` and the
--             sidebar's drawer label now call
--             `official_id_for_current_user()` and fetch the directory
--             row by PRIMARY KEY, and `isOwnOfficialRecord` compares
--             ids. That was the last one anywhere.
--
-- ⚠️ A5's FRONTEND HALF WAS PROVEN BEFORE THIS FILE WAS WRITTEN, with
-- 029's guard still in place. That order is deliberate: unfreezing the
-- name first and checking afterwards would mean a window in which a
-- rename could break an identity lookup that had not been moved yet.
-- Measured as each role, in an always-aborted block:
--
--   caller      helper            position resolved by that id
--   punong      a3f1156f ✓        Punong Barangay
--   secretary   2f21e1b6 ✓        Barangay Secretary
--   treasurer   5e91a9e4 ✓        Barangay Treasurer
--   kagawad     1e0d3ac9 ✓        Kagawad      (no powered flag)
--   resident    NULL              none
--   nurse       NULL              none
--   anon        NULL              none
--   unlinked secretary  NULL      → officialInfo null, every flag false
--   archived treasurer  NULL      → same
--
-- ============================================================

-- ⚠️ EVERY OTHER PROTECTION IS PRESERVED BYTE FOR BYTE. The only
-- difference from 029's version is that the `full_name` branch is gone
-- and its comment with it:
--
--   * `position` — PERMANENT. It is what the three powered-position
--     permissions read, so it stays SQL/service-role maintenance only.
--     This is not a temporary measure and has no removal phase.
--   * `created_at` / `created_by` — unchanged. Protected on evidence:
--     no update path in the application writes either.
--   * the INSERT branch — unchanged. An API caller still cannot create a
--     directory row naming `Punong Barangay`, `Barangay Secretary` or
--     `Barangay Treasurer`, for ANY name, and the Add form still offers
--     only `Kagawad` and `SK Chairperson`.
--   * the trusted-caller test — unchanged, byte for byte the expression
--     `protect_document_request_status` and `stamp_official_archive`
--     already use on this same table.
--   * `search_path` stays `public`, as 029 set it. A3 and A4 used
--     `search_path = ''` for the functions they wrote; changing it here
--     would be hardening a function this migration is only meant to
--     shorten, and a diff that does two things is harder to review than
--     two diffs that each do one.
--
-- ⚠️ WHAT A NAME IS NOW. `barangay_officials.full_name` is description:
-- what the directory and the public Officials page print. It is no
-- longer authorization data, and `profiles.full_name` and
-- `barangay_officials.full_name` no longer need to be equal for
-- anything. That is the point of the mapping — identity and display name
-- are different facts, and maintaining one must not require touching
-- the other.
--
-- ⚠️ THIS MIGRATION DOES NOT SYNCHRONISE THE TWO NAMES, and must not.
-- Renaming a directory row leaves `profiles.full_name` alone, by design:
-- the account's own name is the resident-or-official's own record, which
-- `compose_full_name` builds from their name parts and which
-- `prevent_role_self_change` watches. Writing one from the other would
-- re-create a coupling between two tables that A1–A5 spent five
-- migrations removing, and it would do it in the one direction nobody
-- asked for. If the barangay ever wants the two kept in step, that is a
-- decision with its own consequences — not something to infer here.
--
-- ⚠️ A RENAME STILL UNLINKS A BUNDLED PORTRAIT. `src/utils/officialPhotos`
-- is keyed on the exact `full_name`, so changing the name leaves the
-- photo matching nothing. That is unchanged by this migration and is NOT
-- a database concern — but it is the one real consequence of handing the
-- field back, so `portraitWillBeLost()` becomes reachable again at A5
-- and warns before the save. It warns; it does not block. Correcting a
-- misspelled name is a legitimate edit and must not be refused over a
-- picture.
CREATE OR REPLACE FUNCTION public.protect_official_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- The same three the partial unique index names, and the same three
  -- the dashboard gates on.
  powered constant text[] :=
    ARRAY['Punong Barangay', 'Barangay Secretary', 'Barangay Treasurer'];
BEGIN
  -- Direct database connections and the service_role key are the
  -- sanctioned maintenance paths.
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

  IF NEW.position IS DISTINCT FROM OLD.position THEN
    RAISE EXCEPTION
      'An official''s position cannot be changed from the app. Positions '
      'decide who may approve document requests and reservations, so they '
      'are maintained directly in the database.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ The `full_name` branch that stood here was removed by migration
  -- 033 (MASTER-A A5). It existed only because the name was the
  -- authorization key; 031, 032 and A5's frontend cutover took it out of
  -- the database and then out of the application, so a name is
  -- description now and the form offers it again. `position` above
  -- stays, permanently -- that one is about permissions, not identity.

  IF NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION
      'The creation details of a directory record cannot be changed.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.protect_official_record() IS
  'MASTER-A A1/A1b, narrowed by A5 (migration 033). Refuses an API '
  'caller''s change to barangay_officials.position, created_at and '
  'created_by, and refuses an API caller''s INSERT naming any of the '
  'three powered positions. full_name is NO LONGER protected: since '
  'migrations 031/032 and A5''s frontend cutover a name decides no '
  'identity anywhere, so it is description and the Edit form offers it.';

-- ============================================================
-- ⚠️ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================
--
-- 1. **It does not widen who may edit the directory.** The UPDATE policy
--    is still `profiles.role = 'official'` with no row restriction, as
--    it has been since 018. Any official may still edit, and archive,
--    any other official's record — a business rule the barangay owns,
--    left alone by A4 and left alone here.
-- 2. **It does not touch `position`.** Not the UPDATE branch, not the
--    INSERT branch, not the partial unique index
--    `barangay_officials_one_active_per_powered_position`, and not the
--    Add form's two-option select.
-- 3. **It does not synchronise `profiles.full_name`**, per the note
--    above.
-- 4. **It does not consolidate the two triggers** that share this
--    function. `trg_protect_official_insert` and
--    `trg_protect_official_record` both call it and it branches on
--    `TG_OP`, because the connector gates `DROP TRIGGER` — recorded in
--    029's header and still true. One line in the SQL Editor; no
--    behaviour change; not this migration's subject.
-- 5. **It is not MASTER-B.** The eight remaining dead `admin` disjuncts,
--    the `TRUNCATE` grants, the SECURITY DEFINER execute surface and
--    `btree_gist` in `public` are all untouched.
