-- ============================================================
-- Barangay Batinguel E-System
-- 018 — officials archive (replace destructive delete)
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-30 as migration `officials_archive`, via the Supabase
-- connector. Verification results are recorded at the foot of this file.
--
-- PRE-CHECKS taken from the live database immediately before applying
-- (2026-09-30):
--   barangay_officials rows ......................... 11
--   duplicate full_name values ...................... 0   (§2 index is creatable)
--   duplicate display_order values .................. 0
--   NULL display_order values ....................... 0
--   display_order range ............................. 1-11 (contiguous)
--   official accounts in profiles ................... 11
--   accounts with no directory row .................. 0
--   directory rows with no account .................. 0
--   every official resolves to exactly one row ...... true
--   existing triggers on barangay_officials ......... 0   (ours will be the first)
--   archived_at / archived_by already present ....... 0   (nothing to collide with)
--   activity_log action CHECK has archived+restored . yes
--   activity_log entity_type CHECK has 'official' ... yes
--
--
-- ─── WHY ──────────────────────────────────────────────────────────────
-- `handleDeleteOfficial` (OfficialDashboard.jsx) issued a permanent
-- DELETE. An official who left office was erased: there are no term
-- columns and no history table, so the row IS the record of who held the
-- position. The photo was orphaned in a public bucket (that path never
-- called storage.remove()), and activity_log.entity_id was left pointing
-- at nothing.
--
-- This is not hypothetical. On 2026-09-30 one Kagawad's directory row was
-- found missing while her official account still existed: display_order 7
-- was an empty slot between 6 and 8, and activity_log held ZERO rows with
-- entity_type = 'official' -- so the removal did not go through the UI and
-- left no trace anywhere. Restoring her needed a data insert and no code
-- change at all. Nothing records who removed it, when, or why. This
-- migration exists so that can never be true again.
--
--
-- ─── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────
--   - No activity_log vocabulary change. 'archived' and 'restored' on
--     'official' already pass BOTH gates: the CHECK constraints
--     (migration 016) and stamp_activity_actor, which returns early and
--     unrestricted for officials (migration 017). Re-verified live above.
--     Migration 016's header reserved these values for exactly this
--     migration; that reservation is now spent.
--
--   - is_official() is NOT touched. It is used in eleven places including
--     residents_registry, waste_schedule and activity_log's own SELECT
--     policy; widening it would hand the nurse all three. Its definition
--     was fingerprinted before this migration (md5
--     538df896e6da689516a89a09f45440e5) and must be unchanged after.
--
--   - display_order is NOT renumbered, on archive or on restore. Rewriting
--     history to keep the current list tidy would destroy the ordering
--     that history recorded.
--
--   - NO photo is deleted. Restore depends entirely on photo_url and the
--     storage object surviving the archive.
--
--   - NO UNIQUE index on active display_order, though it was considered.
--     Two reasons it would hurt: the Add form turns a blank or
--     non-numeric field into 0 (`Number(x) || 0`), so blank adds would
--     start failing with 23505 on a field the user left empty; and
--     swapping two officials' order needs a temporary value, because the
--     Edit flow updates one row at a time and a partial unique index
--     cannot be DEFERRABLE. The restore-side protection that was actually
--     wanted is enforced in the application instead, which blocks the
--     restore and asks for a free order rather than moving anybody.
--
--   - NO field-level immutability trigger for archived rows. §4 protects
--     archived_at and archived_by, which is what matters for audit
--     integrity; the other historical fields are protected only by the UI
--     exposing no Edit control on archived records. That is a DELIBERATE
--     PHASE 3A BOUNDARY, not complete database-level historical
--     immutability. Full immutability would need an allowlist trigger in
--     the shape of protect_reservation_status (comparing
--     to_jsonb(NEW) - '<allowed>' against the same for OLD) and cannot
--     simply block UPDATE on archived rows, because restore is itself an
--     UPDATE.
-- ============================================================


