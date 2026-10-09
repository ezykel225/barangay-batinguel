-- ============================================================
-- Barangay Batinguel E-System
-- 032 — the self-archive guard stops matching names (MASTER-A A4)
-- ============================================================
-- STATUS: see the APPLIED block at the foot of this file.
--
-- ⚠️ THIS IS THE LAST RUNTIME IDENTITY JOIN A3 LEFT BEHIND, AND IT
-- FAILED OPEN. Migration 031 moved every position permission onto
-- `official_account_links` and said so explicitly: the self-archive
-- guard inside `stamp_official_archive()` was left comparing
-- `profiles.full_name` to the row's `full_name`, because making it fail
-- closed needed its own step with its own failure mode. This is that
-- step.
--
-- ─── WHAT THE OLD GUARD DID, AND WHERE IT LET GO ─────────────────────
--
-- `stamp_official_archive()` fires BEFORE UPDATE on
-- `barangay_officials` and does three separate jobs:
--
--   1. on the ARCHIVE transition (OLD.archived_at IS NULL and
--      NEW.archived_at IS NOT NULL) it refused a self-archive, then
--      stamped `archived_at = now()` and `archived_by = auth.uid()`
--      server-side;
--   2. on an UPDATE of an ALREADY-archived row it restored OLD's two
--      stamps, so a client cannot rewrite who archived a record or
--      when;
--   3. on RESTORE (NEW.archived_at IS NULL) it cleared `archived_by`.
--
-- Only job 1 identified the caller, and it did it like this:
--
--     SELECT full_name INTO caller_name FROM profiles WHERE id = auth.uid();
--     IF caller_name IS NOT NULL AND caller_name = NEW.full_name THEN
--       RAISE EXCEPTION 'An official cannot archive their own ...';
--     END IF;
--
-- Two strings. The guard holds only while they are equal, and *the
-- only thing that made them equal was a convention*. CLAUDE.md recorded
-- it as failing open and accepted it, because archiving yourself merely
-- *reduces* your own privileges — a foot-gun rather than an escalation
-- path. That reasoning is still true, and it is not a reason to leave
-- an identity check that a rename silently switches off.
--
-- ─── MEASURED, BEFORE ANYTHING WAS CHANGED ───────────────────────────
--
-- As the real Kagawad (`Harold Katada Baroy`), with his own JWT claims,
-- inside a block that always ends in `RAISE EXCEPTION`:
--
--   names agree  -> self-archive                    P0001  REFUSED
--   names agree  -> archive ANOTHER official        rows=1 allowed
--   ONE-SIDED RENAME of his own directory row in trusted SQL
--                -> self-archive                    rows=1 ACCEPTED
--                   archived_at stamped, archived_by = HIS OWN uid
--
-- So the record was archived, by its own holder, and the audit column
-- said so afterwards — which is the one thing this guard exists to
-- prevent, and it took one `UPDATE` on a column 029 already forbids the
-- *app* from touching. The rename has to come from SQL or
-- `service_role` now; it does not have to come from an attacker. A
-- maintainer correcting a spelling in one table and not the other is
-- the documented, already-observed mistake — it is what cost this
-- project an official's permissions and his portrait on 2026-10-01
-- (migration 027).
--
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- The guard, resolved through the private mapping
-- ─────────────────────────────────────────────────────────────
--
-- ⚠️ IT RESOLVES THE MAPPING DIRECTLY AND DOES NOT CALL
-- `official_id_for_current_user()`, AND THE REASON IS THE WHOLE
-- DESIGN DECISION OF THIS MIGRATION.
--
-- That helper requires the caller's own linked row to be ACTIVE
-- (`archived_at IS NULL`), which is right for every one of its callers:
-- `official_availability` asks "which schedule may you publish", and an
-- archived official has no operational schedule to publish.
--
-- This guard asks a different question — "is this row ME?" — and that
-- is an IDENTITY question, not a visibility one. Routing it through the
-- active-only helper would make an official whose own record is already
-- archived resolve to NULL, and a NULL under this migration's
-- fail-closed rule means REFUSE. That would silently take away a
-- permission the directory grants today: an archived official can still
-- archive somebody else (the UPDATE policy is `profiles.role =
-- 'official'`, which archiving does not change). A4 is not the phase
-- for deciding whether that permission should exist — see the note at
-- the foot of this file — so the guard must not remove it by accident.
--
-- This is 030's own principle applied: a link is an identity fact, not
-- a visibility state. The mapping says WHO you are; `archived_at` says
-- whether your record is in the current directory. The guard needs the
-- first and must not consult the second.
--
-- ⚠️ THE JOIN ON `barangay_officials` IS DELIBERATE AND IS NOT THE
-- ACTIVE FILTER. It requires the linked directory row to EXIST. The
-- foreign key (`official_id REFERENCES barangay_officials(id) ON DELETE
-- RESTRICT`) already guarantees that, so the join can never change the
-- answer today — it is there so the function stays correct on its own
-- terms if that constraint is ever relaxed, and so a reader can see
-- that existence is checked and activeness deliberately is not.
--
-- ⚠️ SECURITY DEFINER IS REQUIRED, NOT STYLISTIC. The function already
-- had it. `official_account_links` is private — `anon` and
-- `authenticated` hold NO privilege on it and it carries ZERO policies
-- (030) — so a trigger running as the caller could not read the mapping
-- at all, and granting the caller SELECT to make it work would publish
-- which auth account belongs to which named person. The trigger reads
-- the mapping and never returns any of it: the only thing that leaves
-- this function is an exception message naming no one.
--
-- ⚠️ NO `full_name` FALLBACK, ANYWHERE. Not as a second chance when the
-- link is missing, not as a tie-break. A fallback is how the old
-- behaviour would come back while the function *looked* link-based.
CREATE OR REPLACE FUNCTION public.stamp_official_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  -- Direct database connections (SQL Editor, psql, a migration) and the
  -- service_role key are the sanctioned maintenance paths. Measured in
  -- this database, not copied: auth.role() is NULL with no JWT,
  -- 'authenticated'/'anon' over the API, 'service_role' for that key.
  -- Byte-for-byte the test `protect_official_record` already uses on
  -- this same table -- two triggers on one table with two trust models
  -- would be a trap.
  is_api_caller boolean := auth.role() IS NOT NULL
                           AND auth.role() <> 'service_role';
  caller_official uuid;
