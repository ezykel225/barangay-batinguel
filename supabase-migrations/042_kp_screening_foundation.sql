-- ============================================================================
-- 042_kp_screening_foundation.sql
--
-- P4-A — KP JURISDICTION SCREENING FOUNDATION
-- HUMAN-REVIEWED SCREENING ONLY
--
-- STATUS: APPLIED 2026-10-16, live, through the Supabase connector.
--
--         ⚠️ APPLIED IN SIX CALLS, NOT ONE, and the reason is recorded under
--         the trigger below: a single `apply_migration` carrying this whole
--         file timed out at 60 seconds on the connector's
--         destructive-statement gate. Live state was re-read immediately
--         afterwards and NOTHING had executed -- no table, both original
--         CHECKs intact, zero functions -- which is the same all-or-nothing
--         behaviour migration 035 recorded for a gated call.
--
--         The gating statement was then isolated by measurement rather than
--         guessed at: `DROP TRIGGER IF EXISTS` reproduces the timeout on its
--         own, while `ALTER TABLE ... DROP CONSTRAINT` applied cleanly three
--         times. That line is gone (see below), so this file now applies
--         through the connector in one call as well as in the SQL Editor.
--
--         Verified by role impersonation; the matrix is in P4-A's report.
--
-- ============================================================================
-- ⚠️ THE SYSTEM DOES NOT DECIDE KP JURISDICTION. THAT IS THE WHOLE PHASE.
-- ============================================================================
--
-- This migration can:
--   * record the answers a human gave to a review checklist;
--   * record an administrative RECOMMENDATION a human chose;
--   * record a CONFIRMED OUTCOME a human chose;
--   * refuse to let the wrong caller do either.
--
-- It CANNOT, and no function here does:
--   * derive an outcome from the answers;
--   * declare a complaint legally eligible or ineligible;
--   * convert a complaint into a KP case;
--   * issue a referral;
--   * close a complaint.
--
-- There is deliberately NO function in this file that maps answers to an
-- outcome or a recommendation. Both are parameters a human supplies. A
-- source-reading test asserts no such mapping exists, because a function
-- that computed one would make the software the decider — and the brief's
-- own rule, and this project's, is that it must not be.
--
-- ============================================================================
-- ⚠️ PROVISIONAL REVIEW CHECKLIST — FOR BARANGAY CONFIRMATION
-- ============================================================================
--
-- The six review items in `complaint_screening_checklist_keys()` are a
-- PROVISIONAL list drawn from the review areas the capstone brief named.
-- They are NOT a statement of law, NOT exhaustive, and NOT verified against
-- Barangay Batinguel's actual Katarungang Pambarangay procedure, which has
-- not been supplied to this project.
--
-- Accordingly this file hardcodes NO legal content whatsoever:
--   * no offense penalty threshold;
--   * no statutory day limit;
--   * no repudiation period;
--   * no CFA requirement;
--   * no mandatory VAWC procedure;
--   * no legal conclusion of any kind.
--
-- Every CHECK constraint below constrains only this system's own
-- vocabulary. None encodes a speculative legal rule.
--
-- ============================================================================
-- ⚠️ PROVISIONAL AUTHORIZATION, AND IT IS NOT A PROVEN LEGAL REQUIREMENT
-- ============================================================================
--
--   Barangay Secretary  — prepares a screening (answers + recommendation)
--   Punong Barangay     — the ONLY confirmer of a completed screening
--   every other caller  — nothing
--
-- That split is a capstone workflow decision the barangay must verify. It is
-- recorded here as provisional, not as law.
--
-- ⚠️ AUTHORIZATION RESOLVES THROUGH `current_official_holds_position()` AND
-- NOTHING ELSE — the MASTER-A chain:
--
--   auth.uid() -> profiles.id -> official_account_links.profile_id
--              -> official_account_links.official_id
--              -> barangay_officials.id (archived_at IS NULL)
--              -> barangay_officials.position
--
-- ⚠️ `barangay_officials.committee` IS NOT READ ANYWHERE IN THIS FILE, and
-- must never be. A real `Peace and Order and Appropriation` value exists on
-- one Kagawad, and it grants nothing here. The column is free text with no
-- CHECK, the Edit Official form sends it for ANY row, the directory UPDATE
-- policy admits ANY official, and `protect_official_record()` does not guard
-- it — so authorizing on it would reproduce migration 028's escalation on an
-- unguarded column. A Kagawad wanting screening authority would simply type
-- it into their own committee field and save.
--
-- ⚠️ No `full_name` is read for identity either, and no Kagawad is named.
--
-- ============================================================================
-- WHAT THIS FILE CREATES
-- ============================================================================
--
--   1 table      complaint_screenings          (PRIVATE: no policy, no grant)
--   1 index      one OPEN screening per complaint
--   1 trigger    a confirmed screening is immutable
--   5 functions  1 checklist helper, 1 visibility predicate, 3 RPCs
--   3 statuses   complaints.status gains `under_review` and `screened`
--
-- ⚠️ It does NOT create `kp_cases`, a Lupon roster, a Pangkat, a hearing, a
-- summons, a settlement, a CFA, an incident, a blotter, a Tanod table, a
-- capability-assignment table, or `kp_jurisdiction_rules`. P4-A ends at a
-- confirmed screening; the KP case foundation is P4-B's.
--
-- ============================================================================


