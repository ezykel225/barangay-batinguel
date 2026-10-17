-- ============================================================================
-- 046_kp_conclude_case.sql
--
-- PR #45 BLOCKER FIX — ONE RPC. A KP case whose hearing outcome was
-- recorded WITHOUT concluding it could not afterwards be concluded.
--
-- STATUS: APPLIED 2026-10-17, through the Supabase connector in ONE
--         `apply_migration` call, returning success.
--
--         VERIFIED from the catalog immediately after applying:
--           * one new function, `prosecdef = true`, `search_path = ""`
--           * PUBLIC EXECUTE: 0 of 1 -- and still 0 across every SECURITY
--             DEFINER function in `public`, so MASTER-B's B5 holds
--           * `anon` EXECUTE: 0 of 1
--           * `authenticated` EXECUTE: 1 of 1
--           * no table, column, constraint, index, trigger or policy added,
--             altered or dropped
--           * `record_kp_hearing_outcome`, `protect_kp_record`,
--             `open_kp_case`, `schedule_kp_hearing`,
--             `update_kp_hearing_record`, `record_kp_attendance`,
--             `confirm_complaint_screening`, `complaint_queue` and
--             `track_complaint` all left byte-identical
--           * all four KP tables still 0 rows after verification
--
-- ============================================================================
-- ⚠️ THE DEFECT, AND WHY IT WAS A DEFECT RATHER THAN A DESIGN
-- ============================================================================
--
-- Combined Phase 1 made "does this conclude the case?" a SEPARATE human
-- answer on `record_kp_hearing_outcome()` rather than a rule inferred from
-- the outcome value. That part is right and is unchanged here: "Resolved --
-- agreement recorded" does NOT conclude a case by itself, because the
-- barangay may keep it open, and software that decided otherwise would be
-- deciding the case.
--
-- What was wrong is that answering "no" was IRREVERSIBLE. ONE outcome per
-- hearing is immutable at two layers -- the RPC refuses a second
-- (`This hearing already has a recorded outcome.`) and `protect_kp_record()`
-- refuses any API update to a hearing that has one -- and that RPC was the
-- ONLY writer of `kp_cases.status = 'concluded'` anywhere in the schema.
--
-- Measured in Final Integration's Flow A trace:
--
--   10  outcome=resolved_agreement_recorded concludes=false -> case=in_process
--   10b CONCLUDE -> P0001 This hearing already has a recorded outcome.
--
-- So the only remaining paths were to schedule and record a FURTHER
-- proceeding -- i.e. to write down a hearing that did not happen -- or to
-- leave the case open for ever. Both are worse than this function.
--
-- ============================================================================
-- ⚠️ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================
--
--   kp_hearings                   NOT written, NOT read for anything but a
--                                 count, and NOT made editable. A recorded
--                                 outcome stays immutable at both layers:
--                                 this function touches no column of that
--                                 table, so the historical record of what
--                                 happened at the proceeding is unchanged by
--                                 a later conclusion.
--   record_kp_hearing_outcome()   UNTOUCHED. Its `p_concludes_case`
--                                 parameter still works and is still the
--                                 ordinary path -- this adds a second way in
--                                 rather than replacing the first.
--   protect_kp_record()           UNTOUCHED, and it is the second barrier
--                                 against a double conclusion: it refuses
--                                 any API update to a case already
--                                 `concluded`. ⚠️ Its nested-branch shape is
--                                 load-bearing (a flat `TG_TABLE_NAME = ...
--                                 AND OLD.outcome` resolves `OLD.outcome` on
--                                 a `kp_cases` row and raised `42703` on
--                                 every case update) and nothing here
--                                 reopens it.
--   the four KP tables            No column, constraint, index, trigger,
--                                 policy or privilege. They stay PRIVATE
--                                 with zero policies, so a direct client
--                                 write is still `42501`.
--   authorization                 NOT BROADENED. The Punong Barangay alone,
--                                 resolved through
--                                 `current_official_holds_position()` and so
--                                 through `official_account_links` -- never
--                                 a name, never `committee`. The Barangay
--                                 Secretary administers every other part of
--                                 the case file and is refused here, exactly
--                                 as she is refused the outcome itself.
--   is_official()                 NOT broadened. Not called here at all.
--   complaints / screenings       NOT read, NOT written. A complaint whose
--                                 case concludes still reads `screened`:
--                                 that is the stage the COMPLAINT reached,
--                                 and 042's and 043's rule that the three
--                                 objects stay distinct is unchanged.
--   complaint_status_history      NOT written. Its reader admits the FILING
--                                 RESIDENT, so a KP note there would hand
--                                 the complainant the barangay's internal
--                                 case administration by a side door.
--   track_complaint()             untouched. No public KP surface exists.
--   activity_log / notifications  NOT written and neither gate widened, for
--                                 the reasons 043 records: `activity_log` is
--                                 readable by EVERY official.
--
-- ============================================================================


