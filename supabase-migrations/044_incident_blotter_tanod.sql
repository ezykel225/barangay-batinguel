-- ============================================================================
-- 044_incident_blotter_tanod.sql
--
-- Combined Phase 2 — incidents, the digital blotter, the Tanod roster and
-- patrol assignments, plus the readers the internal safety map and the
-- descriptive analytics are built on.
--
-- STATUS: APPLIED 2026-10-17, through the Supabase connector, in six calls:
--   044_incident_tanod_tables, 044_incident_references,
--   044_incident_write_rpcs, 044_tanod_write_rpcs,
--   044_incident_readers, 044_incident_analytics_readers
-- Verified by impersonating every role with its own JWT claims inside blocks
-- that always end in RAISE EXCEPTION. Results in CLAUDE.md.
--
-- ─── ⚠️ WHAT THIS PHASE DOES NOT DECIDE ──────────────────────────────────────
--
-- Nothing here classifies a crime, assigns fault, or recommends an action.
-- `incident_type` is an OPERATIONAL category the barangay records so it can
-- see what kind of thing happened where; it is NOT an offence code and the
-- frontend labels say so. The analytics readers below COUNT and GROUP and do
-- nothing else -- there is no scoring function, no ranking rule, no threshold
-- and no prediction, in SQL or in JavaScript.
--
-- ─── ⚠️ AN INCIDENT CARRIES NO PERSON RECORD, BY CONSTRUCTION ────────────────
--
-- There is deliberately NO incident_parties table and NO name column on
-- `incidents`. A complaint is an accusation by one named private party
-- against another, which is why migrations 040-043 went to such lengths to
-- keep parties, contacts and narratives apart. An incident is the barangay's
-- own record that something happened at a place and a time. Giving it a party
-- table would re-create the complaint privacy problem on a surface whose whole
-- point is to be plotted on a map.
--
-- So §11's requirement -- that the map and the analytics expose no complaint
-- party, witness, evidence, minor identity or VAWC screening data -- holds
-- STRUCTURALLY here: those columns do not exist on anything this migration
-- creates, and nothing in it reads a complaint table.
--
-- ⚠️ The narrative is still free text and an official could type a name into
-- it. That is why `incident_map_points()` and every analytics reader below
-- return NO narrative at all. Only `incident_detail()` does, and only to an
-- active official.
--
-- ─── ⚠️ PUROK IS STILL UNCONFIRMED (P2), SO THERE IS NO PUROK MODEL ──────────
--
-- No `puroks` table, no `purok_id`, no purok CHECK, no boundary polygon and no
-- normalisation of any stored purok value. `incidents.area_note` is FREE TEXT
-- and is deliberately NOT named `purok`, exactly as `complaints.location_note`
-- is. Hotspots are computed from COORDINATES and from the location label the
-- recorder typed -- never from an area the system invented.
--
-- ─── ⚠️ A TANOD IS NOT AN ACCOUNT ────────────────────────────────────────────
--
-- `tanod_members` is a roster of people, with no `profile_id`, no auth link and
-- no login. `profiles_role_check` is untouched and still permits exactly
-- official / nurse / resident. A Tanod cannot sign in, and nothing here lets
-- one try.
-- ============================================================================


-- ─── 1. Incidents ───────────────────────────────────────────────────────────