-- ─── 1. The complaint status vocabulary, widened by exactly two ────────────
--
-- ⚠️ THREE CHECKS, NOT ONE, AND MISSING ONE IS MIGRATION 016'S RECORDED
-- MISTAKE. `complaints.status` is constrained, and so are BOTH
-- `complaint_status_history.from_status` and `.to_status` — each permitted
-- only `received`. Widening the complaint without widening the history
-- would make the status change succeed and its own audit row fail `23514`,
-- inside the same RPC. Measured from the live catalog before writing this.
--
-- ⚠️ WIDENING is safe; NARROWING later would not be. A CHECK is revalidated
-- on every UPDATE, so removing a value once rows hold it makes that history
-- un-editable — the reason migration 020 used a trigger rather than a CHECK.
--
-- ⚠️ The status says WHICH STAGE the complaint is at. It deliberately does
-- NOT carry the decision: `screened` means "a human has confirmed a
-- screening", never which outcome they confirmed. The outcome lives on the
-- screening row, which only the Secretary and the Punong Barangay can read.
-- Two values would otherwise mean one fact in two places.
--
--   received      intake complete, no screening prepared
--   under_review  a screening has been prepared and is awaiting confirmation
--   screened      a human has confirmed a screening outcome

alter table public.complaints
  drop constraint complaints_status_check;

alter table public.complaints
  add constraint complaints_status_check
  check (status = any (array['received', 'under_review', 'screened']));

alter table public.complaint_status_history
  drop constraint complaint_status_history_from_status_check;

alter table public.complaint_status_history
  add constraint complaint_status_history_from_status_check
  check (from_status is null
         or from_status = any (array['received', 'under_review', 'screened']));

alter table public.complaint_status_history
  drop constraint complaint_status_history_to_status_check;

alter table public.complaint_status_history
  add constraint complaint_status_history_to_status_check
  check (to_status = any (array['received', 'under_review', 'screened']));


-- ─── 2. The screening record ───────────────────────────────────────────────