-- ─── Concluding a case, later and on its own ────────────────────────────────
--
-- ⚠️ IT DECIDES NOTHING, AND IT DERIVES NOTHING. Whether the case is over is
-- the caller's answer, exactly as `p_concludes_case` was. Nothing here reads
-- the outcome VALUE, the attendance, the minutes, the panel or the screening
-- answers to reach a conclusion -- the one thing it reads about the hearings
-- is whether any outcome has been recorded at all.
--
-- ⚠️ AND THAT COUNT IS THE INVARIANT, NOT A NEW RULE. Before this migration a
-- case could only ever become `concluded` alongside a recorded proceeding
-- outcome, because the only writer was the function that records one.
-- Requiring at least one keeps that exactly: a conclusion still rests on a
-- recorded proceeding, so this function can reach no state the old path could
-- not. Dropping the check would be the broader change.
--
-- ⚠️ NO VISIBILITY PREDICATE IS CALLED, and that is not an omission.
-- `kp_case_is_visible_to_caller()` admits the Secretary as well, so it is
-- WIDER than this gate; the position check is the authority here, which is
-- the same shape `record_kp_hearing_outcome()` already uses.

create or replace function public.conclude_kp_case(
  p_case_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_recorded_outcomes int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to conclude a KP case.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ The Punong Barangay alone, per Combined Phase 1 §2 and unchanged by
  -- this fix. The Secretary is refused here even though she administers the
  -- panel, the schedule, the attendance and the minutes.
  IF NOT public.current_official_holds_position('Punong Barangay') THEN
    RAISE EXCEPTION 'Only the Punong Barangay can conclude a KP case.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT k.status INTO v_status
  FROM public.kp_cases k WHERE k.id = p_case_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'That KP case does not exist.' USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ ONCE ONLY. `protect_kp_record()` would refuse the UPDATE below for an
  -- API caller anyway; this is the readable refusal in front of it, and the
  -- trigger is what makes the property belong to the TABLE rather than to
  -- this function.
  IF v_status = 'concluded' THEN
    RAISE EXCEPTION 'That KP case has already been concluded.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_recorded_outcomes
  FROM public.kp_hearings h
  WHERE h.case_id = p_case_id AND h.outcome IS NOT NULL;

  IF v_recorded_outcomes = 0 THEN
    RAISE EXCEPTION
      'A KP case is concluded from a recorded proceeding outcome, and this '
      'case has none yet.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Actor and timestamp from the caller's own token and the server clock.
  -- Neither is a parameter, and `kp_cases_conclusion_complete` plus
  -- `kp_cases_concluded_has_stamps` mean the status and the stamps cannot
  -- disagree. ⚠️ FOUR COLUMNS OF ONE TABLE, and nothing else in the schema
  -- is written by this function.
  UPDATE public.kp_cases k
     SET status = 'concluded',
         concluded_by = v_uid,
         concluded_at = now(),
         conclusion_note = NULLIF(btrim(COALESCE(p_note, '')), '')
   WHERE k.id = p_case_id;

  RETURN p_case_id;
END;
$function$;

comment on function public.conclude_kp_case(uuid, text) is
  'PR #45 blocker fix. Punong-Barangay-only. Concludes an open KP case that '
  'already carries a recorded proceeding outcome, WITHOUT touching that '
  'outcome -- a hearing outcome stays immutable. Writes only '
  'kp_cases.status/concluded_by/concluded_at/conclusion_note. Refuses a '
  'second conclusion, and refuses a case with no recorded outcome.';


-- ─── The execute surface ────────────────────────────────────────────────────
--
-- ⚠️ `REVOKE ... FROM PUBLIC` IS THE LOAD-BEARING HALF, and it is applied at
-- creation rather than left to a later phase. `pg_default_acl` for `postgres`
-- creating FUNCTIONs in `public` grants `anon`, `authenticated` and
-- `service_role` BY NAME, and PostgreSQL's own function default adds a bare
-- PUBLIC entry on top -- so revoking the named roles alone would leave
-- `has_function_privilege('anon', ...)` TRUE through PUBLIC. That was
-- migration 038's whole finding.
--
-- ⚠️ `anon` GETS NOTHING. There is no public KP surface and 043 §7 forbids
-- one.

revoke execute on function public.conclude_kp_case(uuid, text) from public, anon;
grant execute on function public.conclude_kp_case(uuid, text) to authenticated;