create table if not exists public.incidents (
  id              uuid primary key default gen_random_uuid(),
  reference       text        not null,
  incident_type   text        not null,
  occurred_at     timestamptz not null,
  narrative       text        not null,
  location_text   text        not null,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  area_note       text,
  source          text        not null,
  status          text        not null default 'recorded',
  recorded_by     uuid        not null references public.profiles(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint incidents_reference_key unique (reference),

  -- ⚠️ An OPERATIONAL vocabulary, not a legal one. Widening it later is safe;
  -- a CHECK is revalidated on every UPDATE, so NARROWING it would make a
  -- stored row un-editable -- migration 021's lesson.
  constraint incidents_type_check check (incident_type in (
    'traffic_accident', 'disturbance', 'physical_altercation',
    'theft_property', 'threat', 'public_safety_hazard', 'other')),

  constraint incidents_source_check check (source in (
    'official_report', 'resident_walk_in', 'tanod_report', 'other')),

  constraint incidents_status_check check (status in (
    'recorded', 'responding', 'resolved', 'referred', 'closed')),

  -- ⚠️ Half a coordinate is not a location. A row with a latitude and no
  -- longitude would plot at the prime meridian, which is a point in the Gulf
  -- of Guinea rather than a missing value.
  constraint incidents_coordinates_paired check ((latitude is null) = (longitude is null)),
  constraint incidents_latitude_range  check (latitude  is null or latitude  between  -90 and  90),
  constraint incidents_longitude_range check (longitude is null or longitude between -180 and 180),

  constraint incidents_narrative_present check (btrim(narrative) <> ''),
  constraint incidents_location_present  check (btrim(location_text) <> '')
);

create index if not exists incidents_occurred_at_idx on public.incidents (occurred_at desc);
create index if not exists incidents_type_idx        on public.incidents (incident_type);
create index if not exists incidents_status_idx      on public.incidents (status);


-- ─── 2. The digital blotter ─────────────────────────────────────────────────
--
-- ⚠️ ONE BLOTTER ENTRY PER INCIDENT, and `incident_id` is UNIQUE, which is the
-- duplicate guard. An incident and its blotter entry are two different facts:
-- the incident is what happened, the entry is the barangay having written it
-- down, with its own reference, its own moment and its own recorder.
--
-- ⚠️ `summary` is a SNAPSHOT of the narrative as it stood when the entry was
-- made, and that is justified rather than redundant: a later correction to the
-- incident must not silently rewrite what the blotter says was recorded on the
-- day. The two can differ, and the history below is how the difference is read.

create table if not exists public.blotter_entries (
  id            uuid primary key default gen_random_uuid(),
  entry_reference text      not null,
  incident_id   uuid        not null references public.incidents(id) on delete restrict,
  summary       text        not null,
  recorded_by   uuid        not null references public.profiles(id) on delete restrict,
  recorded_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  constraint blotter_entries_reference_key unique (entry_reference),
  constraint blotter_entries_one_per_incident unique (incident_id),
  constraint blotter_entries_summary_present check (btrim(summary) <> '')
);

-- ⚠️ APPEND-ONLY AT BOTH LAYERS, which is what makes "auditable" true rather
-- than claimed: no UPDATE policy and no UPDATE privilege exist for any client,
-- and the only writer is the SECURITY DEFINER function below. The same shape
-- `complaint_status_history` takes.
create table if not exists public.blotter_entry_history (
  id               uuid primary key default gen_random_uuid(),
  blotter_entry_id uuid        not null references public.blotter_entries(id) on delete restrict,
  action           text        not null,
  note             text,
  actor_profile_id uuid        references public.profiles(id) on delete restrict,
  created_at       timestamptz not null default now(),

  constraint blotter_history_action_check check (action in ('created', 'amended'))
);

create index if not exists blotter_history_entry_idx
  on public.blotter_entry_history (blotter_entry_id, created_at);


-- ─── 3. Tanod roster and patrol assignments ─────────────────────────────────

create table if not exists public.tanod_members (
  id            uuid primary key default gen_random_uuid(),
  full_name     text        not null,
  active        boolean     not null default true,
  area_note     text,
  display_order integer     not null default 0,
  created_by    uuid        not null references public.profiles(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint tanod_members_name_present check (btrim(full_name) <> '')
);

create table if not exists public.tanod_assignments (
  id              uuid primary key default gen_random_uuid(),
  tanod_id        uuid        not null references public.tanod_members(id) on delete restrict,
  assignment_date date        not null,
  start_time      time,
  end_time        time,
  patrol_type     text        not null default 'roving',
  area_label      text        not null,
  active          boolean     not null default true,
  created_by      uuid        not null references public.profiles(id) on delete restrict,
  created_at      timestamptz not null default now(),

  constraint tanod_assignments_patrol_check check (patrol_type in ('roving', 'static')),
  constraint tanod_assignments_area_present check (btrim(area_label) <> ''),
  -- A shift may legitimately run past midnight, so the two times are not
  -- compared; what is refused is half a window.
  constraint tanod_assignments_times_paired check ((start_time is null) = (end_time is null))
);

create index if not exists tanod_assignments_date_idx on public.tanod_assignments (assignment_date desc);


-- ─── 4. Incident ↔ Tanod attribution ────────────────────────────────────────
--
-- ⚠️ A STABLE FK, NEVER A NAME STRING. §6, and the same rule MASTER-A spent
-- six phases establishing for officials: a person is referenced by id, so
-- renaming them in the roster cannot detach them from what they attended.
--
-- More than one Tanod can attend one incident, and one Tanod can both report
-- and attend, so this is a join table with a role rather than two columns on
-- `incidents`.

create table if not exists public.incident_tanod (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid        not null references public.incidents(id) on delete restrict,
  tanod_id    uuid        not null references public.tanod_members(id) on delete restrict,
  role        text        not null,
  note        text,
  created_by  uuid        not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),

  constraint incident_tanod_role_check check (role in ('reported', 'responded', 'attended')),
  constraint incident_tanod_unique unique (incident_id, tanod_id, role)
);


-- ─── 5. Private: two barriers, not one (019A's pattern) ─────────────────────
--
-- ⚠️ RLS filters ROWS; it cannot restrict COLUMNS. The map must return a
-- coordinate and NOT the narrative, and analytics must return a count and
-- nothing else -- neither is expressible as a row policy. So every table here
-- is reached only through SECURITY DEFINER functions with fixed, narrow column
-- lists, and carries ZERO policies and ZERO client privilege.
--
-- Supabase grants full DML on a new public table to `anon` and `authenticated`
-- by default, so the absent policies alone would be the ONLY thing stopping a
-- read. Revoking as well means a client is refused `42501` at the privilege
-- layer, BEFORE RLS is consulted -- the stronger result, because RLS alone
-- returns an empty set that cannot be told from "there are no rows".

alter table public.incidents             enable row level security;
alter table public.blotter_entries       enable row level security;
alter table public.blotter_entry_history enable row level security;
alter table public.tanod_members         enable row level security;
alter table public.tanod_assignments     enable row level security;
alter table public.incident_tanod        enable row level security;

revoke all on public.incidents             from anon, authenticated, public;
revoke all on public.blotter_entries       from anon, authenticated, public;
revoke all on public.blotter_entry_history from anon, authenticated, public;
revoke all on public.tanod_members         from anon, authenticated, public;
revoke all on public.tanod_assignments     from anon, authenticated, public;
revoke all on public.incident_tanod        from anon, authenticated, public;


-- ─── 6. References ──────────────────────────────────────────────────────────
--
-- `INC-2026-AB12CD` and `BLT-2026-AB12CD`. Random, never sequential, and
-- server-stamped by a BEFORE INSERT trigger that discards whatever the row
-- carried -- 024's pattern, re-applied.
--
-- ⚠️ DISTINCT THREE-LETTER PREFIXES. `BCR-` is the court reservation, `CMP-`
-- the complaint and `KP-` the case; two references sharing a prefix is a
-- hazard when somebody reads one out over the phone. ⚠️ `BLT-`, not `BL-`,
-- for the same reason.
--
-- The alphabet is Crockford base32 with I, L, O and U removed, identical to
-- the three that came before -- a second alphabet is a second thing to drift.

create or replace function public.generate_incident_reference(p_prefix text, p_year integer)
returns text
language plpgsql
security definer
set search_path to ''
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
  RETURN p_prefix || '-' || p_year::text || '-' || v_body;
END;
$function$;

create or replace function public.stamp_incident_reference()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_year int; v_candidate text; v_attempt int := 0;
BEGIN
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::int;
  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := public.generate_incident_reference('INC', v_year);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.incidents i WHERE i.reference = v_candidate);
    IF v_attempt >= 10 THEN
      RAISE EXCEPTION 'Could not allocate a unique incident reference after % attempts', v_attempt
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  NEW.reference := v_candidate;
  RETURN NEW;
END;
$function$;

create or replace function public.stamp_blotter_reference()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_year int; v_candidate text; v_attempt int := 0;
BEGIN
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.recorded_at, now()))::int;
  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := public.generate_incident_reference('BLT', v_year);
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.blotter_entries b WHERE b.entry_reference = v_candidate);
    IF v_attempt >= 10 THEN
      RAISE EXCEPTION 'Could not allocate a unique blotter reference after % attempts', v_attempt
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  NEW.entry_reference := v_candidate;
  RETURN NEW;
