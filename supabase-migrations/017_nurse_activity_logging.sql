-- ============================================================
-- Barangay Batinguel E-System
-- 017 — let the health centre nurse record her own activity
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-09-29 as migration `nurse_activity_logging`.
--
-- Verified with the block at the foot of this file, run under
-- SET LOCAL ROLE authenticated with rolbypassrls asserted false, so the
-- policy half was genuinely exercised. Every case, both directions:
--
--   ALLOW  nurse + added    + medicine          -> accepted
--   ALLOW  nurse + edited   + medical_program   -> accepted
--   ALLOW  nurse + deleted  + health_event      -> accepted
--   DENY   nurse + added    + announcement      -> refused
--   DENY   nurse + approved + reservation       -> refused
--   DENY   nurse + verified + resident_account  -> refused
--   DENY   nurse + archived + official          -> refused
--   DENY   resident + added     + medicine      -> refused
--   DENY   resident + cancelled + OTHER booking -> refused
--   KEEP   resident + cancelled + OWN booking   -> accepted
--   KEEP   official + archived/verified/added   -> accepted
--
--   SPOOF  client sent actor_id 00000000-0000-0000-0000-000000000000
--          and actor_name 'Punong Barangay'; the stored row held the
--          nurse's real id and 'Barangay Health Nurse'. Both overwritten
--          server-side, so a client cannot forge identity.
--
-- Each DENY inverted its assertion: an accepted insert would have
-- aborted the block with a FAIL message instead of reporting success.
--
-- Nothing left behind: the closing RAISE rolled the whole savepoint
-- back. activity_log is still 9 rows, with zero rows matching
-- 'ZZVERIFY%' or 'ZZTEST%'.
--
-- Nothing unrelated changed. md5 fingerprints captured before and after:
--   is_official                  538df896... -> 538df896...  unchanged
--   ALL public policies          92be31e7... -> 92be31e7...  unchanged
--   policy count                 50          -> 50           unchanged
--   ALL public functions         15efa941... -> 15efa941...  unchanged
--     (same names and same OIDs: CREATE OR REPLACE added no function)
--   triggers on activity_log     39bd4380... -> 39bd4380...  unchanged
--   activity_log constraints     84971a3f... -> 84971a3f...  unchanged (016 intact)
--   stamp_activity_actor         4fa184f9... -> 13b418fc...  CHANGED, as intended
--
-- get_advisors (security) after applying: byte-identical to the run
-- before it -- same three categories, same counts (btree_gist in public,
-- 9 + 9 SECURITY DEFINER RPC-exposure findings, leaked-password). Note
-- stamp_activity_actor was ALREADY in both SECURITY DEFINER lists before
-- this migration, so 017 introduced no new finding.
--
-- ─── WHY THIS EXISTS ─────────────────────────────────────────────────
-- Migration 016 widened the activity_log vocabulary so that nurse
-- actions (medicines, health events, medical programmes) could be
-- recorded. Testing after applying 016 showed they still could not be:
--
--   ERROR: P0001: Only officials can record that kind of activity.
--   CONTEXT: PL/pgSQL function stamp_activity_actor() line 21
--
-- The vocabulary was only half the gate. stamp_activity_actor (015)
-- refuses any non-official writing anything other than
-- 'cancelled'/'reservation', and the nurse is not an official:
--
--   is_official(uid) = EXISTS (SELECT 1 FROM profiles
--                              WHERE id = uid AND role = 'official')
--
-- role must be exactly 'official'; the nurse's role is 'nurse'. So all
-- seven nurse log calls were rejected, and because the client-side
-- helper now surfaces failures, the nurse would have seen a warning on
-- every medicine or programme change.
--
-- ─── WHY NOT JUST CHANGE is_official() ───────────────────────────────
-- Because it is used in eleven places across the schema, including RLS
-- policies on residents_registry, waste_schedule and activity_log's own
-- SELECT policy. Making it return true for nurses would silently grant
-- the nurse official permissions system-wide -- letting her read the
-- whole audit trail, edit the residents registry and the waste
-- schedule. The function is named for officials and must keep meaning
-- exactly that. is_official() is NOT touched by this migration.
--
-- ─── THE NARROW GRANT ────────────────────────────────────────────────
-- A nurse may record activity ONLY when BOTH hold:
--
--   action      IN ('added', 'edited', 'deleted')
--   entity_type IN ('health_event', 'medicine', 'medical_program')
--
-- Those are exactly the three tables the nurse dashboard manages, and
-- exactly the three verbs it performs. Everything else stays refused:
-- she cannot record 'approved' on a reservation, 'verified' on a
-- resident account, 'archived' on an official, or anything at all on
-- announcements, events, waste schedules, registry entries or document
-- requests. Nor can she use the official-only verbs.
--
-- Deliberately still NOT logged, so this grant is not mistaken for
-- "the nurse logs everything": routine medicine stock/status changes
-- (Available / Low / Out). Those change daily by design and would bury
-- the rest of the table. Only add/edit/delete of the record itself.
--
-- ─── WHAT IS PRESERVED, EXACTLY ──────────────────────────────────────
-- The live function was re-read from the database (not from migration
-- 015's text) before writing this, and every existing protection is
-- carried over unchanged:
--
--   1. Direct database connections (SQL Editor, psql, a migration)
--      still bypass, because auth.role() IS NULL there. Without this
--      the SQL Editor could not seed or repair the table.
--   2. actor_id and actor_name are still TAKEN from the caller's token
--      and profile, never accepted from the client. A client that
--      sends its own actor_id has it overwritten.
--   3. Officials are still unrestricted.
--   4. Residents are still limited to 'cancelled' on 'reservation',
--      AND still only on a reservation whose resident_id is their own.
--      Neither half of that is relaxed.
--   5. Somebody with no profile row still falls through to the
--      resident branch and is refused, as before.
--
-- The only behavioural difference is the new nurse branch. An account
-- cannot be both official and nurse -- profiles.role is a single value
-- -- so the branches are mutually exclusive.
--
-- ─── A RESIDUAL RISK, NAMED RATHER THAN HIDDEN ───────────────────────
-- The nurse branch does not verify that the referenced medicine, health
-- event or programme actually exists. It cannot sensibly: the dashboard
-- logs a deletion AFTER the row is gone, so an existence check would
-- reject every legitimate 'deleted' entry.
--
-- So a nurse could, in principle, write a log entry naming a medicine
-- that was never deleted. The resident branch guards the equivalent
-- case because a resident could otherwise fabricate a cancellation of
-- SOMEBODY ELSE'S booking -- an impersonation. There is no equivalent
-- here: medicines and programmes are barangay-wide records that the
-- nurse already owns outright, so a fabricated entry gains her nothing
-- she could not achieve by deleting a real row. Accepted knowingly.
-- ============================================================


CREATE OR REPLACE FUNCTION public.stamp_activity_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_api_caller boolean := auth.role() IS NOT NULL
                           AND auth.role() <> 'service_role';
  caller_is_official boolean;
  caller_is_nurse    boolean;
BEGIN
  -- UNCHANGED (015): direct DB connections are not API callers.
  IF NOT is_api_caller THEN
    RETURN NEW;
  END IF;

  caller_is_official := public.is_official(auth.uid());

  -- UNCHANGED (015): identity is taken, never accepted. Anything the
  -- client sent in actor_id / actor_name is overwritten here.
  NEW.actor_id := auth.uid();
  NEW.actor_name := COALESCE(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    'Unknown'
  );

  -- UNCHANGED (015): officials may record anything in the vocabulary.
  -- Expressed as an early return rather than a negated block so the
  -- nurse branch below reads clearly; behaviour is identical.
  IF caller_is_official THEN
    RETURN NEW;
  END IF;

  -- NEW: the health centre nurse, narrowly.
  caller_is_nurse := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'nurse'
  );

  IF caller_is_nurse THEN
    IF NEW.action IN ('added', 'edited', 'deleted')
       AND NEW.entity_type IN ('health_event', 'medicine', 'medical_program')
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'The health centre nurse can only record additions, edits and deletions '
      'of medicines, health events and medical programmes.';
  END IF;

  -- UNCHANGED (015): everyone else -- residents -- may record only the
  -- cancellation of a reservation...
  IF NEW.action <> 'cancelled' OR NEW.entity_type <> 'reservation' THEN
    RAISE EXCEPTION
      'Only officials can record that kind of activity.';
  END IF;

  -- ...and only their own. Without this a resident could log a
  -- truthful-looking cancellation of somebody else's reservation.
  IF NEW.entity_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.reservations r
       WHERE r.id = NEW.entity_id AND r.resident_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION
      'You can only record activity on your own reservation.';
  END IF;

  RETURN NEW;
