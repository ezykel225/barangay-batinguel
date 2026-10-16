-- ============================================================================
-- 043_kp_case_hearings_summons.sql
--
-- COMBINED PHASE 1 — KP CASE CORE + HEARINGS + SUMMONS MVP
--
-- STATUS: APPLIED 2026-10-16, through the Supabase connector in SEVEN
--         `apply_migration` calls, each returning success:
--
--           1. kp_case_hearings_summons_tables   the four tables, indexes,
--                                                RLS, revokes, comments
--           2. kp_case_reference_and_predicate   generate_kp_case_reference,
--                                                stamp_kp_case_reference +
--                                                its trigger,
--                                                kp_case_is_visible_to_caller
--           3. kp_open_case_and_panel            open_kp_case,
--                                                assign_kp_panel_member
--           4. kp_hearing_write_rpcs             schedule_kp_hearing,
--                                                update_kp_hearing_record,
--                                                record_kp_attendance,
--                                                record_kp_hearing_outcome
--           5. kp_case_readers                   the five reader functions
--           6. kp_protect_record_trigger         protect_kp_record + both
--                                                BEFORE UPDATE triggers
--           7. kp_case_execute_surface           the 15 revokes and 11 grants
--           8. kp_protect_record_nested_branches  ⚠️ A CORRECTION, below
--
--         ⚠️ CALL 8 FIXED A REAL DEFECT IN CALL 6, found by impersonation
--         rather than by reading. `protect_kp_record()` serves both tables
--         and tested each with a flat `TG_TABLE_NAME = ... AND OLD....`.
--         PL/pgSQL hands that whole boolean to the SQL executor, which
--         resolves `OLD.outcome` whether or not the left side is true --
--         and a `kp_cases` row has no such column. So EVERY API update to
--         a case raised `42703 record "old" has no field "outcome"`,
--         breaking `schedule_kp_hearing()` (it moves the case `open` ->
--         `in_process`) and concluding a case.
--
--         It read as a permission failure until SQLERRM was printed: the
--         SQLSTATE was `42703`, not `P0001`. The branches are nested now,
--         so a column is only ever named for the table that has it, and
--         `kpCaseMigration.test.js` carries a source guard over that
--         shape -- verified in both directions, since no Jest test can
--         reach the runtime behaviour itself.
--
--         ⚠️ SPLIT BECAUSE OF THE CONNECTOR, NOT FOR STYLE. 042 was applied
--         in six calls for the same reason, and the consequence is recorded
--         in the P4-A review addendum: the connector reflows a function body
--         and shortens a long `COMMENT ON` string, so the LIVE text of these
--         objects is semantically identical to this file rather than
--         byte-identical to it. This file remains the authority on intent.
--
--         VERIFIED from the catalog immediately after applying:
--           * four tables, `relrowsecurity = true`, **zero** policies each,
--             ACL `postgres` + `service_role` only
--           * 15 functions, all `prosecdef`, all `search_path=""`
--           * PUBLIC EXECUTE: **0 of 15** — and **0** across all 58
--             SECURITY DEFINER functions in `public`, so B5 still holds
--           * `anon` EXECUTE: **0 of 15**; the project total is unchanged
--           * `authenticated` EXECUTE: the **11** client functions and
--             **none** of the four internal ones
--           * three triggers: trg_stamp_kp_case_reference,
--             trg_protect_kp_case, trg_protect_kp_hearing
--           * all four tables **0 rows**
--
-- ============================================================================
-- ⚠️ WHAT THIS PHASE IS, AND WHAT IT STILL IS NOT
-- ============================================================================
--
-- It makes ONE flow demonstrable end to end:
--
--   a human-confirmed screening (042)
--     -> a human opens a KP case
--     -> a panel is recorded administratively
--     -> a hearing is scheduled
--     -> a summons / hearing notice is printed from factual data
--     -> attendance or non-appearance is recorded
--     -> minutes and ONE proceeding outcome are recorded by a human
--
-- It still decides NOTHING. As in 042, there is no function here that
-- derives eligibility, an outcome or a disposition: every one of those is a
-- parameter a human supplies, and a source-reading test asserts no such
-- mapping exists.
--
-- ⚠️ COMPLAINT != SCREENING != KP CASE, and this migration keeps all three
-- distinct. `complaints.status` is NOT widened again: a complaint that has
-- become a case still reads `screened`, because that is the stage the
-- COMPLAINT reached, and the case carries its own status. Two columns
-- meaning one fact is what 042 refused and what `displayLabels.js` already
-- cost this project once. The consequence to know: nothing resident-facing
-- changes in this phase at all.
--
-- ⚠️ NO AUTOMATIC CASE CREATION. 042's `confirm_complaint_screening()` is
-- NOT touched and gains no branch: confirming a screening with
-- `proceed_to_kp_process` creates nothing. An authorized human must open
-- the case explicitly, which is the whole of §1's rule.
--
-- ============================================================================
-- ⚠️ PROVISIONAL WORKFLOW — FOR BARANGAY CONFIRMATION
-- ============================================================================
--
-- The authorization split below is the capstone brief's workflow decision for
-- this phase. It is NOT a proven legal requirement, and P2.5 established that
-- this system holds NO record of a Lupon, Justice or Katarungan committee --
-- so nothing here infers who is legally entitled to conduct a proceeding.
--
--   Punong Barangay   opens a case · records a proceeding OUTCOME
--   Barangay Secretary administers records · schedules · prints notices ·
--                      records attendance and minutes
--   both               may schedule and may administer the hearing record
--   anybody else       nothing, including an ordinary Kagawad
--
-- ⚠️ `barangay_officials.committee` AUTHORIZES NOTHING HERE, for the reason
-- P3-A recorded and P4-A re-measured: it is free text with no CHECK that any
-- official may write on any row, and `protect_official_record()` does not
-- guard it, so authorizing on it would reproduce migration 028's escalation
-- on an unguarded column. A real `Peace and Order and Appropriation` value
-- exists on one Kagawad and it grants nothing. The word appears in this file
-- only in these comments, and a test scans the comment-stripped code.
--
-- ⚠️ NO NAME IS EVER AN IDENTITY KEY. Every authorization resolves through
-- `current_official_holds_position()`, which goes through the private
-- `official_account_links` mapping (031). `is_official()` is NOT broadened
-- and NOT called here.
--
-- ⚠️ NO CAPABILITY TABLE. The two positions above are enough for this
-- implementation, so building a capability-assignment table would be the
-- dormant authorization infrastructure P3-A and P4-A both declined.
--
-- ⚠️ NO TANOD ANYTHING: no table, no role, no login, no reference.
--
-- ============================================================================
-- ⚠️ NO STATUTORY CONTENT
-- ============================================================================
--
-- This file hardcodes no statutory deadline, no day limit, no repudiation
-- period, no penalty threshold, no certificate-to-file requirement and no
-- legal wording. The proceeding types and outcomes below are this system's
-- own small administrative vocabulary, each naming what the barangay DID or
-- WILL DO rather than a finding about the law -- the same test every word in
-- 042 had to pass. There is no numeric comparison in any CHECK in this file,
-- because a threshold is a number.
--
-- ============================================================================
-- WHAT IT CREATES
-- ============================================================================
--
--   kp_cases                one case per complaint, opened by a human
--   kp_case_panel           administrative panel record, UNCONFIRMED roster
--   kp_hearings             the proceedings, their status, minutes, outcome
--   kp_hearing_attendance   attendance / non-appearance, per party per hearing
--
-- ⚠️ THERE IS DELIBERATELY NO `kp_case_parties` TABLE. `complaint_parties`
-- (040) already carries exactly what a case party needs -- `party_role`
-- constrained to complainant/respondent/witness, a NOT NULL
-- `full_name_snapshot`, `contact_number_snapshot`, `address_note` and the
-- optional `profile_id` / `registry_entry_id` links -- and a case is opened
-- from exactly ONE complaint. A second party table would be a copy of the
-- same names that can drift from the one the parties actually gave, which is
-- the objection this project makes to every second store. Attendance
-- therefore keys straight to `complaint_parties.id`, and the integrity check
-- that a party belongs to THIS case's complaint is enforced in the RPC.
--
-- All four tables are PRIVATE on 019A's two-barrier pattern: RLS enabled,
-- ZERO policies, and every table privilege revoked from `anon` and
-- `authenticated`, so a client attempt is `42501` at the privilege layer
-- before RLS is consulted -- which is the stronger result, because RLS alone
-- returns an empty set that cannot be told from "there are no rows".
-- ============================================================================