-- ============================================================
-- 1. COLUMNS
-- ============================================================
-- Nullable with no default, so all 11 existing rows become
-- archived_at IS NULL = active, which is the correct starting state.
--
-- NO BACKFILL. Guessing which past officials "should" be archived would
-- fabricate history the barangay never recorded.
ALTER TABLE public.barangay_officials
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES public.profiles(id);

COMMENT ON COLUMN public.barangay_officials.archived_at IS
  'NULL = active, appears in the current directory and on the public page. '
  'NOT NULL = archived historical record. Set by trg_stamp_official_archive, '
  'never accepted from the client.';

COMMENT ON COLUMN public.barangay_officials.archived_by IS
  'The official who archived this record, taken from the caller''s own token '
  'by trg_stamp_official_archive. Anything the client sends is discarded.';


-- ============================================================
-- 2. AT MOST ONE ACTIVE OFFICIAL PER NAME
-- ============================================================
-- Partial, not plain: archived rows are excluded, so history may hold the
-- same name many times while the active set holds it once.
--
-- Three jobs at once:
--   1. Prevents duplicate ACTIVE official records.
--   2. Makes a restore into an occupied name fail loudly with 23505
--      instead of quietly creating two active officials.
--   3. Permanently closes a live fragility: OfficialDashboard.jsx and
--      Sidebar.jsx both look an official up with
--      .eq('full_name', ...).single(), which ERRORS on more than one
--      match. Two active rows sharing a name would strip that official's
--      position permissions with no message anywhere -- the same class of
--      silent failure the Cabrera incident produced from the other
--      direction (zero matches instead of two).
--
-- Creatable today: 0 duplicate full_name values across the 11 rows,
-- verified above.
CREATE UNIQUE INDEX barangay_officials_one_active_per_name
  ON public.barangay_officials (full_name)
  WHERE archived_at IS NULL;


-- ============================================================
-- 3. ACTIVE-SET INDEX
-- ============================================================
-- Both list queries are `select * order by display_order asc`. At 11 rows
-- this buys nothing measurable. It is here for intent and for the several
-- election cycles the archive is designed to accumulate -- not because a
-- slow query was observed. Said plainly so nobody later reads it as
-- evidence of a performance problem that never existed.
CREATE INDEX barangay_officials_active_display_order
  ON public.barangay_officials (display_order)
  WHERE archived_at IS NULL;


-- ============================================================
-- 4. ARCHIVE STAMP + SELF-ARCHIVE GUARD
-- ============================================================
-- WHY A TRIGGER: the UPDATE policy grants any official a whole-row update,
-- so a client could send archived_by = <somebody else's id>. This
-- project's audit design is that identity is TAKEN, never ACCEPTED
-- (stamp_activity_actor, migration 015). A client-writable archived_by
-- sitting next to an unforgeable audit trail would be worse than no
-- column at all.
--
-- This is the FIRST trigger on barangay_officials, so there is no
-- alphabetical same-timing ordering hazard of the kind migration 011
-- documents for profiles. If a SECOND trigger is ever added here, check
-- its name against this one before assuming the order.
--
-- created_by and updated_by remain client-written. That is a pre-existing
-- weakness, deliberately NOT changed here: fixing it would alter the
-- behaviour of Add and Edit, which this migration is not about.
--
-- ⚠️ ON THE SELF-ARCHIVE CHECK BELOW
-- It compares the caller's profiles.full_name against the row's
-- full_name, because that string is the ONLY link between an official's
-- account and their directory record -- there is no foreign key (see
-- CLAUDE.md, "Known fragility"). So if those two strings disagree, the
-- check FAILS OPEN and the official can archive their own record.
--
-- That is accepted knowingly, and it is why this is documented as a
-- MISTAKE-PREVENTION GUARD AND NOT AN AUTHORIZATION BOUNDARY. Archiving
-- yourself REDUCES your own privileges, so there is no attacker
-- incentive: it is a foot-gun, not an escalation path. The real
-- protection is in the UI, which disables the control; this is
-- defence-in-depth against a direct API call, nothing more. Do not cite
-- it as a security control, and do not build anything on top of it that
-- assumes it cannot be bypassed.
CREATE OR REPLACE FUNCTION public.stamp_official_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public          -- pinned; see migration 012
AS $$
DECLARE
  is_api_caller boolean := auth.role() IS NOT NULL
                           AND auth.role() <> 'service_role';
  caller_name text;