END;
$$;

-- The trigger itself is unchanged and is NOT recreated: it already
-- points at this function by name, so CREATE OR REPLACE is enough.
--   CREATE TRIGGER trg_stamp_activity_actor BEFORE INSERT
--     ON public.activity_log FOR EACH ROW
--     EXECUTE FUNCTION stamp_activity_actor();
--
-- No policy is added, dropped or altered. activity_log still has only
-- an INSERT policy (actor_id = auth.uid()) and a SELECT policy
-- (is_official(auth.uid())) -- note the nurse still CANNOT read the
-- activity log, only write her own three entity types to it.


-- ============================================================
-- VERIFICATION — run after applying, then record the results in the
-- STATUS block above.
--
-- Runs every case in BOTH directions inside a savepoint, under
-- SET LOCAL ROLE authenticated so RLS is genuinely enforced (the SQL
-- Editor's own role has rolbypassrls = true, which would otherwise make
-- the policy half of this meaningless). The closing RAISE rolls
-- everything back, so no test row survives.
--
-- A FAIL anywhere aborts with that message instead of the report.
-- ============================================================

DO $$
DECLARE
  nurse      uuid := (SELECT id FROM public.profiles WHERE role = 'nurse' LIMIT 1);
  official   uuid := (SELECT id FROM public.profiles WHERE role = 'official' LIMIT 1);
  resident   uuid := (SELECT r.resident_id FROM public.reservations r
                      JOIN public.profiles p ON p.id = r.resident_id
                      WHERE p.role = 'resident' LIMIT 1);
  own_resv   uuid;
  other_resv uuid;
  report     text := E'\n';
  refused    boolean;
  stored     record;