-- ─── 1. The case ───────────────────────────────────────────────────────────

create table if not exists public.kp_cases (
  id uuid primary key default gen_random_uuid(),

  -- Server-stamped, random, never sequential. See the generator below.
  reference text not null unique,

  -- ⚠️ UNIQUE, AND THAT IS THE DUPLICATE-CASE GUARD. One complaint can give
  -- rise to at most one KP case, in the database rather than by convention.
  -- The RPC also checks and raises a readable sentence first, so the guard
  -- holds even if a future writer forgets -- belt and braces, as 042's
  -- self-confirm guard is.
  complaint_id uuid not null unique
    references public.complaints(id) on delete restrict,

  -- ⚠️ PROVENANCE: the exact confirmed screening that authorized this case.
  -- Recorded so a reader can see WHICH human decision opened it, and so the
  -- link survives a later re-screening of the same complaint.
  screening_id uuid not null
    references public.complaint_screenings(id) on delete restrict,

  -- open        opened, nothing scheduled yet
  -- in_process  at least one hearing has been scheduled
  -- concluded   a human recorded that a proceeding concluded the case
  status text not null default 'open',

  opened_by uuid not null references public.profiles(id) on delete restrict,
  opened_at timestamptz not null default now(),
  opening_note text,

  -- ⚠️ All three together or none, exactly as 042's confirmation columns:
  -- there is no state in which the database holds a conclusion nobody made.
  concluded_by uuid references public.profiles(id) on delete restrict,
  concluded_at timestamptz,
  conclusion_note text,

  created_at timestamptz not null default now(),

  constraint kp_cases_status_check check (
    status = any (array['open', 'in_process', 'concluded'])
  ),

  constraint kp_cases_conclusion_complete check (
    (concluded_by is null and concluded_at is null)
    or
    (concluded_by is not null and concluded_at is not null)
  ),

  -- ⚠️ The status and the conclusion stamps cannot disagree.
  constraint kp_cases_concluded_has_stamps check (
    (status = 'concluded') = (concluded_at is not null)
  )
);

create index if not exists kp_cases_complaint_idx
  on public.kp_cases (complaint_id);
create index if not exists kp_cases_status_idx
  on public.kp_cases (status, opened_at desc);

alter table public.kp_cases enable row level security;
revoke all on table public.kp_cases from anon, authenticated, public;

comment on table public.kp_cases is
  'Combined Phase 1. One KP case per complaint, opened explicitly by the '
  'Punong Barangay from a human-confirmed proceed_to_kp_process screening. '
  'PRIVATE: zero policies, zero client privilege. Nothing here decides '
  'eligibility -- the screening already recorded a human decision and this '
  'records a human act. complaint_id is UNIQUE: that is the duplicate guard.';

comment on column public.kp_cases.screening_id is
  'The exact confirmed screening that authorized this case. Provenance, not '
  'authorization: the RPC re-derives the LATEST screening itself rather than '
  'trusting a caller-supplied id.';


-- ─── 2. The panel — administrative, and UNCONFIRMED ────────────────────────
--
-- ⚠️ THIS ROSTER IS NOT EVIDENCE OF LUPON MEMBERSHIP, and the system has no
-- record from which it could be. P2.5 found no Lupon, Justice or Katarungan
-- committee stored anywhere, and §3's rule is that not every barangay
-- official is a Lupon member -- so this table records what an authorized
-- official TYPED for a case, marked as requiring barangay confirmation, and
-- fabricates nobody.
--
-- ⚠️ DELIBERATELY NOT LINKED TO `barangay_officials`. A foreign key there
-- would assert that the named person is an official acting as a panel
-- member, which is exactly the inference this project refuses to make
-- without a record -- the same reasoning `barangay_term_members` uses for
-- historical rosters, which store names as plain text with no link.
--
-- ⚠️ NO NAME IS HARDCODED anywhere in this file.

create table if not exists public.kp_case_panel (
  id uuid primary key default gen_random_uuid(),

  case_id uuid not null references public.kp_cases(id) on delete restrict,

  -- Typed by the official recording it. Plain text, by decision.
  member_name text not null,

  -- chairperson | member. A Pangkat is conventionally three people; the RPC
  -- caps a case at three and permits one chairperson, which is where a count
  -- rule can live (a CHECK cannot count rows).
  panel_role text not null default 'member',

  assigned_by uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),

  constraint kp_case_panel_name_present check (btrim(member_name) <> ''),
  constraint kp_case_panel_role_check check (
    panel_role = any (array['chairperson', 'member'])
  ),
  constraint kp_case_panel_no_duplicate_member unique (case_id, member_name)
);

-- One chairperson per case.
create unique index if not exists kp_case_panel_one_chair_per_case
  on public.kp_case_panel (case_id)
  where panel_role = 'chairperson';

create index if not exists kp_case_panel_case_idx
  on public.kp_case_panel (case_id, assigned_at);

alter table public.kp_case_panel enable row level security;
revoke all on table public.kp_case_panel from anon, authenticated, public;