BEGIN
  -- Direct database connections (SQL Editor, psql, a migration) are not
  -- API callers: auth.role() IS NULL there, because PostgREST always sets
  -- a role claim and a direct connection does not. Without this bypass the
  -- SQL Editor could not seed or repair archive state -- which is exactly
  -- what you need when something is broken and you are fixing it fast.
  -- Same escape hatch the protect_* triggers rely on.
  IF NOT is_api_caller THEN
    RETURN NEW;
  END IF;

  IF NEW.archived_at IS NOT NULL THEN

    IF OLD.archived_at IS NULL THEN
      -- The archive transition itself.
      SELECT full_name INTO caller_name
      FROM public.profiles WHERE id = auth.uid();

      IF caller_name IS NOT NULL AND caller_name = NEW.full_name THEN
        RAISE EXCEPTION
          'An official cannot archive their own directory record. Another '
          'authorized official must archive it.';
      END IF;

      -- Stamp the truth; discard whatever the client sent for either.
      NEW.archived_at := now();
      NEW.archived_by := auth.uid();
    ELSE
      -- Already archived. The client may not rewrite when it happened or
      -- who did it, so both original values are preserved.
      NEW.archived_at := OLD.archived_at;
      NEW.archived_by := OLD.archived_by;
    END IF;

  ELSE
    -- Active, or being restored. archived_by must not linger, or the row
    -- would claim to be active and archived-by-somebody at once.
    NEW.archived_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_official_archive() IS
  'Takes archived_at and archived_by from the server and the caller''s own '
  'token rather than accepting them from the client, and refuses an '
  'official archiving their own record. The self-archive check depends on '
  'the full_name link between profiles and barangay_officials and is a '
  'mistake-prevention guard, not an authorization boundary. Bypassed on '
  'direct database connections so the SQL Editor can still repair rows.';

CREATE TRIGGER trg_stamp_official_archive
  BEFORE UPDATE ON public.barangay_officials
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_official_archive();


-- ============================================================
-- 5. SELECT POLICY SPLIT   ← the security change
-- ============================================================
-- The policy being replaced is USING (true) for {public}. The publishable
-- key ships inside the JavaScript bundle by design, so anyone can call
-- /rest/v1/barangay_officials directly. Filtering archived rows in React
-- would hide them from the pages and from nobody else. The key is not
-- what protects the data; the policies are.
--
-- Permissive policies are OR'd, which gives exactly the split wanted:
--   anon / resident / nurse -> policy A only         -> active rows only
--   official                -> policy A OR policy B  -> every row
--
-- ROLLBACK SOURCE, captured live before this migration:
--   "Barangay officials viewable by everyone"
--     SELECT  TO public  USING (true)
--     fingerprint eb28d87532d6edd9b635727493ef89f7
DROP POLICY "Barangay officials viewable by everyone" ON public.barangay_officials;

CREATE POLICY "Active officials are viewable by everyone"
  ON public.barangay_officials FOR SELECT
  TO anon, authenticated
  USING (archived_at IS NULL);

CREATE POLICY "Officials can view archived directory records"
  ON public.barangay_officials FOR SELECT
  TO authenticated
  USING (public.is_official(auth.uid()));