BEGIN
  IF NOT is_api_caller THEN
    RETURN NEW;
  END IF;

  IF NEW.archived_at IS NOT NULL THEN

    IF OLD.archived_at IS NULL THEN
      -- ── the ARCHIVE transition: the only branch that identifies the
      --    caller, and the only one this migration changes ──────────
      SELECT l.official_id
        INTO caller_official
        FROM public.official_account_links l
        JOIN public.barangay_officials bo
          ON bo.id = l.official_id
       WHERE l.profile_id = auth.uid();

      -- ⚠️ FAIL CLOSED. No link, no archiving -- of anybody.
      --
      -- An unlinked account must NOT be read as "definitely not this
      -- row, so go ahead". That is exactly the inference the old string
      -- comparison made, and it is what let a renamed official archive
      -- himself. Absence of identity is not evidence of difference.
      --
      -- By the time this trigger runs the UPDATE policy has already
      -- established `profiles.role = 'official'` (it is the only
      -- permissive UPDATE policy on this table), so reaching here with
      -- no link means precisely "an official whose account is not
      -- linked". If that policy is ever widened, a caller with no link
      -- is still refused, which is the safe direction.
      --
      -- The message says what to do about it, because the remedy is a
      -- row in a table the person cannot see or reach.
      IF caller_official IS NULL THEN
        RAISE EXCEPTION
          'Your account is not linked to a directory record, so it '
          'cannot archive an official. Ask for the account link to be '
          'created in the database before archiving.'
          USING ERRCODE = 'P0001';
      END IF;

      -- ⚠️ COMPARED AGAINST BOTH `OLD.id` AND `NEW.id`. `id` is the
      -- primary key and no trigger pins it, so a crafted API call could
      -- in principle send a different one on the way through; checking
      -- the row as it stands AND as it is being written means neither a
      -- stale nor a rewritten id walks past the guard. They are the
      -- same value on every call the application makes.
      IF caller_official = OLD.id OR caller_official = NEW.id THEN
        RAISE EXCEPTION
          'An official cannot archive their own directory record. '
          'Another authorized official must archive it.'
          USING ERRCODE = 'P0001';
      END IF;

      NEW.archived_at := now();
      NEW.archived_by := auth.uid();
    ELSE
      -- An UPDATE of a row that is ALREADY archived. Not an archive
      -- transition, so no identity question is asked -- and the two
      -- stamps are held at their stored values so a client cannot
      -- rewrite who archived a record, or when. UNCHANGED.
      NEW.archived_at := OLD.archived_at;
      NEW.archived_by := OLD.archived_by;
    END IF;

  ELSE
    -- ⚠️ RESTORE, AND IT MUST NEVER BE READ AS A SELF-ARCHIVE.
    -- `NEW.archived_at IS NULL` is the restore path; the guard above is
    -- inside the archive branch and cannot be reached from here. So an
    -- official may still restore a record -- including their own, if
    -- somebody else archived it -- exactly as before. UNCHANGED.
    NEW.archived_by := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.stamp_official_archive() IS
  'MASTER-A A4. Stamps archived_at/archived_by server-side and refuses a '
  'self-archive, identifying the caller through the private '
  'official_account_links mapping rather than by matching full_name. '
  'Fails CLOSED: an account with no link cannot archive any official. '
  'Deliberately does NOT require the caller''s own linked row to be '
  'active -- that is a visibility question, and this one is identity.';