comment on table public.kp_case_panel is
  'Combined Phase 1. ADMINISTRATIVE panel record for one case, REQUIRING '
  'BARANGAY CONFIRMATION. Names are plain text typed by an authorized '
  'official and are deliberately NOT linked to barangay_officials: this '
  'system holds no record of Lupon membership and must not assert one. '
  'PRIVATE: zero policies, zero client privilege.';


-- ─── 3. The hearings ───────────────────────────────────────────────────────
--
-- ⚠️ NO STATUTORY DEADLINE IS ENCODED. There is no rule here about how soon
-- a hearing must sit, how many may sit, or how long the process may run.
--
-- ⚠️ IT DOES NOT TOUCH `reservations` OR `official_availability`. A KP
-- hearing is not a covered-court booking and not a consultation slot: the
-- court's exclusion constraint, its 5-10 PM window and the officials' own
-- availability rules are all untouched, and nothing here reads or writes
-- either table. A hearing's date, time and location are free values an
-- official records, so scheduling one cannot break a booking.

create table if not exists public.kp_hearings (
  id uuid primary key default gen_random_uuid(),

  case_id uuid not null references public.kp_cases(id) on delete restrict,

  -- mediation        | the Punong Barangay's own proceeding
  -- pangkat_hearing  | a proceeding before the recorded panel
  -- other            | anything the barangay schedules that is neither
  -- ⚠️ Descriptive of what was scheduled. Claims no statutory effect.
  proceeding_type text not null,

  hearing_date date not null,
  start_time time without time zone not null,
  location text not null,

  -- scheduled | completed | cancelled | rescheduled
  status text not null default 'scheduled',

  -- ⚠️ FREE TEXT, because the system cannot establish who may preside. It
  -- records what an official wrote, and fabricates nothing.
  presiding_note text,

  admin_notes text,
  minutes text,

  -- ⚠️ ONE human-recorded proceeding outcome, Punong-only, and all three
  -- stamps together or none -- 042's shape.
  outcome text,
  outcome_recorded_by uuid references public.profiles(id) on delete restrict,
  outcome_recorded_at timestamptz,
  outcome_note text,

  scheduled_by uuid not null references public.profiles(id) on delete restrict,
  scheduled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint kp_hearings_type_check check (
    proceeding_type = any (array['mediation', 'pangkat_hearing', 'other'])
  ),

  constraint kp_hearings_status_check check (
    status = any (array['scheduled', 'completed', 'cancelled', 'rescheduled'])
  ),

  constraint kp_hearings_location_present check (btrim(location) <> ''),

  -- ⚠️ This system's own administrative vocabulary. Each value names what
  -- happened or what the barangay will do next, never a legal finding.
  -- DELIBERATELY ABSENT: settled, amicable_settlement, conciliation,
  -- certificate_to_file_action, repudiated, dismissed -- deferred concepts
  -- and legal conclusions alike.
  constraint kp_hearings_outcome_check check (
    outcome is null or outcome = any (array[
      'unresolved_continue_process',
      'resolved_agreement_recorded',
      'referral_needed',
      'further_hearing_needed'
    ])
  ),

  constraint kp_hearings_outcome_complete check (
    (outcome is null and outcome_recorded_by is null and outcome_recorded_at is null)
    or
    (outcome is not null and outcome_recorded_by is not null and outcome_recorded_at is not null)
  )
);

create index if not exists kp_hearings_case_idx
  on public.kp_hearings (case_id, hearing_date, start_time);

alter table public.kp_hearings enable row level security;
revoke all on table public.kp_hearings from anon, authenticated, public;

comment on table public.kp_hearings is
  'Combined Phase 1. Scheduled proceedings for a KP case, their status, '
  'minutes and ONE human-recorded outcome. No statutory deadline is encoded. '
  'Does not touch reservations or official_availability. PRIVATE: zero '
  'policies, zero client privilege.';

comment on column public.kp_hearings.outcome is
  'What a human recorded about the proceeding. Never derived from attendance, '
  'from the screening answers, or from anything else.';


-- ─── 4. Attendance and non-appearance ──────────────────────────────────────
--
-- ⚠️ KEYED TO `complaint_parties.id`, not to a duplicate party table. See
-- the header. The RPC checks that the party belongs to THIS case's
-- complaint, which a foreign key alone cannot express.

create table if not exists public.kp_hearing_attendance (
  id uuid primary key default gen_random_uuid(),

  hearing_id uuid not null references public.kp_hearings(id) on delete restrict,
  party_id uuid not null references public.complaint_parties(id) on delete restrict,

  -- present | absent | excused
  attendance text not null,
  attendance_note text,

  recorded_by uuid not null references public.profiles(id) on delete restrict,
  recorded_at timestamptz not null default now(),

  constraint kp_attendance_value_check check (
    attendance = any (array['present', 'absent', 'excused'])
  ),

  -- One record per party per hearing. Re-recording UPDATES it.
  constraint kp_attendance_one_per_party unique (hearing_id, party_id)
);

create index if not exists kp_hearing_attendance_hearing_idx
  on public.kp_hearing_attendance (hearing_id);

alter table public.kp_hearing_attendance enable row level security;
revoke all on table public.kp_hearing_attendance from anon, authenticated, public;

comment on table public.kp_hearing_attendance is
  'Combined Phase 1. Attendance or non-appearance of one complaint party at '
  'one hearing. Keyed to complaint_parties rather than duplicating the party '
  'list. PRIVATE: zero policies, zero client privilege.';


-- ─── 5. The case reference ─────────────────────────────────────────────────
--
-- ⚠️ RANDOM, NEVER SEQUENTIAL, and server-stamped. The same reasoning as
-- 024's booking reference and 040's complaint reference: a sequential public
-- number tells anybody holding one that the neighbouring numbers exist.
--
-- ⚠️ `KP-`, not `CMP-` or `BCR-`. Three references now exist in this system
-- and two sharing a prefix is a hazard when somebody reads one out.
--
-- Crockford base32 with I, L, O and U removed, exactly as the other two use,
-- so a reference read over the phone has no look-alikes in it.

create or replace function public.generate_kp_case_reference(p_year int)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
DECLARE
  k_alphabet CONSTANT text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_body text; v_bytes bytea; i int;
BEGIN
  v_body := '';
  v_bytes := extensions.gen_random_bytes(6);
  FOR i IN 0..5 LOOP
    v_body := v_body || substr(k_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  END LOOP;
  RETURN 'KP-' || p_year::text || '-' || v_body;
END;
$function$;

comment on function public.generate_kp_case_reference(int) is
  'Combined Phase 1. Random KP-YYYY-XXXXXX case reference. Never sequential. '
  'Internal: no client EXECUTE -- reached only through the stamping trigger.';


-- ⚠️ The reference is NOT a parameter of the opening RPC and this trigger
-- overwrites whatever the row carries -- 015's pattern, where what a client
-- sent is discarded rather than validated. Collision retries against the
-- UNIQUE constraint, then raises rather than writing a silent duplicate.
create or replace function public.stamp_kp_case_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
DECLARE
  v_year int; v_candidate text; v_attempt int := 0;
BEGIN
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::int;
  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := public.generate_kp_case_reference(v_year);
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.kp_cases k WHERE k.reference = v_candidate
    );
    IF v_attempt >= 10 THEN
      RAISE EXCEPTION 'Could not allocate a unique KP case reference after % attempts', v_attempt
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  NEW.reference := v_candidate;
  RETURN NEW;