-- ============================================================
-- 6. POSITION POWERS MUST FOLLOW THE ARCHIVE   ← do not skip
-- ============================================================
-- Both policies below grant position-restricted WRITE access on OTHER
-- tables by joining barangay_officials on full_name. Neither had an
-- archive condition, so without this section an ARCHIVED Treasurer would
-- keep API-level power to approve and decline court reservations, and an
-- archived Secretary would keep power over document requests. The
-- dashboard would correctly hide the buttons, and the REST API would
-- happily accept the write.
--
-- Deleting the row used to revoke this by accident, because the EXISTS
-- stopped matching. Archive keeps the row, so the revocation has to become
-- deliberate. This is the whole reason 018 is not a column-only migration.
--
-- The condition MUST be written explicitly here. Relying on §5's new
-- SELECT policy to hide the row inside these subqueries does not work:
-- for an authenticated official caller, policy B grants them the archived
-- row, so the subquery would still find it.
--
-- Everything else about both policies is carried over unchanged, roles
-- included (both are TO public, as captured below).
--
-- ROLLBACK SOURCE, captured live before this migration:
--   "Treasurer can update reservations"
--     UPDATE  TO public
--     USING (EXISTS ( SELECT 1 FROM (profiles p
--              JOIN barangay_officials bo ON ((bo.full_name = p.full_name)))
--            WHERE ((p.id = auth.uid())
--              AND (bo."position" = 'Barangay Treasurer'::text))))
--     fingerprint d302d67394baf3e1c0501b7d8e93297a
--
--   "Secretary can update document requests"
--     UPDATE  TO public
--     USING (EXISTS ( SELECT 1 FROM (profiles p
--              JOIN barangay_officials bo ON ((bo.full_name = p.full_name)))
--            WHERE ((p.id = auth.uid())
--              AND (bo."position" = 'Barangay Secretary'::text))))
--     fingerprint 464bd3b9a2d6a21a5fd0a2fff02a932c
DROP POLICY "Treasurer can update reservations" ON public.reservations;

CREATE POLICY "Treasurer can update reservations"
  ON public.reservations FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.barangay_officials bo ON bo.full_name = p.full_name
      WHERE p.id = auth.uid()
        AND bo.position = 'Barangay Treasurer'
        AND bo.archived_at IS NULL
    )
  );

DROP POLICY "Secretary can update document requests" ON public.document_requests;

CREATE POLICY "Secretary can update document requests"
  ON public.document_requests FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.barangay_officials bo ON bo.full_name = p.full_name
      WHERE p.id = auth.uid()
        AND bo.position = 'Barangay Secretary'
        AND bo.archived_at IS NULL
    )
  );