create table if not exists public.complaint_screenings (
  id uuid primary key default gen_random_uuid(),

  complaint_id uuid not null
    references public.complaints(id) on delete restrict,

  -- ⚠️ THE VERSION IS WHAT MAKES A HISTORICAL SCREENING READABLE. The
  -- checklist may be reworded or extended later; a row recorded under v1
  -- must still be interpretable as the six v1 questions. Without this,
  -- answers whose keys no longer exist become unreadable rather than
  -- historical, and a missing key cannot be told from an unanswered one.
  checklist_version text not null,

  -- ⚠️ JSONB, AND VALIDATED BY THE WRITING RPC RATHER THAN LEFT FREE.
  --
  -- Explicit per-question columns were the alternative and were rejected
  -- after comparing them: a new question then means a migration AND a
  -- nullable column, and on every pre-existing row that NULL is
  -- indistinguishable from the real answer `unknown` — so the model would
  -- lose exactly the distinction the checklist exists to record.
  --
  -- JSONB keeps old rows intact and needs no migration to reword a
  -- question, and the usual objection to it — that it can hold anything —
  -- does not apply here: this table has NO client privilege and NO INSERT
  -- policy, so `prepare_complaint_screening()` is the only writer that
  -- exists, and it refuses an unknown key, a missing key, a non-object and
  -- an answer outside the three permitted values. The validation is
  -- therefore in one place rather than spread across a dozen CHECKs.
  answers jsonb not null,

  -- The Secretary's administrative recommendation. ⚠️ NULLABLE, and
  -- ⚠️ CHOSEN BY A HUMAN, NEVER COMPUTED. Nothing in this file derives it
  -- from `answers`.
  recommendation text,
  recommendation_note text,

  -- ⚠️ Server-stamped from `auth.uid()`. Not a parameter of any RPC.
  prepared_by uuid not null
    references public.profiles(id) on delete restrict,
  prepared_at timestamptz not null default now(),

  -- The human confirmation. All three are NULL until the Punong Barangay
  -- confirms, and are stamped together in one statement so a row can never
  -- carry an outcome without an actor or a time.
  confirmed_outcome text,
  confirmed_by uuid references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  confirmation_note text,

  created_at timestamptz not null default now(),

  -- ⚠️ THE SYSTEM FLAG AND THE HUMAN OUTCOME ARE DIFFERENT COLUMNS, and
  -- this constraint is what keeps the second one honest: an outcome exists
  -- only together with the person who chose it and the moment they did.
  -- All three NULL, or all three present. There is no state in which the
  -- database holds a decision nobody made.
  constraint complaint_screenings_confirmation_complete check (
    (confirmed_outcome is null and confirmed_by is null and confirmed_at is null)
    or
    (confirmed_outcome is not null and confirmed_by is not null and confirmed_at is not null)
  ),

  -- ⚠️ This system's own vocabulary, not a legal one. Each value names what
  -- the BARANGAY decided to do next — not a finding about the law.
  --
  -- Deliberately ABSENT: `settled`, `conciliation`, `certificate_to_file_action`,
  -- `eligible`, `ineligible`, `dismissed`. The first three are P4-B/P4-C
  -- concepts with nothing here to reach them; the last three are legal
  -- conclusions this software must not appear to make.
  constraint complaint_screenings_outcome_check check (
    confirmed_outcome is null or confirmed_outcome = any (array[
      'proceed_to_kp_process',
      'refer_for_further_action',
      'close_without_kp_process',
      'needs_more_information'
    ])
  ),

  -- The recommendation draws on the SAME four words, so a reader never has
  -- to learn two vocabularies for one question, and a recommendation can be
  -- compared with the outcome that followed it.
  constraint complaint_screenings_recommendation_check check (
    recommendation is null or recommendation = any (array[
      'proceed_to_kp_process',
      'refer_for_further_action',
      'close_without_kp_process',
      'needs_more_information'
    ])
  ),

  constraint complaint_screenings_version_check check (
    checklist_version = any (array['v1'])
  ),

  constraint complaint_screenings_answers_is_object check (
    jsonb_typeof(answers) = 'object'
  )
);

comment on table public.complaint_screenings is
  'P4-A. One human-prepared, human-confirmed KP review screening per attempt. '
  'PRIVATE: zero policies and zero client privilege, reached only through the '
  'SECURITY DEFINER functions in migration 042. The checklist is PROVISIONAL '
  'and awaits barangay confirmation; nothing here decides jurisdiction.';