END;
$function$;

-- ⚠️ NO `drop trigger if exists` HERE, and that is measured rather than
-- stylistic: P4-A established that `DROP TRIGGER IF EXISTS` is what the
-- connector's destructive-statement scan gates, timing the whole call out at
-- 60 seconds while executing nothing. It is unnecessary on a first apply and
-- unnecessary on a replay, because the `create table if not exists` above
-- means a replay finds the trigger already attached to a table it did not
-- recreate. The keyword is not fragmented to get past the guard.
create trigger trg_stamp_kp_case_reference
  before insert on public.kp_cases
  for each row execute function public.stamp_kp_case_reference();


-- ─── 6. Who may see KP case records ────────────────────────────────────────
--
-- ⚠️ THE SAME TWO POSITIONS AS THE SCREENING, and that is deliberate rather
-- than copied: a case file contains the parties, the hearing minutes and the
-- panel, which is at least as restricted as the screening that authorized
-- it. So this predicate is as narrow as
-- `complaint_screening_is_visible_to_caller()` and, like it, is NARROWER
-- than `complaint_is_visible_to_caller()` -- which admits the FILING
-- RESIDENT, and a complainant must not read the barangay's internal case
-- administration.
--
-- ⚠️ INTERNAL ONLY, AND TIGHTER THAN 042's EQUIVALENT. Every caller of this
-- predicate is itself a SECURITY DEFINER function in this file, where the
-- nested EXECUTE check is made as the DEFINER rather than as the original
-- caller -- so `authenticated` needs no grant on it at all, and does not get
-- one. 042 granted its predicate to `authenticated`; this one is revoked
-- from all three client roles.
--
-- SECURITY DEFINER is required, not stylistic: it reads through
-- `current_official_holds_position()`, which resolves the private
-- `official_account_links` mapping that no client may read.