END;
$function$;

create trigger trg_stamp_incident_reference
  before insert on public.incidents
  for each row execute function public.stamp_incident_reference();

create trigger trg_stamp_blotter_reference
  before insert on public.blotter_entries
  for each row execute function public.stamp_blotter_reference();


-- ─── 7. Who may do what ─────────────────────────────────────────────────────
--
-- ⚠️ NO CAPABILITY TABLE. §7 says not to build dormant authorization
-- infrastructure, and this implementation genuinely does not need one: every
-- rule below is answerable from the identity chain MASTER-A already built.
-- A private table with no reader is the inert state migration 030 held for
-- exactly one phase, and it is not repeated here.
--
-- ⚠️ `committee` IS READ NOWHERE IN THIS FILE. A real
-- `Peace and Order and Appropriation` value sits on one Kagawad, and it grants
-- NOTHING. The column is free text with no CHECK, the Edit Official form sends
-- it for an arbitrary row, the directory UPDATE policy is
-- `profiles.role = 'official'` with no row restriction, and
-- `protect_official_record()` does not guard it -- so authorizing on it would
-- reproduce migration 028's escalation on an unguarded column. The standing
-- rule from P3-A holds: COMMITTEE IS DESCRIPTIVE DATA, NOT AUTHORIZATION DATA.
--
-- ⚠️ `full_name` IS READ NOWHERE EITHER, as an identity key or a comparison.

-- An ACTIVE official: linked account, official role, and a directory row that
-- has not been archived.
--
-- ⚠️ THIS IS NARROWER THAN `is_official()` AND DOES NOT TOUCH IT. `is_official`
-- reads `profiles.role` alone and is referenced by eleven policies including
-- three in `storage`; widening or re-pointing it would hand the nurse the
-- residents registry. This is a separate predicate that additionally requires
-- the link and an active directory row -- the "safely enforced" half of §7.
create or replace function public.current_official_is_active()
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.official_account_links l
    JOIN public.profiles p ON p.id = l.profile_id
    JOIN public.barangay_officials bo ON bo.id = l.official_id
    WHERE p.id = auth.uid()
      AND p.role = 'official'
      AND bo.archived_at IS NULL
  );
$function$;

-- Records administration: the Barangay Secretary or the Punong Barangay.
-- ⚠️ Both branches resolve through `current_official_holds_position()`, the one
-- place the identity question is answered (migration 031).
create or replace function public.current_official_may_administer_records()
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  SELECT public.current_official_holds_position('Barangay Secretary')
      OR public.current_official_holds_position('Punong Barangay');
$function$;

revoke execute on function public.generate_incident_reference(text, integer) from public, anon, authenticated;
revoke execute on function public.stamp_incident_reference() from public, anon, authenticated;
revoke execute on function public.stamp_blotter_reference() from public, anon, authenticated;
revoke execute on function public.current_official_is_active() from public, anon;
revoke execute on function public.current_official_may_administer_records() from public, anon;
grant execute on function public.current_official_is_active() to authenticated;
grant execute on function public.current_official_may_administer_records() to authenticated;