comment on column public.complaint_screenings.answers is
  'Human answers keyed by the checklist_version key set. Validated by '
  'prepare_complaint_screening(), which is the only writer. May record that a '
  'matter possibly involves a minor or is a possible VAWC/sensitive family '
  'matter -- those answers never leave this table.';

comment on column public.complaint_screenings.confirmed_outcome is
  'What the barangay decided to DO next. Not a legal finding, and never '
  'derived from answers.';

-- ⚠️ AT MOST ONE OPEN SCREENING PER COMPLAINT, and confirmed ones are
-- history. Re-screening a complaint inserts a NEW row; it never rewrites a
-- confirmed one. So a redone screening preserves what the previous reviewer
-- answered and what the Punong Barangay confirmed, which is the whole point
-- of keeping history rather than overwriting.
create unique index if not exists complaint_screenings_one_open_per_complaint
  on public.complaint_screenings (complaint_id)
  where confirmed_at is null;

create index if not exists complaint_screenings_complaint_idx
  on public.complaint_screenings (complaint_id, created_at desc);

alter table public.complaint_screenings enable row level security;

-- ⚠️ TWO BARRIERS, 019A's PATTERN, AND THE PRIVILEGE ONE ANSWERS FIRST.
-- Supabase grants full DML on a new public table to `anon` and
-- `authenticated` by default, so the absent policies alone would be the ONLY
-- thing stopping a read — and RLS returns an empty set, which is
-- indistinguishable from "there are no rows". Revoking as well makes every
-- client attempt `42501`, the privilege layer, before RLS is consulted.
--
-- ⚠️ ZERO POLICIES, and none is to be added. RLS filters ROWS and cannot
-- restrict COLUMNS, and this table's whole content is restricted -- so a
-- SELECT policy would be the wrong tool even for the readers who may see it.
revoke all on table public.complaint_screenings from anon, authenticated, public;


-- ─── 3. The checklist key set ──────────────────────────────────────────────
--
-- ⚠️ THE QUESTIONS THEMSELVES ARE APPLICATION DATA; THIS IS ONLY THE KEY SET.
-- The wording a reviewer reads lives in `src/screening/screeningChecklist.js`
-- so it can be improved without a migration. What the database owns is which
-- keys are permitted, so a typo'd or invented key cannot be stored. A test
-- reads this function out of the migration and asserts the JS list matches it
-- exactly -- the same cross-check `reservationWindow.test.js` makes against
-- migration 020 and `officialAvailability.test.js` against 026.
--
-- ⚠️ EVERY KEY IS A QUESTION, NOT A CONCLUSION. They are named for what a
-- reviewer is asked to observe ("possible", "indicated"), never for a legal
-- status. There is no `is_kp_eligible` key and there must never be one.
--
-- ⚠️ This is NOT `kp_jurisdiction_rules` and must not grow into it: it holds
-- no rule, no weighting, no threshold and no outcome. It is a list of six
-- strings.

create or replace function public.complaint_screening_checklist_keys(p_version text)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $function$
  SELECT CASE p_version
    WHEN 'v1' THEN ARRAY[
      'government_or_public_office_party',
      'possible_serious_offense',
      'possible_vawc_or_sensitive_family_matter',
      'parties_from_different_city_or_municipality',
      'minor_involved',
      'other_circumstance_requiring_review'
    ]
    ELSE NULL
  END;
$function$;

comment on function public.complaint_screening_checklist_keys(text) is
  'P4-A. The permitted answer keys for one PROVISIONAL checklist version. '
  'Holds no rule, no threshold and no outcome -- it is a key set, not a rules '
  'engine, and is deliberately not kp_jurisdiction_rules.';