BEGIN
  BEGIN
    SELECT id INTO own_resv   FROM public.reservations WHERE resident_id = resident LIMIT 1;
    SELECT id INTO other_resv FROM public.reservations
      WHERE resident_id IS DISTINCT FROM resident AND resident_id IS NOT NULL LIMIT 1;

    EXECUTE 'SET LOCAL ROLE authenticated';
    IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
      RAISE EXCEPTION 'FAIL: running as an RLS-bypassing role; results would be meaningless';
    END IF;
    report := report || format('role=%s  rls_bypass=false  nurse=%s%s',
                               current_user, nurse, E'\n\n');

    -- ─────────────── ALLOWED: nurse, her three entity types ───────────
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', nurse, 'role','authenticated')::text, true);

    INSERT INTO public.activity_log (action, entity_type, subject)
      VALUES ('added','medicine','ZZVERIFY');
    report := report || E'ALLOW  nurse + added   + medicine         -> accepted\n';

    INSERT INTO public.activity_log (action, entity_type, subject)
      VALUES ('edited','medical_program','ZZVERIFY');
    report := report || E'ALLOW  nurse + edited  + medical_program  -> accepted\n';

    INSERT INTO public.activity_log (action, entity_type, subject)
      VALUES ('deleted','health_event','ZZVERIFY');
    report := report || E'ALLOW  nurse + deleted + health_event     -> accepted\n\n';

    -- ─────────────── DENIED: nurse, everything else ───────────────────
    refused := false;
    BEGIN INSERT INTO public.activity_log (action, entity_type, subject)
            VALUES ('added','announcement','ZZVERIFY');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN refused := true; END;
    IF NOT refused THEN RAISE EXCEPTION 'FAIL: nurse wrote added/announcement'; END IF;
    report := report || E'DENY   nurse + added    + announcement     -> refused\n';

    refused := false;
    BEGIN INSERT INTO public.activity_log (action, entity_type, subject)
            VALUES ('approved','reservation','ZZVERIFY');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN refused := true; END;
    IF NOT refused THEN RAISE EXCEPTION 'FAIL: nurse wrote approved/reservation'; END IF;
    report := report || E'DENY   nurse + approved + reservation      -> refused\n';

    refused := false;
    BEGIN INSERT INTO public.activity_log (action, entity_type, subject)
            VALUES ('verified','resident_account','ZZVERIFY');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN refused := true; END;
    IF NOT refused THEN RAISE EXCEPTION 'FAIL: nurse wrote verified/resident_account'; END IF;
    report := report || E'DENY   nurse + verified + resident_account -> refused\n';

    refused := false;
    BEGIN INSERT INTO public.activity_log (action, entity_type, subject)
            VALUES ('archived','official','ZZVERIFY');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN refused := true; END;
    IF NOT refused THEN RAISE EXCEPTION 'FAIL: nurse wrote archived/official'; END IF;
    report := report || E'DENY   nurse + archived + official         -> refused\n\n';

    -- ─────────────── DENIED: resident must not gain the new grant ─────
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', resident, 'role','authenticated')::text, true);

    refused := false;
    BEGIN INSERT INTO public.activity_log (action, entity_type, subject)
            VALUES ('added','medicine','ZZVERIFY');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN refused := true; END;
    IF NOT refused THEN RAISE EXCEPTION 'FAIL: resident wrote added/medicine'; END IF;
    report := report || E'DENY   resident + added + medicine         -> refused\n';

    refused := false;
    BEGIN INSERT INTO public.activity_log (action, entity_type, entity_id, subject)
            VALUES ('cancelled','reservation', other_resv, 'ZZVERIFY');
    EXCEPTION WHEN SQLSTATE 'P0001' THEN refused := true; END;
    IF NOT refused THEN RAISE EXCEPTION 'FAIL: resident logged another resident''s booking'; END IF;
    report := report || E'DENY   resident + cancelled + other booking-> refused\n\n';

    -- ─────────────── PRESERVED: resident's own cancellation ───────────
    INSERT INTO public.activity_log (action, entity_type, entity_id, subject)
      VALUES ('cancelled','reservation', own_resv, 'ZZVERIFY');
    report := report || E'KEEP   resident + cancelled + own booking  -> accepted\n';

    -- ─────────────── PRESERVED: official may record anything ──────────
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', official, 'role','authenticated')::text, true);
    INSERT INTO public.activity_log (action, entity_type, subject)
      VALUES ('archived','official','ZZVERIFY');
    INSERT INTO public.activity_log (action, entity_type, subject)
      VALUES ('verified','resident_account','ZZVERIFY');
    report := report || E'KEEP   official + archived/verified        -> accepted\n\n';

    -- ─────────────── actor identity is taken, not accepted ────────────
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', nurse, 'role','authenticated')::text, true);
    INSERT INTO public.activity_log
      (action, entity_type, subject, actor_id, actor_name)
    VALUES ('added','medicine','ZZVERIFY-SPOOF',
            '00000000-0000-0000-0000-000000000000', 'Punong Barangay');

    SELECT actor_id, actor_name INTO stored
      FROM public.activity_log WHERE subject = 'ZZVERIFY-SPOOF';

    IF stored.actor_id <> nurse THEN
      RAISE EXCEPTION 'FAIL: client-supplied actor_id was trusted (%)', stored.actor_id;
    END IF;
    IF stored.actor_name = 'Punong Barangay' THEN
      RAISE EXCEPTION 'FAIL: client-supplied actor_name was trusted';
    END IF;
    report := report || format('SPOOF  client sent actor_id=000...0 / "Punong Barangay"%s', E'\n');
    report := report || format('       stored actor_id=%s%s', stored.actor_id, E'\n');
    report := report || format('       stored actor_name=%s  -> overwritten server-side%s',
                               stored.actor_name, E'\n');

    RAISE EXCEPTION 'VERIFY017%', report;
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'VERIFY017%' THEN RAISE EXCEPTION '%', SQLERRM; ELSE RAISE; END IF;
  END;
END $$;

-- Then confirm nothing survived:
--   SELECT count(*) AS should_be_zero
--   FROM public.activity_log WHERE subject LIKE 'ZZVERIFY%';
--   SELECT count(*) AS should_be_9 FROM public.activity_log;