-- ─── 8. Recording an incident ───────────────────────────────────────────────
--
-- ⚠️ ONE CALL CREATES THE INCIDENT, ITS BLOTTER ENTRY AND THE HISTORY ROW,
-- atomically. The demo workflow step "official records incident -> blotter
-- entry exists" is one statement, so there is no window in which an incident
-- exists with no blotter entry, and no second code path that could create one
-- without the other.
--
-- ⚠️ IT TAKES NOTHING THE SERVER OWNS. No reference, no blotter reference, no
-- status, no `recorded_by`, no timestamp and no history actor is a parameter,
-- so none of them can be forged. The references are stamped by the triggers
-- above, the status is the literal `recorded`, and both actors come from
-- `auth.uid()`.
--
-- ⚠️ AN RPC RATHER THAN A TABLE INSERT, for the measured reason migration 024
-- found: `.insert().select()` is `INSERT ... RETURNING`, and none of these
-- tables has a SELECT policy at all, so a multi-table write cannot be done
-- over the table API.
create or replace function public.record_incident(
  p_incident_type text,
  p_occurred_at   timestamptz,
  p_narrative     text,
  p_location_text text,
  p_source        text DEFAULT 'official_report',
  p_latitude      numeric DEFAULT NULL,
  p_longitude     numeric DEFAULT NULL,
  p_area_note     text    DEFAULT NULL,
  p_tanod_id      uuid    DEFAULT NULL,
  p_tanod_role    text    DEFAULT NULL)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_uid uuid := auth.uid();
  v_incident_id uuid;
  v_blotter_id uuid;
  v_reference text;
  v_narrative text := btrim(COALESCE(p_narrative, ''));
  v_location  text := btrim(COALESCE(p_location_text, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to record an incident.' USING ERRCODE = 'P0001';
  END IF;

  -- ⚠️ Reporting is open to any ACTIVE official, which is §7's "incident
  -- reporting ... if appropriate and safely enforced". It creates the
  -- barangay's own record of an event; it reads nobody else's data and it
  -- cannot change one already recorded.
  IF NOT public.current_official_is_active() THEN
    RAISE EXCEPTION 'Only an active barangay official can record an incident.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_narrative = '' THEN
    RAISE EXCEPTION 'An incident needs a description of what happened.' USING ERRCODE = 'P0001';
  END IF;
  IF v_location = '' THEN
    RAISE EXCEPTION 'An incident needs a location.' USING ERRCODE = 'P0001';
  END IF;
  IF p_occurred_at IS NULL THEN
    RAISE EXCEPTION 'An incident needs the date and time it happened.' USING ERRCODE = 'P0001';
  END IF;
  -- An incident that has not happened yet is a typed date, not a record.
  IF p_occurred_at > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'An incident cannot be recorded as happening in the future.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_tanod_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.tanod_members t WHERE t.id = p_tanod_id) THEN
      RAISE EXCEPTION 'That Tanod is not on the roster.' USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(p_tanod_role, '') NOT IN ('reported', 'responded', 'attended') THEN
      RAISE EXCEPTION 'Say how that Tanod was involved.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.incidents (
    reference, incident_type, occurred_at, narrative, location_text,
    latitude, longitude, area_note, source, status, recorded_by)
  VALUES (
    'PENDING', p_incident_type, p_occurred_at, v_narrative, v_location,
    p_latitude, p_longitude, NULLIF(btrim(COALESCE(p_area_note, '')), ''),
    p_source, 'recorded', v_uid)
  RETURNING id, reference INTO v_incident_id, v_reference;

  -- The blotter entry: the barangay having written it down, with the narrative
  -- as it stood at this moment.
  INSERT INTO public.blotter_entries (entry_reference, incident_id, summary, recorded_by)
  VALUES ('PENDING', v_incident_id, v_narrative, v_uid)
  RETURNING id INTO v_blotter_id;

  INSERT INTO public.blotter_entry_history (blotter_entry_id, action, note, actor_profile_id)
  VALUES (v_blotter_id, 'created', 'Blotter entry created with the incident.', v_uid);

  IF p_tanod_id IS NOT NULL THEN
    INSERT INTO public.incident_tanod (incident_id, tanod_id, role, created_by)
    VALUES (v_incident_id, p_tanod_id, p_tanod_role, v_uid);
  END IF;

  RETURN v_reference;
END;
$function$;


-- ─── 9. Moving an incident along, and amending the blotter ──────────────────

-- ⚠️ A STATUS CHANGE IS A RECORDS DECISION, so it is Secretary / Punong
-- Barangay, not every official. Recording what happened and deciding the
-- barangay has resolved it are different acts.
create or replace function public.set_incident_status(
  p_incident_id uuid, p_status text, p_note text DEFAULT NULL)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_uid uuid := auth.uid();
  v_blotter_id uuid;
  v_old text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to change an incident.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.current_official_may_administer_records() THEN
    RAISE EXCEPTION 'Only the Barangay Secretary or the Punong Barangay can change an incident record.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT i.status INTO v_old FROM public.incidents i WHERE i.id = p_incident_id;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'That incident does not exist.' USING ERRCODE = 'P0001';
  END IF;
  IF p_status IS NOT DISTINCT FROM v_old THEN
    RETURN;
  END IF;

  UPDATE public.incidents
     SET status = p_status, updated_at = now()
   WHERE id = p_incident_id;

  -- The blotter records that the barangay changed the record, and when.
  SELECT b.id INTO v_blotter_id FROM public.blotter_entries b WHERE b.incident_id = p_incident_id;
  IF v_blotter_id IS NOT NULL THEN
    INSERT INTO public.blotter_entry_history (blotter_entry_id, action, note, actor_profile_id)
    VALUES (v_blotter_id, 'amended',
            'Incident status changed to ' || p_status || '.'
              || COALESCE(' ' || NULLIF(btrim(COALESCE(p_note, '')), ''), ''),
            v_uid);
  END IF;
END;
$function$;

-- ⚠️ AN AMENDMENT APPENDS; IT DOES NOT REWRITE. `blotter_entries.summary` is
-- never updated by anything, so what the barangay wrote down on the day stays
-- readable beside every correction made since.
create or replace function public.amend_blotter_entry(p_incident_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_uid uuid := auth.uid();
  v_blotter_id uuid;
  v_note text := btrim(COALESCE(p_note, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to amend a blotter entry.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.current_official_may_administer_records() THEN
    RAISE EXCEPTION 'Only the Barangay Secretary or the Punong Barangay can amend a blotter entry.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_note = '' THEN
    RAISE EXCEPTION 'An amendment needs a note saying what changed.' USING ERRCODE = 'P0001';
  END IF;

  SELECT b.id INTO v_blotter_id FROM public.blotter_entries b WHERE b.incident_id = p_incident_id;
  IF v_blotter_id IS NULL THEN
    RAISE EXCEPTION 'That incident has no blotter entry.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.blotter_entry_history (blotter_entry_id, action, note, actor_profile_id)
  VALUES (v_blotter_id, 'amended', v_note, v_uid);
END;
$function$;

create or replace function public.attribute_incident_tanod(
  p_incident_id uuid, p_tanod_id uuid, p_role text, p_note text DEFAULT NULL)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to do that.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.current_official_may_administer_records() THEN
    RAISE EXCEPTION 'Only the Barangay Secretary or the Punong Barangay can record Tanod involvement.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = p_incident_id) THEN
    RAISE EXCEPTION 'That incident does not exist.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tanod_members t WHERE t.id = p_tanod_id) THEN
    RAISE EXCEPTION 'That Tanod is not on the roster.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.incident_tanod (incident_id, tanod_id, role, note, created_by)
  VALUES (p_incident_id, p_tanod_id, p_role,
          NULLIF(btrim(COALESCE(p_note, '')), ''), v_uid)
  ON CONFLICT ON CONSTRAINT incident_tanod_unique DO NOTHING;
END;
$function$;

revoke execute on function public.record_incident(text, timestamptz, text, text, text, numeric, numeric, text, uuid, text) from public, anon;
revoke execute on function public.set_incident_status(uuid, text, text) from public, anon;
revoke execute on function public.amend_blotter_entry(uuid, text) from public, anon;
revoke execute on function public.attribute_incident_tanod(uuid, uuid, text, text) from public, anon;
grant execute on function public.record_incident(text, timestamptz, text, text, text, numeric, numeric, text, uuid, text) to authenticated;
grant execute on function public.set_incident_status(uuid, text, text) to authenticated;
grant execute on function public.amend_blotter_entry(uuid, text) to authenticated;
grant execute on function public.attribute_incident_tanod(uuid, uuid, text, text) to authenticated;


-- ─── 10. The Tanod roster and patrol assignments ────────────────────────────
--
-- ⚠️ Roster and schedule administration is Secretary / Punong Barangay. A
-- Tanod is a person the barangay deploys, so who is on the roster is a records
-- decision rather than something any official edits in passing.

create or replace function public.add_tanod_member(
  p_full_name text, p_area_note text DEFAULT NULL, p_display_order integer DEFAULT 0)
returns uuid language plpgsql security definer set search_path to '' as $function$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_name text := btrim(COALESCE(p_full_name, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to do that.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.current_official_may_administer_records() THEN
    RAISE EXCEPTION 'Only the Barangay Secretary or the Punong Barangay can manage the Tanod roster.' USING ERRCODE = 'P0001';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'A Tanod needs a name.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.tanod_members (full_name, area_note, display_order, created_by)
  VALUES (v_name, NULLIF(btrim(COALESCE(p_area_note, '')), ''), COALESCE(p_display_order, 0), v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

create or replace function public.set_tanod_member_active(p_tanod_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path to '' as $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to do that.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.current_official_may_administer_records() THEN
    RAISE EXCEPTION 'Only the Barangay Secretary or the Punong Barangay can manage the Tanod roster.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tanod_members t WHERE t.id = p_tanod_id) THEN
    RAISE EXCEPTION 'That Tanod is not on the roster.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.tanod_members SET active = p_active, updated_at = now() WHERE id = p_tanod_id;
END;
$function$;

-- ⚠️ An assignment may only name an ACTIVE Tanod. Scheduling somebody who has
-- been stood down is the kind of thing a coverage report would then count as
-- real cover.
create or replace function public.schedule_tanod_assignment(
  p_tanod_id uuid, p_assignment_date date, p_area_label text,
  p_patrol_type text DEFAULT 'roving',
  p_start_time time DEFAULT NULL, p_end_time time DEFAULT NULL)
returns uuid language plpgsql security definer set search_path to '' as $function$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_area text := btrim(COALESCE(p_area_label, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to do that.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.current_official_may_administer_records() THEN
    RAISE EXCEPTION 'Only the Barangay Secretary or the Punong Barangay can schedule a patrol.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tanod_members t WHERE t.id = p_tanod_id AND t.active) THEN
    RAISE EXCEPTION 'That Tanod is not on the active roster.' USING ERRCODE = 'P0001';
  END IF;
  IF v_area = '' THEN
    RAISE EXCEPTION 'A patrol assignment needs an area.' USING ERRCODE = 'P0001';
  END IF;
  IF p_assignment_date IS NULL THEN
    RAISE EXCEPTION 'A patrol assignment needs a date.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.tanod_assignments (
    tanod_id, assignment_date, start_time, end_time, patrol_type, area_label, created_by)
  VALUES (p_tanod_id, p_assignment_date, p_start_time, p_end_time,
          COALESCE(p_patrol_type, 'roving'), v_area, v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

create or replace function public.set_tanod_assignment_active(p_assignment_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path to '' as $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to do that.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.current_official_may_administer_records() THEN
    RAISE EXCEPTION 'Only the Barangay Secretary or the Punong Barangay can change a patrol assignment.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tanod_assignments a WHERE a.id = p_assignment_id) THEN
    RAISE EXCEPTION 'That patrol assignment does not exist.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.tanod_assignments SET active = p_active WHERE id = p_assignment_id;
END;
$function$;

revoke execute on function public.add_tanod_member(text, text, integer) from public, anon;
revoke execute on function public.set_tanod_member_active(uuid, boolean) from public, anon;
revoke execute on function public.schedule_tanod_assignment(uuid, date, text, text, time, time) from public, anon;
revoke execute on function public.set_tanod_assignment_active(uuid, boolean) from public, anon;
grant execute on function public.add_tanod_member(text, text, integer) to authenticated;
grant execute on function public.set_tanod_member_active(uuid, boolean) to authenticated;
grant execute on function public.schedule_tanod_assignment(uuid, date, text, text, time, time) to authenticated;
grant execute on function public.set_tanod_assignment_active(uuid, boolean) to authenticated;


-- ─── 11. Readers ────────────────────────────────────────────────────────────
--
-- Every one is gated on `current_official_is_active()` INSIDE the function, so
-- a caller who is not an active official gets ZERO ROWS and no error -- RLS
-- filters rather than raising, and that is a boundary working rather than a
-- fault. `anon` does not reach them at all: the privilege layer refuses first
-- with 42501.
--
-- ⚠️ `incident_queue()` returns NO NARRATIVE, and that is a readability
-- decision rather than a privacy one -- a queue is a list and a narrative is
-- prose. `incident_detail()` returns it to the same caller one click later.
-- The privacy boundary is `incident_map_points()` below.

create or replace function public.incident_queue(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_type text DEFAULT NULL)
returns table (
  id uuid, reference text, incident_type text, occurred_at timestamptz,
  location_text text, area_note text, status text, source text,
  has_coordinates boolean, blotter_reference text, recorded_by_name text,
  tanod_count integer, created_at timestamptz)
language sql stable security definer set search_path to '' as $function$
  SELECT i.id, i.reference, i.incident_type, i.occurred_at,
         i.location_text, i.area_note, i.status, i.source,
         (i.latitude IS NOT NULL) AS has_coordinates,
         b.entry_reference AS blotter_reference,
         p.full_name AS recorded_by_name,
         (SELECT count(*) FROM public.incident_tanod t WHERE t.incident_id = i.id)::int AS tanod_count,
         i.created_at
  FROM public.incidents i
  LEFT JOIN public.blotter_entries b ON b.incident_id = i.id
  LEFT JOIN public.profiles p ON p.id = i.recorded_by
  WHERE public.current_official_is_active()
    AND (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
    AND (p_to   IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)
    AND (p_type IS NULL OR i.incident_type = p_type)
  ORDER BY i.occurred_at DESC;
$function$;

create or replace function public.incident_detail(p_incident_id uuid)
returns table (
  id uuid, reference text, incident_type text, occurred_at timestamptz,
  narrative text, location_text text, area_note text, latitude numeric,
  longitude numeric, status text, source text, blotter_reference text,
  blotter_summary text, blotter_recorded_at timestamptz,
  recorded_by_name text, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path to '' as $function$
  SELECT i.id, i.reference, i.incident_type, i.occurred_at,
         i.narrative, i.location_text, i.area_note, i.latitude, i.longitude,
         i.status, i.source,
         b.entry_reference, b.summary, b.recorded_at,
         p.full_name, i.created_at, i.updated_at
  FROM public.incidents i
  LEFT JOIN public.blotter_entries b ON b.incident_id = i.id
  LEFT JOIN public.profiles p ON p.id = i.recorded_by
  WHERE i.id = p_incident_id
    AND public.current_official_is_active();
$function$;

create or replace function public.blotter_history_for(p_incident_id uuid)
returns table (id uuid, action text, note text, actor_name text, created_at timestamptz)
language sql stable security definer set search_path to '' as $function$
  SELECT h.id, h.action, h.note, p.full_name, h.created_at
  FROM public.blotter_entry_history h
  JOIN public.blotter_entries b ON b.id = h.blotter_entry_id
  LEFT JOIN public.profiles p ON p.id = h.actor_profile_id
  WHERE b.incident_id = p_incident_id
    AND public.current_official_is_active()
  ORDER BY h.created_at ASC;
$function$;

create or replace function public.incident_tanod_for(p_incident_id uuid)
returns table (id uuid, tanod_id uuid, tanod_name text, role text, note text, created_at timestamptz)
language sql stable security definer set search_path to '' as $function$
  SELECT it.id, it.tanod_id, t.full_name, it.role, it.note, it.created_at
  FROM public.incident_tanod it
  JOIN public.tanod_members t ON t.id = it.tanod_id
  WHERE it.incident_id = p_incident_id
    AND public.current_official_is_active()
  ORDER BY it.created_at ASC;
$function$;

create or replace function public.tanod_roster(p_include_inactive boolean DEFAULT true)
returns table (id uuid, full_name text, active boolean, area_note text,
               display_order integer, assignment_count integer)
language sql stable security definer set search_path to '' as $function$
  SELECT t.id, t.full_name, t.active, t.area_note, t.display_order,
         (SELECT count(*) FROM public.tanod_assignments a
           WHERE a.tanod_id = t.id AND a.active)::int
  FROM public.tanod_members t
  WHERE public.current_official_is_active()
    AND (p_include_inactive OR t.active)
  ORDER BY t.display_order ASC, t.full_name ASC;
$function$;

create or replace function public.tanod_assignments_for(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (id uuid, tanod_id uuid, tanod_name text, assignment_date date,
               start_time time, end_time time, patrol_type text,
               area_label text, active boolean)
language sql stable security definer set search_path to '' as $function$
  SELECT a.id, a.tanod_id, t.full_name, a.assignment_date, a.start_time, a.end_time,
         a.patrol_type, a.area_label, a.active
  FROM public.tanod_assignments a
  JOIN public.tanod_members t ON t.id = a.tanod_id
  WHERE public.current_official_is_active()
    AND (p_from IS NULL OR a.assignment_date >= p_from)
    AND (p_to   IS NULL OR a.assignment_date <= p_to)
  ORDER BY a.assignment_date DESC, t.full_name ASC;
$function$;

-- ⚠️ THE PRIVACY BOUNDARY. Eight columns, and NO NARRATIVE, no `area_note`,
-- no recorder name, no blotter summary and nothing from any complaint table.
-- A map marker's popup is the one place a sentence somebody typed would be
-- read by whoever is standing at the screen, so the sentence is not sent.
--
-- ⚠️ It also returns ONLY rows that carry coordinates. An incident with no
-- coordinates is not plotted at (0,0) -- it is simply absent from the map and
-- present in the queue, and the UI says how many are absent.
create or replace function public.incident_map_points(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_type text DEFAULT NULL)
returns table (id uuid, reference text, incident_type text, occurred_at timestamptz,
               latitude numeric, longitude numeric, location_text text, status text)
language sql stable security definer set search_path to '' as $function$
  SELECT i.id, i.reference, i.incident_type, i.occurred_at,
         i.latitude, i.longitude, i.location_text, i.status
  FROM public.incidents i
  WHERE public.current_official_is_active()
    AND i.latitude IS NOT NULL
    AND i.longitude IS NOT NULL
    AND (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
    AND (p_to   IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)
    AND (p_type IS NULL OR i.incident_type = p_type)
  ORDER BY i.occurred_at DESC;
$function$;

revoke execute on function public.incident_queue(date, date, text) from public, anon;
revoke execute on function public.incident_detail(uuid) from public, anon;
revoke execute on function public.blotter_history_for(uuid) from public, anon;
revoke execute on function public.incident_tanod_for(uuid) from public, anon;
revoke execute on function public.tanod_roster(boolean) from public, anon;
revoke execute on function public.tanod_assignments_for(date, date) from public, anon;
revoke execute on function public.incident_map_points(date, date, text) from public, anon;
grant execute on function public.incident_queue(date, date, text) to authenticated;
grant execute on function public.incident_detail(uuid) to authenticated;
grant execute on function public.blotter_history_for(uuid) to authenticated;
grant execute on function public.incident_tanod_for(uuid) to authenticated;
grant execute on function public.tanod_roster(boolean) to authenticated;
grant execute on function public.tanod_assignments_for(date, date) to authenticated;
grant execute on function public.incident_map_points(date, date, text) to authenticated;


-- ─── 12. Analytics ──────────────────────────────────────────────────────────
--
-- ⚠️ THESE COUNT AND GROUP. THAT IS ALL THEY DO. There is no scoring, no
-- ranking rule, no threshold, no severity weight, no prediction and no model
-- -- in SQL or in JavaScript. Every number below is a `count(*)`.
--
-- ⚠️ NONE OF THEM RETURNS A NARRATIVE, A PERSON OR A COMPLAINT COLUMN. The
-- most identifying thing any of them emits is a location label an official
-- typed, which is what a hotspot IS.
--
-- ⚠️ COUNTS, NEVER RATES. There is no population figure in this database, so
-- a per-capita rate would need a denominator nobody has supplied. Frequency is
-- what the data supports and frequency is what is returned.

create or replace function public.incident_counts_by_type(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (incident_type text, total integer)
language sql stable security definer set search_path to '' as $function$
  SELECT i.incident_type, count(*)::int
  FROM public.incidents i
  WHERE public.current_official_is_active()
    AND (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
    AND (p_to   IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)
  GROUP BY i.incident_type
  ORDER BY count(*) DESC, i.incident_type ASC;
$function$;

create or replace function public.incident_counts_by_status(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (status text, total integer)
language sql stable security definer set search_path to '' as $function$
  SELECT i.status, count(*)::int
  FROM public.incidents i
  WHERE public.current_official_is_active()
    AND (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
    AND (p_to   IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)
  GROUP BY i.status
  ORDER BY count(*) DESC, i.status ASC;
$function$;

-- ⚠️ The month key is computed in ASIA/MANILA, not in UTC. The project already
-- paid for that distinction once: `manilaToday()` exists because an event
-- dated today read as yesterday between midnight and 8 AM Philippine time.
create or replace function public.incident_monthly_trend(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (month_key text, total integer)
language sql stable security definer set search_path to '' as $function$
  SELECT to_char((i.occurred_at AT TIME ZONE 'Asia/Manila'), 'YYYY-MM'), count(*)::int
  FROM public.incidents i
  WHERE public.current_official_is_active()
    AND (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
    AND (p_to   IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)
  GROUP BY 1
  ORDER BY 1 ASC;
$function$;

-- Repeated location labels -- the "hotspot" in the sense the data can support.
--
-- ⚠️ The grouping key is the location text NORMALISED for case and inner
-- whitespace, and nothing else. There is no fuzzy matching, no abbreviation
-- expansion and no spelling correction: "Rizal St" and "Rizal Street" are two
-- labels here, deliberately, because declaring them one is the same class of
-- inference that `barangay_term_members` refuses for names.
--
-- The centroid is the mean of whatever coordinates the group's rows carry, so
-- a hotspot can be plotted. `with_coordinates` says how many of the group's
-- incidents that mean is actually based on.
create or replace function public.incident_location_frequency(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (location_key text, location_label text, total integer,
               with_coordinates integer, centroid_latitude numeric,
               centroid_longitude numeric, top_type text)
language sql stable security definer set search_path to '' as $function$
  SELECT s.location_key,
         min(s.location_text) AS location_label,
         count(*)::int,
         count(s.latitude)::int,
         round(avg(s.latitude), 6),
         round(avg(s.longitude), 6),
         mode() WITHIN GROUP (ORDER BY s.incident_type) AS top_type
  FROM (
    SELECT lower(btrim(regexp_replace(i.location_text, '\s+', ' ', 'g'))) AS location_key,
           i.location_text, i.latitude, i.longitude, i.incident_type
    FROM public.incidents i
    WHERE public.current_official_is_active()
      AND (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
      AND (p_to   IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)
  ) s
  GROUP BY s.location_key
  ORDER BY count(*) DESC, s.location_key ASC;
$function$;

create or replace function public.tanod_coverage_summary(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (area_key text, area_label text, assignment_count integer,
               tanod_count integer, roving_count integer, static_count integer)
language sql stable security definer set search_path to '' as $function$
  SELECT s.area_key,
         min(s.area_label) AS area_label,
         count(*)::int,
         count(DISTINCT s.tanod_id)::int,
         (count(*) FILTER (WHERE s.patrol_type = 'roving'))::int,
         (count(*) FILTER (WHERE s.patrol_type = 'static'))::int
  FROM (
    SELECT lower(btrim(regexp_replace(a.area_label, '\s+', ' ', 'g'))) AS area_key,
           a.area_label, a.tanod_id, a.patrol_type
    FROM public.tanod_assignments a
    WHERE public.current_official_is_active()
      AND a.active
      AND (p_from IS NULL OR a.assignment_date >= p_from)
      AND (p_to   IS NULL OR a.assignment_date <= p_to)
  ) s
  GROUP BY s.area_key
  ORDER BY count(*) DESC, s.area_key ASC;
$function$;

revoke execute on function public.incident_counts_by_type(date, date) from public, anon;
revoke execute on function public.incident_counts_by_status(date, date) from public, anon;
revoke execute on function public.incident_monthly_trend(date, date) from public, anon;
revoke execute on function public.incident_location_frequency(date, date) from public, anon;
revoke execute on function public.tanod_coverage_summary(date, date) from public, anon;
grant execute on function public.incident_counts_by_type(date, date) to authenticated;
grant execute on function public.incident_counts_by_status(date, date) to authenticated;
grant execute on function public.incident_monthly_trend(date, date) to authenticated;
grant execute on function public.incident_location_frequency(date, date) to authenticated;
grant execute on function public.tanod_coverage_summary(date, date) to authenticated;


-- ─── 13. What this migration deliberately does NOT do ───────────────────────
--
-- * No `tanod` value in `profiles_role_check`, no Tanod account, no login.
-- * No `puroks` table, no `purok_id`, no purok CHECK, no boundary polygon and
--   no normalisation of any stored purok value.
-- * No continuous GPS, no device tracking and no location column on a Tanod.
--   `incidents.latitude`/`longitude` is the ONLY coordinate pair in the file.
-- * No `activity_log` entry and no notification. `blotter_entry_history` is
--   the authoritative domain record here, append-only at both layers, and
--   `activity_log` is readable by EVERY official -- widening it is a two-gate
--   change (the CHECK and `stamp_activity_actor`, migration 016's lesson) and
--   belongs in its own migration.
-- * No complaint, screening or KP table is read, written or redefined.
-- * No scoring, ranking, threshold or prediction.