-- ─── 4. Who may see a screening ────────────────────────────────────────────
--
-- ⚠️ THIS IS NARROWER THAN `complaint_is_visible_to_caller()`, AND REUSING
-- THAT ONE WOULD HAVE BEEN A PRIVACY DEFECT. That predicate admits the
-- FILING RESIDENT, which is right for their own narrative and parties and
-- wrong for a screening: the checklist records whether a matter possibly
-- involves a minor or is a possible VAWC/sensitive family matter, and the
-- complainant must not read the barangay's internal review of their own
-- complaint. Read from the live definition rather than assumed.
--
-- So: the Barangay Secretary and the Punong Barangay, and nobody else.
-- Not the Treasurer, not any Kagawad however their committee reads, not the
-- nurse, not the filing resident, not `anon`.
--
-- SECURITY DEFINER is required rather than stylistic: the predicate reads
-- `official_account_links`, which is unreadable by every client, so an
-- inline EXISTS would see nothing and granting SELECT to fix that would
-- publish which auth account belongs to which named person.

create or replace function public.complaint_screening_is_visible_to_caller(p_complaint_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  SELECT EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = p_complaint_id)
     AND (
       public.current_official_holds_position('Barangay Secretary')
       OR public.current_official_holds_position('Punong Barangay')
     );
$function$;

comment on function public.complaint_screening_is_visible_to_caller(uuid) is
  'P4-A. The one screening visibility predicate: Barangay Secretary or Punong '
  'Barangay. DELIBERATELY NARROWER than complaint_is_visible_to_caller(), '
  'which admits the filing resident -- a complainant must not read the '
  'barangay internal review of their own complaint.';


-- ─── 5. Preparing a screening — the Barangay Secretary's ───────────────────
--
-- ⚠️ IT TAKES NO IDENTITY, NO TIMESTAMP, NO STATUS AND NO OUTCOME.
-- `prepared_by` comes from `auth.uid()`, `prepared_at` from `now()`, the
-- complaint's new status is the literal `under_review`, and the confirmation
-- columns are untouched. There is nothing here for a crafted call to forge.
--
-- ⚠️ IT WRITES NO OUTCOME. Preparing records answers and an optional
-- recommendation; it cannot confirm anything, not even by the caller who
-- would be allowed to confirm.

create or replace function public.prepare_complaint_screening(
  p_complaint_id uuid,
  p_checklist_version text,
  p_answers jsonb,
  p_recommendation text default null,
  p_recommendation_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
DECLARE
  v_uid uuid := auth.uid();
  v_keys text[];
  v_answer_keys text[];
  v_key text;
  v_value text;
  v_screening_id uuid;
  v_old_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to prepare a screening.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ The position gate, resolved through official_account_links. Not the
  -- committee, not a name, not a frontend flag.
  IF NOT public.current_official_holds_position('Barangay Secretary') THEN
    RAISE EXCEPTION 'Only the Barangay Secretary can prepare a screening.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT c.status INTO v_old_status
  FROM public.complaints c WHERE c.id = p_complaint_id;

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'That complaint does not exist.' USING ERRCODE = 'P0001';
  END IF;

  v_keys := public.complaint_screening_checklist_keys(p_checklist_version);
  IF v_keys IS NULL THEN
    RAISE EXCEPTION 'Unknown checklist version.' USING ERRCODE = 'P0001';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'The checklist answers must be an object.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ EVERY KEY ANSWERED, NO KEY INVENTED, EVERY VALUE ONE OF THREE.
  --
  -- Both directions matter. An unknown key would store an answer no version
  -- can interpret; a MISSING key would leave a question silently
  -- unanswered, and "nobody answered this" is exactly what the third
  -- permitted value, `unknown`, exists to say out loud. A reviewer who has
  -- not established something records `unknown` rather than leaving a gap.
  SELECT array_agg(k ORDER BY k) INTO v_answer_keys
  FROM jsonb_object_keys(p_answers) AS k;

  IF v_answer_keys IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM unnest(v_keys) AS k) THEN
    RAISE EXCEPTION 'The checklist answers do not match the % question set.', p_checklist_version
      USING ERRCODE = 'P0001';
  END IF;

  FOREACH v_key IN ARRAY v_keys LOOP
    v_value := p_answers ->> v_key;
    IF v_value IS NULL OR v_value NOT IN ('yes', 'no', 'unknown') THEN
      RAISE EXCEPTION 'Each checklist answer must be yes, no or unknown.'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  -- ⚠️ An OPEN screening is a draft and is revised in place; a CONFIRMED one
  -- is history and is never touched. The partial unique index permits one
  -- open row per complaint, so this either updates that draft or inserts the
  -- first. Re-stamping `prepared_by` is deliberate: it records who last
  -- prepared it, which is the honest answer when two Secretaries have held
  -- the post.
  SELECT s.id INTO v_screening_id
  FROM public.complaint_screenings s
  WHERE s.complaint_id = p_complaint_id AND s.confirmed_at IS NULL;

  IF v_screening_id IS NULL THEN
    INSERT INTO public.complaint_screenings (
      complaint_id, checklist_version, answers,
      recommendation, recommendation_note, prepared_by, prepared_at)
    VALUES (
      p_complaint_id, p_checklist_version, p_answers,
      p_recommendation, NULLIF(btrim(COALESCE(p_recommendation_note, '')), ''),
      v_uid, now())
    RETURNING id INTO v_screening_id;
  ELSE
    UPDATE public.complaint_screenings s
       SET checklist_version = p_checklist_version,
           answers = p_answers,
           recommendation = p_recommendation,
           recommendation_note = NULLIF(btrim(COALESCE(p_recommendation_note, '')), ''),
           prepared_by = v_uid,
           prepared_at = now()
     WHERE s.id = v_screening_id;
  END IF;

  -- ⚠️ The complaint moves to `under_review` and the move is APPENDED to
  -- history, never written over it. Only on a real transition, so revising a
  -- draft twice does not file two identical audit rows -- the same
  -- no-op guard migration 022's notification triggers use.
  IF v_old_status = 'received' THEN
    UPDATE public.complaints c
       SET status = 'under_review', updated_at = now()
     WHERE c.id = p_complaint_id;

    INSERT INTO public.complaint_status_history (
      complaint_id, from_status, to_status, actor_profile_id, note)
    VALUES (p_complaint_id, v_old_status, 'under_review', v_uid,
            'Screening prepared for barangay review.');
  END IF;

  RETURN v_screening_id;