create or replace function public.kp_case_is_visible_to_caller(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  SELECT EXISTS (SELECT 1 FROM public.kp_cases k WHERE k.id = p_case_id)
     AND (public.current_official_holds_position('Barangay Secretary')
          OR public.current_official_holds_position('Punong Barangay'));
$function$;

comment on function public.kp_case_is_visible_to_caller(uuid) is
  'Combined Phase 1. The one KP visibility predicate: Barangay Secretary or '
  'Punong Barangay. NARROWER than complaint_is_visible_to_caller(), which '
  'admits the filing resident. Internal: no client EXECUTE.';


-- ─── 7. Opening a case — the Punong Barangay's, and only his ───────────────
--
-- ⚠️ IT TAKES A COMPLAINT, NOT A SCREENING, and that is the eligibility
-- guard rather than a convenience. §1's rule is that the complaint's LATEST
-- screening must be the human-confirmed `proceed_to_kp_process` one, so the
-- function derives that screening itself; a caller cannot hand it a stale or
-- cherry-picked screening id to get past the check.
--
-- ⚠️ ELIGIBILITY IS READ FROM THE HUMAN CONFIRMATION, NEVER FROM THE
-- ANSWERS. The checklist answers are not read here at all -- a test asserts
-- this function does not mention them. What it requires is that a human
-- confirmed, and what they confirmed.
--
-- ⚠️ NOTHING CALLS THIS AUTOMATICALLY. 042's confirming function is
-- untouched and has no branch that reaches it.

create or replace function public.open_kp_case(
  p_complaint_id uuid,
  p_note text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
DECLARE
  v_uid uuid := auth.uid();
  v_screening_id uuid;
  v_outcome text;
  v_confirmed_at timestamptz;
  v_reference text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to open a KP case.'
      USING ERRCODE = 'P0001';
  END IF;

  -- The provisional final authority for this phase, resolved through
  -- official_account_links. Not a committee, not a name, not a UI flag.
  IF NOT public.current_official_holds_position('Punong Barangay') THEN
    RAISE EXCEPTION 'Only the Punong Barangay can open a KP case.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = p_complaint_id) THEN
    RAISE EXCEPTION 'That complaint does not exist.' USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ Readable first, then the UNIQUE constraint behind it.
  IF EXISTS (SELECT 1 FROM public.kp_cases k WHERE k.complaint_id = p_complaint_id) THEN
    RAISE EXCEPTION 'A KP case has already been opened for this complaint.'
      USING ERRCODE = 'P0001';
  END IF;

  -- THE LATEST screening, by the same ordering the reader uses.
  SELECT s.id, s.confirmed_outcome, s.confirmed_at
    INTO v_screening_id, v_outcome, v_confirmed_at
  FROM public.complaint_screenings s
  WHERE s.complaint_id = p_complaint_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_screening_id IS NULL THEN
    RAISE EXCEPTION 'This complaint has no screening yet.' USING ERRCODE = 'P0001';
  END IF;

  IF v_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'This complaint''s latest screening has not been confirmed yet.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ The ONE permitted confirmed outcome. The other three are refused
  -- here, not filtered in the UI.
  IF v_outcome IS DISTINCT FROM 'proceed_to_kp_process' THEN
    RAISE EXCEPTION 'A KP case can only be opened when the confirmed screening says to proceed with the KP process.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.kp_cases (
    reference, complaint_id, screening_id, status, opened_by, opened_at, opening_note)
  VALUES (
    'PENDING', p_complaint_id, v_screening_id, 'open', v_uid, now(),
    NULLIF(btrim(COALESCE(p_note, '')), ''))
  RETURNING reference INTO v_reference;

  RETURN v_reference;
END;
$function$;

comment on function public.open_kp_case(uuid, text) is
  'Combined Phase 1. Punong-Barangay-only. Opens ONE case from a complaint '
  'whose LATEST screening a human confirmed as proceed_to_kp_process. Takes '
  'a complaint rather than a screening so no stale screening can be '
  'cherry-picked. Reads no checklist answer. Never called automatically.';


-- ─── 8. The panel — administrative assignment ──────────────────────────────

create or replace function public.assign_kp_panel_member(
  p_case_id uuid,
  p_member_name text,
  p_panel_role text default 'member'
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
  v_count int;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to record a panel member.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Administrative records: either position may keep them.
  IF NOT (public.current_official_holds_position('Barangay Secretary')
          OR public.current_official_holds_position('Punong Barangay')) THEN
    RAISE EXCEPTION 'This account cannot record a KP panel member.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT k.status INTO v_status FROM public.kp_cases k WHERE k.id = p_case_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'That KP case does not exist.' USING ERRCODE = 'P0001';
  END IF;
  IF v_status = 'concluded' THEN
    RAISE EXCEPTION 'That KP case has been concluded.' USING ERRCODE = 'P0001';
  END IF;

  IF p_member_name IS NULL OR btrim(p_member_name) = '' THEN
    RAISE EXCEPTION 'A panel member needs a name.' USING ERRCODE = 'P0001';
  END IF;

  IF p_panel_role IS NULL OR p_panel_role NOT IN ('chairperson', 'member') THEN
    RAISE EXCEPTION 'A panel role must be chairperson or member.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ THREE, because a Pangkat is conventionally a three-person panel. A
  -- CHECK cannot count rows, so the rule lives here -- and it is a cap on an
  -- administrative record, not a statutory assertion.
  SELECT count(*) INTO v_count FROM public.kp_case_panel p WHERE p.case_id = p_case_id;
  IF v_count >= 3 THEN
    RAISE EXCEPTION 'A panel records at most three people.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.kp_case_panel (case_id, member_name, panel_role, assigned_by, assigned_at)
  VALUES (p_case_id, btrim(p_member_name), p_panel_role, v_uid, now())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

comment on function public.assign_kp_panel_member(uuid, text, text) is
  'Combined Phase 1. Secretary or Punong Barangay. Records an ADMINISTRATIVE '
  'panel name for a case, capped at three with one chairperson. The roster '
  'REQUIRES BARANGAY CONFIRMATION and asserts no Lupon membership.';


-- ─── 9. Scheduling a hearing ───────────────────────────────────────────────
--
-- ⚠️ §2 gives scheduling to BOTH: the Punong Barangay authorizes a
-- proceeding and the Secretary schedules approved ones, and the system has
-- no way to tell "approved by the Punong" from "scheduled by the Secretary"
-- apart from who called it -- which the row records. So both positions may
-- call this, and `scheduled_by` says which one did.
--
-- ⚠️ IT MOVES THE CASE open -> in_process, which is a FACT about the case
-- (a hearing now exists) rather than a judgment about it. Nothing else moves
-- the status except an explicit human conclusion.

create or replace function public.schedule_kp_hearing(
  p_case_id uuid,
  p_proceeding_type text,
  p_hearing_date date,
  p_start_time time,
  p_location text,
  p_presiding_note text default null,
  p_admin_notes text default null
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
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to schedule a hearing.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (public.current_official_holds_position('Barangay Secretary')
          OR public.current_official_holds_position('Punong Barangay')) THEN
    RAISE EXCEPTION 'This account cannot schedule a KP hearing.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT k.status INTO v_status FROM public.kp_cases k WHERE k.id = p_case_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'That KP case does not exist.' USING ERRCODE = 'P0001';
  END IF;
  IF v_status = 'concluded' THEN
    RAISE EXCEPTION 'That KP case has been concluded.' USING ERRCODE = 'P0001';
  END IF;

  IF p_proceeding_type IS NULL
     OR p_proceeding_type NOT IN ('mediation', 'pangkat_hearing', 'other') THEN
    RAISE EXCEPTION 'Unknown proceeding type.' USING ERRCODE = 'P0001';
  END IF;

  IF p_hearing_date IS NULL THEN
    RAISE EXCEPTION 'A hearing needs a date.' USING ERRCODE = 'P0001';
  END IF;
  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'A hearing needs a start time.' USING ERRCODE = 'P0001';
  END IF;
  IF p_location IS NULL OR btrim(p_location) = '' THEN
    RAISE EXCEPTION 'A hearing needs a location.' USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ NO DEADLINE RULE. The date is not checked against the complaint's
  -- date, the screening's date or any statutory period, because no such
  -- period is established for this barangay. An official schedules what they
  -- schedule.
  INSERT INTO public.kp_hearings (
    case_id, proceeding_type, hearing_date, start_time, location,
    status, presiding_note, admin_notes, scheduled_by, scheduled_at)
  VALUES (
    p_case_id, p_proceeding_type, p_hearing_date, p_start_time, btrim(p_location),
    'scheduled',
    NULLIF(btrim(COALESCE(p_presiding_note, '')), ''),
    NULLIF(btrim(COALESCE(p_admin_notes, '')), ''),
    v_uid, now())
  RETURNING id INTO v_id;

  IF v_status = 'open' THEN
    UPDATE public.kp_cases k SET status = 'in_process' WHERE k.id = p_case_id;
  END IF;

  RETURN v_id;
END;
$function$;

comment on function public.schedule_kp_hearing(uuid, text, date, time, text, text, text) is
  'Combined Phase 1. Secretary or Punong Barangay. Schedules one proceeding '
  'and moves the case open -> in_process. Encodes no statutory deadline and '
  'does not touch reservations or official_availability.';


-- ─── 10. Administering the hearing record ──────────────────────────────────
--
-- ⚠️ ONE FUNCTION FOR THE ADMINISTRATIVE RECORD -- status, minutes and
-- notes -- because they are the same job (§2: the Secretary "administers
-- records"), and three RPCs for three columns would be three surfaces to
-- authorize instead of one.
--
-- ⚠️ IT CANNOT RECORD AN OUTCOME. That is the Punong's own function below,
-- and this one refuses to touch a hearing whose outcome is already recorded.

create or replace function public.update_kp_hearing_record(
  p_hearing_id uuid,
  p_status text default null,
  p_minutes text default null,
  p_admin_notes text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
DECLARE
  v_uid uuid := auth.uid();
  v_outcome text;
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to update a hearing record.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (public.current_official_holds_position('Barangay Secretary')
          OR public.current_official_holds_position('Punong Barangay')) THEN
    RAISE EXCEPTION 'This account cannot update a KP hearing record.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT true, h.outcome INTO v_exists, v_outcome
  FROM public.kp_hearings h WHERE h.id = p_hearing_id;
  IF v_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'That hearing does not exist.' USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ A recorded outcome closes the record. A correction is a new hearing,
  -- not a rewrite -- the same rule 042 applies to a confirmed screening.
  IF v_outcome IS NOT NULL THEN
    RAISE EXCEPTION 'This hearing already has a recorded outcome and cannot be changed.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_status IS NOT NULL
     AND p_status NOT IN ('scheduled', 'completed', 'cancelled', 'rescheduled') THEN
    RAISE EXCEPTION 'Unknown hearing status.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.kp_hearings h
     SET status      = COALESCE(p_status, h.status),
         minutes     = COALESCE(NULLIF(btrim(COALESCE(p_minutes, '')), ''), h.minutes),
         admin_notes = COALESCE(NULLIF(btrim(COALESCE(p_admin_notes, '')), ''), h.admin_notes)
   WHERE h.id = p_hearing_id;

  RETURN p_hearing_id;
END;
$function$;

comment on function public.update_kp_hearing_record(uuid, text, text, text) is
  'Combined Phase 1. Secretary or Punong Barangay. Administers one hearing '
  'record: status, minutes and notes. Cannot record an outcome, and refuses '
  'a hearing whose outcome is already recorded.';


-- ─── 11. Attendance and non-appearance ─────────────────────────────────────
--
-- ⚠️ THE PARTY MUST BELONG TO THIS CASE'S COMPLAINT. A foreign key to
-- `complaint_parties` alone would permit recording ANY complaint's party as
-- attending THIS hearing, which would attach a stranger's name to a case
-- file. That cross-check is the reason this is an RPC and not an insert.

create or replace function public.record_kp_attendance(
  p_hearing_id uuid,
  p_party_id uuid,
  p_attendance text,
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
  v_outcome text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to record attendance.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT (public.current_official_holds_position('Barangay Secretary')
          OR public.current_official_holds_position('Punong Barangay')) THEN
    RAISE EXCEPTION 'This account cannot record KP hearing attendance.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT k.complaint_id, h.outcome INTO v_complaint_id, v_outcome
  FROM public.kp_hearings h
  JOIN public.kp_cases k ON k.id = h.case_id
  WHERE h.id = p_hearing_id;

  IF v_complaint_id IS NULL THEN
    RAISE EXCEPTION 'That hearing does not exist.' USING ERRCODE = 'P0001';
  END IF;

  IF v_outcome IS NOT NULL THEN
    RAISE EXCEPTION 'This hearing already has a recorded outcome and cannot be changed.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_attendance IS NULL OR p_attendance NOT IN ('present', 'absent', 'excused') THEN
    RAISE EXCEPTION 'Attendance must be present, absent or excused.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ The cross-check this function exists for.
  IF NOT EXISTS (
    SELECT 1 FROM public.complaint_parties cp
     WHERE cp.id = p_party_id AND cp.complaint_id = v_complaint_id
  ) THEN
    RAISE EXCEPTION 'That person is not a party to this case.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.kp_hearing_attendance (
    hearing_id, party_id, attendance, attendance_note, recorded_by, recorded_at)
  VALUES (
    p_hearing_id, p_party_id, p_attendance,
    NULLIF(btrim(COALESCE(p_note, '')), ''), v_uid, now())
  ON CONFLICT (hearing_id, party_id) DO UPDATE
     SET attendance = EXCLUDED.attendance,
         attendance_note = EXCLUDED.attendance_note,
         recorded_by = EXCLUDED.recorded_by,
         recorded_at = EXCLUDED.recorded_at
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

comment on function public.record_kp_attendance(uuid, uuid, text, text) is
  'Combined Phase 1. Secretary or Punong Barangay. Records one party''s '
  'attendance or non-appearance, and CHECKS that the party belongs to this '
  'case''s complaint -- which a foreign key alone cannot express.';


-- ─── 12. The proceeding outcome — the Punong Barangay's ────────────────────
--
-- ⚠️ HUMAN-RECORDED, AND NEVER DERIVED. Nothing here reads the attendance,
-- the minutes, the panel or the screening answers to produce the outcome: it
-- is a parameter, and a test asserts no function in this file maps anything
-- to it.
--
-- ⚠️ WHETHER THIS CONCLUDES THE CASE IS ALSO THE HUMAN'S, as an explicit
-- parameter rather than a rule inferred from the outcome value. Deriving
-- "resolved therefore concluded" would be the software deciding the case is
-- over, which is precisely what it must not do.

create or replace function public.record_kp_hearing_outcome(
  p_hearing_id uuid,
  p_outcome text,
  p_note text default null,
  p_concludes_case boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
DECLARE
  v_uid uuid := auth.uid();
  v_case_id uuid;
  v_existing text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to record a proceeding outcome.'
      USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ The Punong Barangay alone, per §2. The Secretary is refused here even
  -- though she administers every other part of the record.
  IF NOT public.current_official_holds_position('Punong Barangay') THEN
    RAISE EXCEPTION 'Only the Punong Barangay can record a proceeding outcome.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT h.case_id, h.outcome INTO v_case_id, v_existing
  FROM public.kp_hearings h WHERE h.id = p_hearing_id;

  IF v_case_id IS NULL THEN
    RAISE EXCEPTION 'That hearing does not exist.' USING ERRCODE = 'P0001';
  END IF;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'This hearing already has a recorded outcome.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_outcome IS NULL OR p_outcome NOT IN (
    'unresolved_continue_process', 'resolved_agreement_recorded',
    'referral_needed', 'further_hearing_needed'
  ) THEN
    RAISE EXCEPTION 'Unknown proceeding outcome.' USING ERRCODE = 'P0001';
  END IF;

  -- Actor and timestamp from the caller's own token and the server clock.
  -- Neither is a parameter. The hearing is marked completed, because
  -- recording what happened at it means it happened.
  UPDATE public.kp_hearings h
     SET outcome = p_outcome,
         outcome_recorded_by = v_uid,
         outcome_recorded_at = now(),
         outcome_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
         status = 'completed'
   WHERE h.id = p_hearing_id;

  IF COALESCE(p_concludes_case, false) THEN
    UPDATE public.kp_cases k
       SET status = 'concluded', concluded_by = v_uid, concluded_at = now(),
           conclusion_note = NULLIF(btrim(COALESCE(p_note, '')), '')
     WHERE k.id = v_case_id;
  END IF;

  RETURN p_hearing_id;
END;
$function$;

comment on function public.record_kp_hearing_outcome(uuid, text, text, boolean) is
  'Combined Phase 1. Punong-Barangay-only. Records ONE human-chosen '
  'proceeding outcome, never derived from attendance, minutes or screening '
  'answers. Whether it concludes the case is an explicit human parameter.';


-- ─── 13. Reading the case file ─────────────────────────────────────────────
--
-- ⚠️ FIXED NARROW COLUMN LISTS, and the private tables are never exposed.
-- Actors come back as DISPLAY NAMES rather than profile ids: a reader needs
-- to know who opened and who recorded, and an auth identifier is not that.
-- Nothing here returns `official_account_links`.
--
-- ⚠️ EVERY ONE IS GATED ON THE SAME PREDICATE, so the case, the hearings,
-- the attendance and the panel cannot drift apart on who may read them --
-- the objection 031 made to four copies of one join.

create or replace function public.kp_case_for_complaint(p_complaint_id uuid)
returns table (
  id uuid,
  reference text,
  complaint_id uuid,
  complaint_reference text,
  screening_id uuid,
  status text,
  opened_by_name text,
  opened_at timestamptz,
  opening_note text,
  concluded_by_name text,
  concluded_at timestamptz,
  conclusion_note text
)
language sql
stable
security definer
set search_path = ''
as $function$
  SELECT k.id, k.reference, k.complaint_id, c.reference AS complaint_reference,
         k.screening_id, k.status,
         po.full_name AS opened_by_name, k.opened_at, k.opening_note,
         pc.full_name AS concluded_by_name, k.concluded_at, k.conclusion_note
  FROM public.kp_cases k
  JOIN public.complaints c ON c.id = k.complaint_id
  LEFT JOIN public.profiles po ON po.id = k.opened_by
  LEFT JOIN public.profiles pc ON pc.id = k.concluded_by
  WHERE k.complaint_id = p_complaint_id
    AND public.kp_case_is_visible_to_caller(k.id);
$function$;


create or replace function public.kp_hearings_for(p_case_id uuid)
returns table (
  id uuid,
  proceeding_type text,
  hearing_date date,
  start_time time without time zone,
  location text,
  status text,
  presiding_note text,
  admin_notes text,
  minutes text,
  outcome text,
  outcome_note text,
  outcome_recorded_by_name text,
  outcome_recorded_at timestamptz,
  scheduled_by_name text,
  scheduled_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  SELECT h.id, h.proceeding_type, h.hearing_date, h.start_time, h.location,
         h.status, h.presiding_note, h.admin_notes, h.minutes,
         h.outcome, h.outcome_note,
         po.full_name AS outcome_recorded_by_name, h.outcome_recorded_at,
         ps.full_name AS scheduled_by_name, h.scheduled_at
  FROM public.kp_hearings h
  LEFT JOIN public.profiles po ON po.id = h.outcome_recorded_by
  LEFT JOIN public.profiles ps ON ps.id = h.scheduled_by
  WHERE h.case_id = p_case_id
    AND public.kp_case_is_visible_to_caller(p_case_id)
  ORDER BY h.hearing_date, h.start_time;
$function$;


-- ⚠️ The party's NAME and ROLE come through, because a notice and an
-- attendance sheet are unreadable without them -- and the CONTACT NUMBER
-- does not. P3-A withholds a respondent's contact from the complainant, and
-- nothing in a hearing record needs it, so it is simply not selected.
create or replace function public.kp_hearing_attendance_for(p_hearing_id uuid)
returns table (
  id uuid,
  party_id uuid,
  party_role text,
  party_name text,
  attendance text,
  attendance_note text,
  recorded_by_name text,
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  SELECT a.id, cp.id AS party_id, cp.party_role,
         cp.full_name_snapshot AS party_name,
         a.attendance, a.attendance_note,
         pr.full_name AS recorded_by_name, a.recorded_at
  FROM public.kp_hearing_attendance a
  JOIN public.complaint_parties cp ON cp.id = a.party_id
  JOIN public.kp_hearings h ON h.id = a.hearing_id
  LEFT JOIN public.profiles pr ON pr.id = a.recorded_by
  WHERE a.hearing_id = p_hearing_id
    AND public.kp_case_is_visible_to_caller(h.case_id)
  ORDER BY cp.party_role, cp.full_name_snapshot;
$function$;


-- Every party to the case's complaint, whether or not attendance has been
-- recorded -- so the Secretary has a list to record AGAINST, and the notice
-- can name who is summoned.
create or replace function public.kp_case_parties_for(p_case_id uuid)
returns table (
  party_id uuid,
  party_role text,
  party_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  SELECT cp.id AS party_id, cp.party_role, cp.full_name_snapshot AS party_name
  FROM public.kp_cases k
  JOIN public.complaint_parties cp ON cp.complaint_id = k.complaint_id
  WHERE k.id = p_case_id
    AND public.kp_case_is_visible_to_caller(p_case_id)
  ORDER BY cp.party_role, cp.full_name_snapshot;
$function$;


create or replace function public.kp_case_panel_for(p_case_id uuid)
returns table (
  id uuid,
  member_name text,
  panel_role text,
  assigned_by_name text,
  assigned_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  SELECT p.id, p.member_name, p.panel_role,
         pa.full_name AS assigned_by_name, p.assigned_at
  FROM public.kp_case_panel p
  LEFT JOIN public.profiles pa ON pa.id = p.assigned_by
  WHERE p.case_id = p_case_id
    AND public.kp_case_is_visible_to_caller(p_case_id)
  ORDER BY (p.panel_role <> 'chairperson'), p.assigned_at;
$function$;


-- ─── 14. A concluded case and a recorded outcome are history ───────────────
--
-- ⚠️ DEFENCE IN DEPTH, NOT THE CONTROL. No client holds UPDATE on either
-- table, so the privilege layer refuses first with `42501` and an API caller
-- cannot reach this trigger at all. It exists so immutability is a property
-- of the TABLES rather than of the functions that happen to be their only
-- writers today -- 042's reasoning, and the reason that trigger was kept.
--
-- ⚠️ ONE FUNCTION, TWO TRIGGERS, branching on TG_TABLE_NAME -- the shape
-- migration 029 used for `protect_official_record()`. Two functions doing
-- the same job would be two places for the rule to drift.
--
-- The trusted-caller test is the one every protect_* trigger in this project
-- uses, measured rather than copied: `auth.role()` is NULL on a direct
-- connection and `service_role` for the service key, and PostgREST always
-- sets a role claim. Without it the SQL Editor locks itself out of its own
-- tables, which is what the first version of 008's triggers did.

create or replace function public.protect_kp_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' THEN RETURN NEW; END IF;

  -- ⚠️ NESTED, NOT TWO FLAT `AND` CONDITIONS, AND THAT IS A REAL DEFECT
  -- FOUND BY PROBING RATHER THAN A STYLE CHOICE.
  --
  -- The first version read:
  --
  --   IF TG_TABLE_NAME = 'kp_hearings' AND OLD.outcome IS NOT NULL THEN
  --
  -- PL/pgSQL hands that whole boolean to the SQL executor, which
  -- resolves `OLD.outcome` whether or not the left side is true. On a
  -- `kp_cases` row there IS no `outcome` column, so EVERY API update to
  -- a case raised `42703 record "old" has no field "outcome"` -- which
  -- broke `schedule_kp_hearing()` (it moves the case `open` ->
  -- `in_process`) and would have broken concluding a case. Measured as
  -- a refusal that looked like a permission failure until SQLERRM was
  -- read: the SQLSTATE was `42703`, not `P0001`.
  --
  -- ⚠️ NO JEST TEST COULD HAVE CAUGHT THIS. It is runtime PL/pgSQL
  -- behaviour on a live table, and the suite runs no SQL -- which is
  -- exactly why this project's rule is to impersonate each role against
  -- the real database and to ask which step produced a result.
  --
  -- Nesting means the field is only ever named for the table that has
  -- it. The shape migration 029's `protect_official_record()` uses for
  -- `TG_OP`.
  IF TG_TABLE_NAME = 'kp_cases' THEN
    IF OLD.status = 'concluded' THEN
      RAISE EXCEPTION 'A concluded KP case cannot be changed.'
        USING ERRCODE = 'P0001';
    END IF;

  ELSIF TG_TABLE_NAME = 'kp_hearings' THEN
    IF OLD.outcome IS NOT NULL THEN
      RAISE EXCEPTION 'A hearing with a recorded outcome cannot be changed.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

create trigger trg_protect_kp_case
  before update on public.kp_cases
  for each row execute function public.protect_kp_record();

create trigger trg_protect_kp_hearing
  before update on public.kp_hearings
  for each row execute function public.protect_kp_record();

comment on function public.protect_kp_record() is
  'Combined Phase 1. Refuses an API caller''s change to a concluded case or '
  'to a hearing whose outcome is recorded. Defence in depth: no client holds '
  'UPDATE on either table, so the privilege layer refuses first.';


-- ─── 15. The execute surface ───────────────────────────────────────────────
--
-- ⚠️ `REVOKE ... FROM PUBLIC` IS THE LOAD-BEARING HALF, and MASTER-B's
-- lesson is applied at creation rather than in a later phase.
-- `pg_default_acl` for `postgres` creating FUNCTIONs in `public` grants
-- `anon`, `authenticated` and `service_role` BY NAME, and PostgreSQL's own
-- function default adds a bare PUBLIC entry on top -- so revoking the named
-- roles alone would leave `has_function_privilege('anon', ...)` TRUE through
-- PUBLIC. That was migration 038's whole finding; 043 does not repeat it.
--
-- ⚠️ `anon` GETS NOTHING AT ALL. No anonymous caller has any business with a
-- KP case: there is no public KP tracking page and §7 forbids one.

revoke execute on function public.generate_kp_case_reference(int) from public, anon, authenticated;
revoke execute on function public.stamp_kp_case_reference() from public, anon, authenticated;
revoke execute on function public.protect_kp_record() from public, anon, authenticated;
revoke execute on function public.kp_case_is_visible_to_caller(uuid) from public, anon, authenticated;

revoke execute on function public.open_kp_case(uuid, text) from public, anon;
revoke execute on function public.assign_kp_panel_member(uuid, text, text) from public, anon;
revoke execute on function public.schedule_kp_hearing(uuid, text, date, time, text, text, text) from public, anon;
revoke execute on function public.update_kp_hearing_record(uuid, text, text, text) from public, anon;
revoke execute on function public.record_kp_attendance(uuid, uuid, text, text) from public, anon;
revoke execute on function public.record_kp_hearing_outcome(uuid, text, text, boolean) from public, anon;
revoke execute on function public.kp_case_for_complaint(uuid) from public, anon;
revoke execute on function public.kp_hearings_for(uuid) from public, anon;
revoke execute on function public.kp_hearing_attendance_for(uuid) from public, anon;
revoke execute on function public.kp_case_parties_for(uuid) from public, anon;
revoke execute on function public.kp_case_panel_for(uuid) from public, anon;

-- ⚠️ EXACT NAMED GRANTS, and only to the ten the application calls. The four
-- internal functions above get none: two are reached only through the
-- stamping trigger and the protect triggers, and the predicate is called
-- only from inside these SECURITY DEFINER readers, where the nested EXECUTE
-- check is made as the DEFINER. Migration 034 measured that a trigger fires
-- for a caller holding no EXECUTE on its function, which is what makes this
-- safe rather than hopeful.
grant execute on function public.open_kp_case(uuid, text) to authenticated;
grant execute on function public.assign_kp_panel_member(uuid, text, text) to authenticated;
grant execute on function public.schedule_kp_hearing(uuid, text, date, time, text, text, text) to authenticated;
grant execute on function public.update_kp_hearing_record(uuid, text, text, text) to authenticated;
grant execute on function public.record_kp_attendance(uuid, uuid, text, text) to authenticated;
grant execute on function public.record_kp_hearing_outcome(uuid, text, text, boolean) to authenticated;
grant execute on function public.kp_case_for_complaint(uuid) to authenticated;
grant execute on function public.kp_hearings_for(uuid) to authenticated;
grant execute on function public.kp_hearing_attendance_for(uuid) to authenticated;
grant execute on function public.kp_case_parties_for(uuid) to authenticated;
grant execute on function public.kp_case_panel_for(uuid) to authenticated;


-- ============================================================================
-- ⚠️ WHAT THIS MIGRATION DELIBERATELY DOES NOT TOUCH
-- ============================================================================
--
--   complaints.status             NOT widened again. A complaint that became
--                                 a case still reads `screened`.
--   complaint_screenings          NOT read for eligibility beyond the human
--                                 confirmation, NOT written, NOT exposed.
--                                 042's functions are unchanged.
--   complaint_status_history      NOT written. The KP case has its own
--                                 provenance columns, and that table's
--                                 reader admits the FILING RESIDENT -- so a
--                                 KP note there would hand the complainant
--                                 the barangay's internal case
--                                 administration by a side door, which is
--                                 the exact defect 042 avoided.
--   track_complaint()             untouched. No public KP surface exists.
--   complaint_queue()             untouched. No KP column, no KP filter.
--   complaint_parties_for()       untouched.
--   activity_log                  NOT written and NEITHER GATE WIDENED. It
--                                 is readable by EVERY official, and the
--                                 only non-identifying thing to log is that
--                                 a case exists -- while a party name, a
--                                 minute or an outcome in a globally
--                                 readable field is exactly what must not
--                                 happen. The authoritative record is the
--                                 case file itself, whose every write
--                                 stamps its actor from auth.uid().
--                                 Widening it is a two-gate change (the
--                                 CHECK and stamp_activity_actor,
--                                 migration 016's lesson) and belongs in its
--                                 own migration.
--   notifications                 NOT written. Its event CHECK has no KP
--                                 value and the wording must come from a
--                                 module that owns it.
--   is_official()                 NOT broadened. Not called here at all.
--   official_account_links        NOT read directly and NOT exposed; reached
--                                 only through current_official_holds_position().
--   reservations                  untouched -- no column, no policy, no
--                                 trigger, and the overlap exclusion
--                                 constraint is not involved in scheduling.
--   official_availability         untouched.
--   PUROKS / purok anything       untouched.
--   storage                       no bucket, no policy, no object.
--
-- NOT CREATED, by decision: kp_case_parties (complaint_parties serves),
-- kp_jurisdiction_rules, a capability-assignment table, settlement terms,
-- repudiation, compliance monitoring, certificate to file action, automated
-- deadlines, incident/blotter, Tanod, maps, analytics.
-- ============================================================================