-- ============================================================
-- ⚠️ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================
--
-- 1. ⚠️ IT DOES NOT DECIDE WHO MAY ARCHIVE OTHER OFFICIALS. The UPDATE
--    policy on `barangay_officials` is still
--    `profiles.role = 'official'`, with no row restriction, so any
--    official may still archive any other official's record. That is a
--    business rule the barangay owns, it has been the directory's
--    behaviour since migration 018, and narrowing it to the Punong
--    Barangay or the Secretary would be inventing a permission model
--    inside a security fix. The guard's job is "not your own record",
--    and that is all it was widened to do properly.
--
-- 2. **It does not touch the other two jobs** of this function, the
--    DELETE policy (archived rows only), the SELECT split, the INSERT
--    policy, or `protect_official_record()`.
--
-- 3. ⚠️ **`protect_official_record()`'s `full_name` branch stays**, so
--    an official's name is still read-only in the Edit form. A4 removes
--    the last place a name decided IDENTITY; the frontend
--    `officialInfo` lookup still resolves an official to their row BY
--    NAME, so a rename would still break what the dashboard renders.
--    **A5** repoints that lookup, then drops the branch, then restores
--    the input. `portraitWillBeLost()` is still kept for it.
--
-- **Trigger order is unchanged and still immaterial here.** Postgres
-- fires same-timing triggers alphabetically, so
-- `trg_protect_official_record` (p) still runs before
-- `trg_stamp_official_archive` (s). They share no column: the first
-- reads `position`/`full_name`/`created_at`/`created_by`, this one
-- writes `archived_at`/`archived_by`. (Contrast migration 011, where
-- the order IS load-bearing.)
--
-- ⚠️ MASTER-A IS NOT COMPLETE. A5 is the frontend identity cutover and
-- the Full Name field.
--
-- ============================================================
-- APPLIED
-- ============================================================
-- Applied: 2026-10-09, through the Supabase connector, as one migration
-- `032_official_archive_identity_hardening`. `CREATE OR REPLACE
-- FUNCTION` needs no DROP, so nothing in the connector's gated set was
-- involved.
--
-- Every probe ran as the real role, with that account's own JWT claims,
-- inside blocks that always end in `RAISE EXCEPTION`, so Postgres undoes
-- every statement. Live state re-read afterwards.
--
-- ⚠️ TEST-HARNESS NOTE, learned in A3 and needed by every block below:
-- `auth.role()` is read from `request.jwt.claims`, NOT from the Postgres
-- role. So inside an impersonation block, `set_config('role','postgres')`
-- alone does NOT restore the trusted-caller path -- the claims must be
-- cleared with `set_config('request.jwt.claims','', true)` as well, or
-- the trusted SQL in the middle of a test is still seen as an API call.
-- The first attempt at the collision block below was refused by 029's
-- own guard for exactly that reason. This is about the TEST HARNESS; the
-- application never sets either.
--
-- ─── 1. THE OLD GUARD, REPRODUCED BEFORE ANY CHANGE ──────────────────
--
-- Caller: the real Kagawad, `Harold Katada Baroy`. His profile name and
-- his directory row's name agreed to begin with.
--
--   control: names agree -> archive his OWN row          P0001 REFUSED
--   control: names agree -> archive ANOTHER official     rows=1 allowed
--   trusted SQL renames HIS OWN directory row only
--           -> archive his OWN row                       rows=1 ACCEPTED
--              archived_at stamped, archived_by = HIS OWN uid
--
-- One `UPDATE` to one column turned the guard off, and the audit column
-- then recorded an official as the archiver of his own record.
--
-- ─── 2. AFTER 032 — THE MATRIX ───────────────────────────────────────
--
--   caller       archive OWN row        archive ANOTHER   archived_by
--   punong       P0001 refused          rows=1            = his uid
--   secretary    P0001 refused          rows=1            = her uid
--   treasurer    P0001 refused          rows=1            = her uid
--   kagawad      P0001 refused          rows=1            = his uid
--   resident     n/a (no row)           rows=0            --
--   nurse        n/a (no row)           rows=0            --
--   anon         n/a (no row)           rows=0            --
--
-- ⚠️ The resident, nurse and `anon` rows are 0 because the UPDATE POLICY
-- filters them out, so this trigger never fires for them. RLS is the
-- control there; the guard is about which official, not whether an
-- official.
--
-- ─── 3. FAIL CLOSED — an UNLINKED `role='official'` account ──────────
--
-- The Kagawad's link was repointed at an unrelated resident profile, so
-- he became a `role='official'` account with no link. Both names, his
-- directory row and the link count (11) were left untouched:
--
--   unlinked -> archive his OWN row      P0001 'Your account is not
--                                              linked to a directory
--                                              record ...'
--   unlinked -> archive ANOTHER row      P0001, the same refusal
--   the resident now HOLDING his link    rows=0  (the UPDATE policy
--                                        still requires role='official')
--
-- An unlinked official can archive NOBODY. Absence of identity is not
-- evidence of difference.
--
-- ─── 4. NAMES NO LONGER DECIDE ANYTHING ──────────────────────────────
--
--   13  his directory row renamed one-sidedly -> self-archive  REFUSED
--       (this is the exact input that made the old guard fail open)
--   12  his PROFILE renamed instead, through the name parts, so
--       `compose_full_name` rebuilt `full_name`:
--         -> self-archive                                      REFUSED
--         -> archive another official                          rows=1
--   11  NAME COLLISION, and read this one in both directions. Another
--       official's active row was given HIS name and his own row
--       renamed away:
--         -> archive the row WEARING his name                  rows=1
--         -> archive HIS OWN row (now named something else)     REFUSED
--
-- ⚠️ Case 11 is the half a fail-open test does not show. Under the old
-- guard the first of those two would have been REFUSED -- a false
-- positive blocking a legitimate archive of somebody else's record,
-- because their row happened to carry the caller's name. Identity now
-- follows the link in both directions: it stops saying yes to the wrong
-- person AND stops saying no to the right one.
--
-- ─── 5. ARCHIVE, RESTORE AND THE LINK ────────────────────────────────
--
--   14  the Secretary archives the Kagawad's row  rows=1,
--         archived_by = HER uid, server-stamped
--       a client then tries to rewrite both stamps on that
--         already-archived row: the UPDATE is permitted by RLS (rows=1)
--         and the trigger HOLDS the stored values -- archived_by still
--         hers, archived_at still 2026, not the 2000-01-01 sent.
--         UNCHANGED behaviour.
--   16  the archived official RESTORES HIS OWN row     rows=1,
--         archived_by cleared to NULL
--       -- restore is not an archive transition, so the self-archive
--          guard cannot reach it, which is the point of §6
--       he also restores ANOTHER archived row          rows=1
--   17  the link row after archive -> restore is BYTE-IDENTICAL,
--       `linked_at` included:
--         1e0d3ac9…|bcaac395…|2026-10-07 16:09:18.024668+00|
--         migration-030 backfill
--       before and after. 11 links throughout.
--
-- ─── 6. A3 NOT WEAKENED ──────────────────────────────────────────────
--
-- The whole A3 matrix re-run, identical to its own record: the Secretary
-- writes `document_requests` (rows=1) and nothing else, the Treasurer
-- `reservations` (rows=1) and nothing else, the Punong Barangay both
-- kapitan tables (1 and 5) and nothing else, the Kagawad nothing,
-- resident/nurse/anon nothing and no sight of the queue;
-- `official_id_for_current_user()` and `can_see_audience()` unchanged on
-- every caller; all three archived powered holders lose every position,
-- the helper, both powered audiences and both writes.
--
-- ─── 7. NAME-BASED IDENTITY REMAINING ────────────────────────────────
--
-- ZERO policies and ZERO views in `public` mention `full_name`, and
-- **ZERO runtime authorization identity joins remain anywhere.** Seven
-- function bodies still mention it, down from eight -- this one dropped
-- off the list:
--
--   protect_official_record()      A — write guard, deferred to A5.
--                                  Refuses an API caller's `full_name`
--                                  CHANGE. It compares NEW to OLD on one
--                                  row and grants nothing to anybody.
--   compose_full_name()            B — rebuilds full_name from the parts
--   prevent_role_self_change()     B — re-opens verification on a
--                                      self-rename
--   handle_new_resident_signup()   B — writes a new resident's name
--   stamp_activity_actor()         B — actor_name from the caller's own
--                                      profile
--   create_court_reservation()     B — stores the booker's name
--   track_court_reservation()      B — masks the name in SQL
--
-- ⚠️ ONE STALE COMMENT IS KNOWINGLY LEFT. `protect_official_record()`'s
-- body still reads `-- Remove in A3 once official_account_links carries
-- identity.` A3 has landed and did not remove it, and nor does A4.
-- Correcting it means a `CREATE OR REPLACE` of an A1/A1b security
-- function for a comment, inside a phase that is not otherwise touching
-- it. **A5 removes the branch and the comment together.**
--
-- ─── 8. LIVE STATE AFTER ALL TESTING ─────────────────────────────────
--
--   links 11 (all 'migration-030 backfill')   directory rows 11
--   active 11   archived 0   official profiles 11
--   rows or profiles named 'A4 %' / 'A4Renamed%': 0 and 0
--   every name restored: the Kagawad's row and profile both read
--     'Harold Katada Baroy'; the SK row reads 'Nicholas Khyle R.
--     Mondoñedo'
--   powered holders unchanged · official_availability 1
--   `activity_log` rows on `official` in the last 2 hours: 0
--     (these probes write none -- the UI handler was never involved)
--
-- Nothing persisted.
--
-- ─── 9. ADVISORS ─────────────────────────────────────────────────────
--
-- ⚠️ **NO NEW FINDING.** `stamp_official_archive` was already
-- SECURITY DEFINER and already on the executable-function advisory, so
-- the count stays at **24** -- A4 adds no function and widens no
-- surface. The three other findings all pre-date this phase:
-- `rls_enabled_no_policy` on `official_account_links` (what a private
-- table looks like, A2), `btree_gist` in `public` (load-bearing for the
-- reservations overlap constraint), and leaked-password protection
-- (Pro-only on this project).
--
-- ─── 10. NO FRONTEND CHANGE ──────────────────────────────────────────
--
-- None was needed and none was made. The dashboard's archive handler
-- sends `archived_at` and reads the result back; it never sent
-- `archived_by`, and the self-archive guard it already renders in the UI
-- is unchanged in meaning. Jest is 36 suites / 852 tests and the
-- production bundle hashes identically to `main`.
--
-- ⚠️ ONE ROUGH EDGE, FOUND BY READING THE CALLER AND LEFT FOR A5 —
-- deliberately, because fixing it is a frontend change A4 does not need.
--
-- `handleArchiveOfficial` matches the trigger's message with
-- `/archive their own/i` to turn it into a readable toast. This
-- migration KEEPS that exact phrase ("An official cannot archive their
-- own directory record."), so that path is unaffected -- verified by
-- reading the regex against the new string.
--
-- The NEW fail-closed message does not match it, so an unlinked official
-- would see the generic `Failed to archive official!` instead of the
-- sentence naming the cause. That state **cannot occur on the live data**
-- -- all 11 officials are linked -- and it only arises if a 12th
-- directory row and account are created without a link, which is exactly
-- the two-row operation 031's header records. The refusal still happens
-- and the real reason is in the error the client received; only the toast
-- is vague. One `else if` fixes it, in the same handler A5 is already
-- going to edit to repoint `isOwnOfficialRecord` off the name.
--
-- ⚠️ AND NOTE WHAT `isOwnOfficialRecord` STILL IS: a frontend comparison
-- of `userProfile.full_name` to `official.full_name`. It is a UI courtesy
-- that produces the clear message before the round trip; the database is
-- now the thing that decides, and it no longer agrees to be fooled by a
-- rename. A5 points that comparison at the stable id too.