END;
$function$;


-- ─── 6. Confirming a screening — the Punong Barangay's, and only his ───────
--
-- ⚠️ DATABASE-ENFORCED, NOT FRONTEND-ENFORCED. The UI paints the control for
-- one position; this is what decides. A crafted API call by the Secretary,
-- the Treasurer or any Kagawad is refused here.

create or replace function public.confirm_complaint_screening(
  p_screening_id uuid,
  p_outcome text,
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
  v_complaint_id uuid;
  v_prepared_by uuid;
  v_confirmed_at timestamptz;
  v_old_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to confirm a screening.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ THE PROVISIONAL FINAL CONFIRMER, AND THE ONLY ONE.
  IF NOT public.current_official_holds_position('Punong Barangay') THEN
    RAISE EXCEPTION 'Only the Punong Barangay can confirm a screening.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT s.complaint_id, s.prepared_by, s.confirmed_at
    INTO v_complaint_id, v_prepared_by, v_confirmed_at
  FROM public.complaint_screenings s WHERE s.id = p_screening_id;

  IF v_complaint_id IS NULL THEN
    RAISE EXCEPTION 'That screening does not exist.' USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ A CONFIRMED SCREENING IS NOT RE-CONFIRMED. Changing a recorded
  -- decision would rewrite who decided what and when; a new review is a new
  -- screening row.
  IF v_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'That screening has already been confirmed.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ NOBODY CONFIRMS THEIR OWN PREPARATION, and this is belt and braces
  -- rather than the control: one active official holds each powered
  -- position (migration 028's partial unique index), so the Secretary who
  -- prepared cannot also be the Punong Barangay today. The guard is here so
  -- that the separation survives any future change to who may prepare,
  -- instead of resting on a constraint elsewhere in the schema.
  IF v_prepared_by = v_uid THEN
    RAISE EXCEPTION 'A screening cannot be confirmed by the official who prepared it.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_outcome IS NULL OR p_outcome NOT IN (
    'proceed_to_kp_process', 'refer_for_further_action',
    'close_without_kp_process', 'needs_more_information'
  ) THEN
    RAISE EXCEPTION 'Unknown screening outcome.' USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ Actor and timestamp are stamped here, from the caller's own token and
  -- the server clock. Neither is a parameter.
  UPDATE public.complaint_screenings s
     SET confirmed_outcome = p_outcome,
         confirmed_by = v_uid,
         confirmed_at = now(),
         confirmation_note = NULLIF(btrim(COALESCE(p_note, '')), '')
   WHERE s.id = p_screening_id;

  SELECT c.status INTO v_old_status
  FROM public.complaints c WHERE c.id = v_complaint_id;

  IF v_old_status IS DISTINCT FROM 'screened' THEN
    UPDATE public.complaints c
       SET status = 'screened', updated_at = now()
     WHERE c.id = v_complaint_id;

    -- ⚠️ THE HISTORY NOTE CARRIES NO OUTCOME AND NO REASONING. It records
    -- that a confirmation happened. `complaint_status_history` is reachable
    -- through `complaint_history_for()`, whose own predicate admits the
    -- FILING RESIDENT -- so writing the decision here would hand the
    -- complainant the barangay's internal conclusion by a side door. The
    -- outcome stays on the screening row, behind the narrower predicate.
    INSERT INTO public.complaint_status_history (
      complaint_id, from_status, to_status, actor_profile_id, note)
    VALUES (v_complaint_id, v_old_status, 'screened', v_uid,
            'Screening confirmed by the barangay.');
  END IF;

  RETURN p_screening_id;
END;
$function$;

-- ⚠️ NO AUTOMATIC KP CASE IS CREATED, even when the confirmed outcome is
-- `proceed_to_kp_process`. There is no `kp_cases` table in this migration and
-- no INSERT into one anywhere in this file. P4-A ends at a confirmed
-- screening so that Complaint, Screening and KP Case stay three distinct
-- lifecycle objects; P4-B builds the third.


-- ─── 7. Reading a screening ────────────────────────────────────────────────
--
-- ⚠️ A FIXED NARROW COLUMN LIST, and the private table is never exposed.
-- `prepared_by` and `confirmed_by` are returned as DISPLAY NAMES rather than
-- profile ids: the reader needs to know who prepared and who confirmed, and
-- an auth identifier is not that. Nothing here returns `official_account_links`.

create or replace function public.complaint_screenings_for(p_complaint_id uuid)
returns table (
  id uuid,
  checklist_version text,
  answers jsonb,
  recommendation text,
  recommendation_note text,
  prepared_by_name text,
  prepared_at timestamptz,
  confirmed_outcome text,
  confirmed_by_name text,
  confirmed_at timestamptz,
  confirmation_note text,
  is_open boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  SELECT s.id, s.checklist_version, s.answers,
         s.recommendation, s.recommendation_note,
         pp.full_name AS prepared_by_name, s.prepared_at,
         s.confirmed_outcome,
         pc.full_name AS confirmed_by_name, s.confirmed_at,
         s.confirmation_note,
         (s.confirmed_at IS NULL) AS is_open
  FROM public.complaint_screenings s
  LEFT JOIN public.profiles pp ON pp.id = s.prepared_by
  LEFT JOIN public.profiles pc ON pc.id = s.confirmed_by
  WHERE s.complaint_id = p_complaint_id
    AND public.complaint_screening_is_visible_to_caller(p_complaint_id)
  ORDER BY s.created_at DESC;
$function$;


-- ─── 8. A confirmed screening is immutable ─────────────────────────────────
--
-- ⚠️ DEFENCE IN DEPTH, NOT THE CONTROL. No client holds UPDATE on this table
-- at all, so an API caller cannot reach this trigger -- the privilege layer
-- refuses first with `42501`. It exists so that a confirmed decision cannot
-- be rewritten by a future RPC written without this history in mind, and so
-- the immutability is a property of the TABLE rather than of the three
-- functions that happen to be its only writers today.
--
-- The trusted-caller test is the one every `protect_*` trigger in this
-- project uses, measured rather than copied: `auth.role()` is NULL on a
-- direct connection and `service_role` for the service key, and PostgREST
-- always sets a role claim.

create or replace function public.protect_confirmed_screening()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'A confirmed screening cannot be changed. Prepare a new screening instead.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

-- ⚠️ NO `drop trigger if exists` HERE, AND THAT IS MEASURED RATHER THAN
-- STYLISTIC. This file originally carried one for idempotency, and it is the
-- single statement that made the whole migration un-appliable through the
-- Supabase connector: a one-shot apply timed out at 60 seconds, and
-- `DROP TRIGGER IF EXISTS` on its own reproduced the timeout while
-- `ALTER TABLE ... DROP CONSTRAINT` went straight through three times.
-- So migration 024's original finding is confirmed and the set is narrower
-- than X5 recorded: DROP TRIGGER gates, DROP CONSTRAINT does not.
--
-- The line is simply not needed. The table is created by this same file, so
-- on a first application and on any `001..042` replay there is no trigger to
-- drop. Removing it is correct, not a workaround -- and fragmenting the
-- keyword to get past the guard would be defeating a destructive-statement
-- scan, which is not a thing to do to make a file apply.
create trigger trg_protect_confirmed_screening
  before update on public.complaint_screenings
  for each row execute function public.protect_confirmed_screening();


-- ─── 9. EXECUTE privileges ─────────────────────────────────────────────────
--
-- ⚠️ PUBLIC FIRST, AND IT IS THE LOAD-BEARING REVOKE — migration 038's
-- lesson. A new function in `public` is created with `anon=X |
-- authenticated=X | service_role=X` from `pg_default_acl` PLUS PostgreSQL's
-- own built-in PUBLIC EXECUTE, so revoking the named roles alone would leave
-- `has_function_privilege('anon', ...)` answering true through PUBLIC. Every
-- one of these five therefore drops PUBLIC explicitly.
--
-- ⚠️ `anon` GETS NOTHING. No screening surface is public: there is no
-- anonymous read, no anonymous write, and the public tracking RPC is
-- untouched by this migration. That is the difference from P3-A, where
-- `track_complaint` deliberately kept `anon`.
--
-- ⚠️ `authenticated` is granted on the three RPCs and the two helpers, and
-- the FUNCTIONS decide what a caller may actually do -- holding EXECUTE on
-- `confirm_complaint_screening` buys a Kagawad a `P0001`, not a
-- confirmation. The alternative, granting EXECUTE per position, is not
-- expressible: PostgreSQL grants to database roles, and every signed-in
-- official is the same `authenticated` role.

revoke execute on function public.complaint_screening_checklist_keys(text) from public, anon;
revoke execute on function public.complaint_screening_is_visible_to_caller(uuid) from public, anon;
revoke execute on function public.prepare_complaint_screening(uuid, text, jsonb, text, text) from public, anon;
revoke execute on function public.confirm_complaint_screening(uuid, text, text) from public, anon;
revoke execute on function public.complaint_screenings_for(uuid) from public, anon;

-- ⚠️ The trigger function is reachable by NO client role. A trigger does not
-- consult the caller's EXECUTE privilege -- measured in migration 034 in both
-- directions -- so revoking here stops a direct call without stopping the
-- trigger from firing.
revoke execute on function public.protect_confirmed_screening() from public, anon, authenticated;

grant execute on function public.complaint_screening_checklist_keys(text) to authenticated;
grant execute on function public.complaint_screening_is_visible_to_caller(uuid) to authenticated;
grant execute on function public.prepare_complaint_screening(uuid, text, jsonb, text, text) to authenticated;
grant execute on function public.confirm_complaint_screening(uuid, text, text) to authenticated;
grant execute on function public.complaint_screenings_for(uuid) to authenticated;