-- ============================================================
-- 7. PERMANENT DELETE, NARROWED TO ARCHIVED ROWS
-- ============================================================
-- The UI stops offering permanent deletion entirely: the Officials
-- Directory shows Archive, and the archive panel shows Restore only. No
-- Delete button exists anywhere.
--
-- The policy is kept, restricted to rows that are already archived, so a
-- genuine mistake (a test row, a typo'd duplicate) can still be cleared
-- from the SQL Editor -- but an ACTIVE official can never be deleted in
-- one step. Archiving first is now structural rather than a UI
-- convention.
--
-- RLS restricts rows, which is exactly the right tool here. No trigger
-- needed: a blocked DELETE simply matches zero rows.
--
-- ROLLBACK SOURCE, captured live before this migration:
--   "Officials can delete from directory"
--     DELETE  TO authenticated
--     USING (EXISTS ( SELECT 1 FROM profiles
--            WHERE ((profiles.id = auth.uid())
--              AND (profiles.role = 'official'::text))))
--     fingerprint 6fc5f2f58edaf1e53d31619e0605a3f3
DROP POLICY "Officials can delete from directory" ON public.barangay_officials;

CREATE POLICY "Officials can delete archived directory records"
  ON public.barangay_officials FOR DELETE
  TO authenticated
  USING (
    archived_at IS NOT NULL
    AND public.is_official(auth.uid())
  );


-- ============================================================
-- ROLLBACK
-- ============================================================
-- ⚠️ Restoring the old SELECT policy while rows still carry archived_at
-- REPUBLISHES those officials to the public page. Decide deliberately
-- whether to clear the column as part of any rollback; do not discover it
-- afterwards.
--
-- Apply in this order (the reverse of above):
--
--   DROP POLICY "Officials can delete archived directory records"
--     ON public.barangay_officials;
--   CREATE POLICY "Officials can delete from directory"
--     ON public.barangay_officials FOR DELETE TO authenticated
--     USING (EXISTS (SELECT 1 FROM profiles
--                    WHERE profiles.id = auth.uid()
--                      AND profiles.role = 'official'));
--
--   DROP POLICY "Secretary can update document requests"
--     ON public.document_requests;
--   CREATE POLICY "Secretary can update document requests"
--     ON public.document_requests FOR UPDATE TO public
--     USING (EXISTS (SELECT 1 FROM public.profiles p
--                    JOIN public.barangay_officials bo
--                      ON bo.full_name = p.full_name
--                    WHERE p.id = auth.uid()
--                      AND bo.position = 'Barangay Secretary'));
--
--   DROP POLICY "Treasurer can update reservations" ON public.reservations;
--   CREATE POLICY "Treasurer can update reservations"
--     ON public.reservations FOR UPDATE TO public
--     USING (EXISTS (SELECT 1 FROM public.profiles p
--                    JOIN public.barangay_officials bo
--                      ON bo.full_name = p.full_name
--                    WHERE p.id = auth.uid()
--                      AND bo.position = 'Barangay Treasurer'));
--
--   DROP POLICY "Officials can view archived directory records"
--     ON public.barangay_officials;
--   DROP POLICY "Active officials are viewable by everyone"
--     ON public.barangay_officials;
--   CREATE POLICY "Barangay officials viewable by everyone"
--     ON public.barangay_officials FOR SELECT TO public USING (true);
--
--   DROP TRIGGER  IF EXISTS trg_stamp_official_archive
--     ON public.barangay_officials;
--   DROP FUNCTION IF EXISTS public.stamp_official_archive();
--
--   DROP INDEX IF EXISTS public.barangay_officials_active_display_order;
--   DROP INDEX IF EXISTS public.barangay_officials_one_active_per_name;
--
--   -- Destructive of archive state. Only with an explicit decision:
--   -- ALTER TABLE public.barangay_officials
--   --   DROP COLUMN archived_by, DROP COLUMN archived_at;
--
-- After any rollback, re-fingerprint the four policies and compare against
-- the values recorded above.


-- ============================================================
-- VERIFICATION — RUN 2026-09-30, ALL 21 PASSED
-- ============================================================
-- Both directions for every guard, because a guard test that does not
-- change the value it guards proves nothing, and a negative test can fail
-- for the wrong reason.
--
-- Every behavioural test ran inside ONE transaction per group, aborted by
-- a deliberate RAISE that also carried the report back. Nothing was
-- committed. Integrity was re-confirmed afterwards (see the foot of this
-- block).
--
-- STRUCTURE
--   [x] archived_at  timestamptz, nullable, no default
--   [x] archived_by  uuid, nullable, no default, FK -> profiles(id)
--   [x] barangay_officials_one_active_per_name
--         UNIQUE btree (full_name) WHERE (archived_at IS NULL)
--   [x] barangay_officials_active_display_order
--         btree (display_order) WHERE (archived_at IS NULL)
--   [x] trg_stamp_official_archive  BEFORE UPDATE FOR EACH ROW
--   [x] is_official() fingerprint unchanged:
--         538df896e6da689516a89a09f45440e5  (before AND after)
--
-- VISIBILITY  (one row archived inside the transaction to test against)
--   [x] T2   anon SELECT ....................... 10 rows, active only
--   [x] T2b  anon sees archived ................  0 rows
--   [x] T3   anon after unarchive .............. 11 rows -- the row
--            REAPPEARS, proving the archive state is the filter and not
--            some unrelated accident
--   [x] T4a  resident SELECT ................... 10 rows, active only
--   [x] T4b  nurse SELECT ...................... 10 rows, active only
--   [x] T5   official SELECT ................... 11 rows, all rows
--
-- POSITION PRIVILEGES  (the reason this is not a column-only migration)
--   [x] T7   CURRENT  Treasurer UPDATE reservations ....... 1 row, allowed
--   [x] T6   ARCHIVED Treasurer UPDATE reservations ....... 0 rows, revoked
--   [x] T9   CURRENT  Secretary UPDATE document_requests .. 1 row, allowed
--   [x] T8   ARCHIVED Secretary UPDATE document_requests .. 0 rows, revoked
--
-- TRIGGER STAMPING
--   [x] T11  client sent archived_at = 1999-01-01 -> re-stamped now()
--   [x] T10  client sent archived_by = another official's id
--            -> overwritten with the caller's own auth.uid()
--   [x] T13  editing an already-archived row preserves BOTH archived_at
--            and archived_by (a second write cannot rewrite the history)
--   [x] T12  restore (archived_at := NULL) forces archived_by NULL
--   [x] T20  direct connection bypass intact: an UPDATE with claims
--            cleared kept the supplied 2020-05-05 value, NOT re-stamped,
--            so the SQL Editor can still repair archive state
--
-- SELF-ARCHIVE GUARD
--   [x] T14a an official archiving THEIR OWN record over the API -> RAISE
--   [x] T14b the same official archiving ANOTHER official -> 1 row
--   Note: this guard fired once unexpectedly while building the harness,
--   because a leftover request.jwt.claims made a setup UPDATE look like an
--   API call. That was a harness bug, not a product bug -- and it is the
--   most convincing evidence the guard works, since it caught a case
--   nobody was testing for. Claims are now cleared whenever the harness
--   returns to the direct connection.
--
-- UNIQUENESS
--   [x] T16  two ACTIVE rows with one name -> 23505, blocked
--   [x] T17  one active + one ARCHIVED sharing a name -> allowed, because
--            history must be able to hold the same person twice
--
-- DELETE RESTRICTION
--   [x] T18a DELETE an ACTIVE row ..... 0 rows, blocked
--   [x] T18b DELETE an ARCHIVED row ... 1 row, allowed
--
-- REGRESSION
--   [x] T22  the nurse writing archived/official to activity_log is still
--            REFUSED (migration 017 holds)
--
-- ADVISORS  get_advisors(security), run after applying:
--   Same four lint categories as before, with ONE new entry, not a new
--   class: the two SECURITY DEFINER RPC-exposure lints went 9 -> 10
--   because stamp_official_archive() now appears alongside
--   stamp_activity_actor, prevent_role_self_change and the two protect_*
--   functions. Like those, it is a TRIGGER function: invoking it over RPC
--   raises 0A000 ("trigger functions can only be called as triggers"), so
--   it is the same false positive in the same category. Recorded rather
--   than waved away. The other three findings are unchanged: btree_gist
--   in public (migration 010), and the Pro-only leaked-password gap.
--
-- INTEGRITY AFTER ALL TESTS -- nothing survived the rollbacks:
--   total rows 11, active 11, archived 0, any archived_by 0
--   display_order 1-11, 0 duplicate orders, 0 duplicate names
--   leftover 'ZZVERIFY' edits 0, leftover test rows 0, leftover log rows 0
--   activity_log 23 rows (1 with entity_type='official' -- the Cabrera
--     restoration, unchanged by this migration)
--   official accounts 11, accounts with no directory row 0
--   reservations 21 rows, document_requests 2 rows
--   is_official() md5 538df896e6da689516a89a09f45440e5
