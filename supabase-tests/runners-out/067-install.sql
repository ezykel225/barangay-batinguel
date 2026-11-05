-- Migration 067 INSTALL-SAFETY check. Proves that INSTALLING 067 changes no
-- existing Community Credit row, no score and no active policy, and creates
-- no V2 policy, enrollment, award or transition.
--
-- Run ONLY in a disposable, schema-only test database that has 001-066 (064
-- optional) and does NOT have 067. Do not run this file directly: the
-- APPLY marker line below is replaced with 067's body by 067_build_test_runner.mjs
-- (output 067-install.sql). Everything runs in one transaction and ROLLS BACK.
begin;
set local timezone='UTC';

do $precondition$
begin
  if to_regprocedure('public.award_community_credit_participation(uuid,uuid,uuid)') is not null then
    raise exception 'SETUP PRECONDITION FAILED: 067 is already applied; this check must run before it';
  end if;
  if exists(select 1 from public.community_credit_policies) or exists(select 1 from public.barangay_officials where archived_at is null
      and position in ('Punong Barangay','Barangay Secretary','Barangay Treasurer')) then
    raise exception 'SETUP PRECONDITION FAILED: run only on a disposable schema-only database';
  end if;
end $precondition$;

create function pg_temp.as_sec(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub','f0671000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims','{"sub":"f0671000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  perform set_config('request.jwt.claims','',true); perform set_config('request.jwt.claim.sub','',true);
  return v;
end; $$;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('f0671000-0000-4000-8000-000000000001','authenticated','authenticated','sec@p067i-test.invalid','',now(),'{}','{}',now(),now());
insert into public.profiles(id,full_name,role) values('f0671000-0000-4000-8000-000000000001','P067I sec','official');
insert into public.barangay_officials(id,full_name,position,display_order,created_by)
values('f0671000-0000-4000-8000-000000000011','P067I sec','Barangay Secretary',971011,'f0671000-0000-4000-8000-000000000001');
insert into public.official_account_links(official_id,profile_id,linked_by)
values('f0671000-0000-4000-8000-000000000011','f0671000-0000-4000-8000-000000000001','migration-067 install test');
insert into public.barangay_residents(id,first_name,last_name,purok,resident_status)
select ('f0671000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid,'P067I','R'||n,'P067I Area',case when n=4 then 'inactive' else 'active' end
from generate_series(1,4) n;

-- Two V1 policies through the V1 functions: P1 used then retired, P2 active.
create temp table t067i(k text primary key,id uuid);
do $fixtures$
declare p1 uuid; p2 uuid; pos uuid; neg uuid; pos2 uuid; sec uuid:='f0671000-0000-4000-8000-000000000001';
begin
  p1:=(pg_temp.as_sec('select to_jsonb(public.save_community_credit_policy(null,''P067I one'','''',100,0,100))')#>>'{}')::uuid;
  perform pg_temp.as_sec(format('select public.activate_community_credit_policy(%L)',p1));
  pos:=(pg_temp.as_sec(format('select to_jsonb(public.save_community_credit_rule(null,%L,''I_POS'',''pos'','''',''positive'',''community_activity'',5,false))',p1))#>>'{}')::uuid;
  neg:=(pg_temp.as_sec(format('select to_jsonb(public.save_community_credit_rule(null,%L,''I_NEG'',''neg'','''',''negative'',''incident_outcome'',-20,false))',p1))#>>'{}')::uuid;
  perform pg_temp.as_sec(format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',pos));
  perform pg_temp.as_sec(format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',neg));
  insert into public.community_credit_events(resident_id,policy_id,rule_id,event_kind,rule_code_snapshot,rule_title_snapshot,points_delta_snapshot,source_type,verified_by,verified_at)
  select r,p1,x,'positive','-','-',1,'community_activity',sec,now() from (values
    ('f0671000-0000-4000-8000-000000000101'::uuid,pos),('f0671000-0000-4000-8000-000000000101'::uuid,neg),('f0671000-0000-4000-8000-000000000102'::uuid,neg)) v(r,x);
  perform pg_temp.as_sec(format('select to_jsonb(public.retire_community_credit_policy(%L))',p1));
  p2:=(pg_temp.as_sec('select to_jsonb(public.save_community_credit_policy(null,''P067I two'','''',100,0,100))')#>>'{}')::uuid;
  perform pg_temp.as_sec(format('select public.activate_community_credit_policy(%L)',p2));
  pos2:=(pg_temp.as_sec(format('select to_jsonb(public.save_community_credit_rule(null,%L,''I_POS2'',''pos'','''',''positive'',''community_activity'',5,false))',p2))#>>'{}')::uuid;
  perform pg_temp.as_sec(format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',pos2));
  neg:=(pg_temp.as_sec(format('select to_jsonb(public.save_community_credit_rule(null,%L,''I_NEG2'',''neg'','''',''negative'',''kp_outcome'',-15,false))',p2))#>>'{}')::uuid;
  perform pg_temp.as_sec(format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',neg));
  insert into public.community_credit_events(resident_id,policy_id,rule_id,event_kind,rule_code_snapshot,rule_title_snapshot,points_delta_snapshot,source_type,verified_by,verified_at)
  values('f0671000-0000-4000-8000-000000000103',p2,pos2,'positive','-','-',1,'community_activity',sec,now()),
        ('f0671000-0000-4000-8000-000000000101',p2,neg,'negative','-','-',-1,'kp_outcome',sec,now());
  insert into t067i values('p1',p1),('p2',p2);
end $fixtures$;

create temp table t067i_before as
  select 'policy' kind,id,to_jsonb(p) row from public.community_credit_policies p
  union all select 'rule',id,to_jsonb(r) from public.community_credit_rules r
  union all select 'enrollment',id,to_jsonb(e) from public.community_credit_enrollments e
  union all select 'event',id,to_jsonb(v) from public.community_credit_events v;
create temp table t067i_profile_before as
  select r.id,pg_temp.as_sec(format('select public.community_credit_profile(%L)',r.id)) profile
  from public.barangay_residents r where r.first_name='P067I';
create temp table t067i_counts as select (select count(*) from public.activity_log) activity_log_rows;

-- 067 body, verbatim, inside this transaction:

-- ── Writer flag helpers (no client grant) ──────────────────────────────────
create function public.community_credit_v2_writer(p_on boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.set_config('community_credit.v2_writer',case when p_on then 'on' else '' end,true);
end; $$;

create function public.community_credit_v2_writer_on()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(pg_catalog.current_setting('community_credit.v2_writer',true),'')='on';
$$;

-- ── Policies ───────────────────────────────────────────────────────────────
alter table public.community_credit_policies
  add column policy_model text not null default 'legacy_v1' check (policy_model in ('legacy_v1','participation_v2')),
  add column prepared_by uuid references public.profiles(id) on delete restrict,
  add column approved_by uuid references public.profiles(id) on delete restrict,
  add column approved_at timestamptz,
  add constraint community_credit_policies_v2_score_model
    check (policy_model<>'participation_v2' or (base_score=100 and minimum_score=0 and maximum_score=100)),
  add constraint community_credit_policies_v2_approval
    check (policy_model<>'participation_v2' or (prepared_by is not null and (status='draft' or approved_by is not null))),
  add constraint community_credit_policies_independent_approval
    check (approved_by is null or (approved_at is not null and prepared_by is not null and approved_by<>prepared_by));

create function public.community_credit_guard_policy()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.policy_model is distinct from old.policy_model then raise exception 'A policy model cannot be changed'; end if;
  if new.status is distinct from old.status and (new.policy_model='participation_v2' or old.status='retired')
     and not public.community_credit_v2_writer_on() then
    raise exception 'A participation policy changes state only through an approved two-person transition';
  end if;
  if new.policy_model='participation_v2' then
    if old.approved_by is not null and (new.name,new.description,new.prepared_by,new.approved_by,new.approved_at)
       is distinct from (old.name,old.description,old.prepared_by,old.approved_by,old.approved_at) then
      raise exception 'An approved participation policy cannot be edited';
    end if;
    if old.approved_by is null and new.approved_by is null and (new.name,new.description) is distinct from (old.name,old.description) then
      new.prepared_by:=coalesce(auth.uid(),new.prepared_by);
    end if;
  end if;
  return new;
end; $$;
create trigger community_credit_policy_guard before update on public.community_credit_policies
  for each row execute function public.community_credit_guard_policy();

-- ── Rules ──────────────────────────────────────────────────────────────────
alter table public.community_credit_rules
  add column annual_points_cap integer check (annual_points_cap between 1 and 100),
  add column evidence_requirement text check (length(evidence_requirement) <= 500),
  add column prepared_by uuid references public.profiles(id) on delete restrict,
  add column approved_by uuid references public.profiles(id) on delete restrict,
  add column approved_at timestamptz,
  add constraint community_credit_rules_cap_multiple
    check (annual_points_cap is null or (points_delta>0 and annual_points_cap % points_delta = 0)),
  add constraint community_credit_rules_independent_approval
    check (approved_by is null or (approved_at is not null and prepared_by is not null and approved_by<>prepared_by));

create function public.community_credit_guard_rule()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_model text; v_status text;
begin
  if tg_op='UPDATE' and new.policy_id is distinct from old.policy_id then raise exception 'A rule cannot move to another policy'; end if;
  select policy_model,status into v_model,v_status from public.community_credit_policies where id=new.policy_id;
  if v_model is distinct from 'participation_v2' then return new; end if;
  if tg_op='INSERT' and v_status='retired' then raise exception 'Rules require a draft or active policy'; end if;
  if tg_op='UPDATE' and old.approved_by is not null and (new.rule_code,new.title,new.description,new.category,new.source_domain,
       new.points_delta,new.repairable,new.annual_points_cap,new.evidence_requirement,new.prepared_by,new.approved_by,new.approved_at)
     is distinct from (old.rule_code,old.title,old.description,old.category,old.source_domain,
       old.points_delta,old.repairable,old.annual_points_cap,old.evidence_requirement,old.prepared_by,old.approved_by,old.approved_at) then
    raise exception 'An approved participation rule cannot be edited; prepare a new rule instead';
  end if;
  if new.category<>'positive' or new.source_domain<>'community_activity' or new.repairable then
    raise exception 'A participation policy accepts only earned community-activity rules';
  end if;
  if new.points_delta not between 1 and 100 or new.annual_points_cap is null
     or new.evidence_requirement is null or length(btrim(new.evidence_requirement))<3 then
    raise exception 'A participation rule needs positive points, an annual cap and an evidence requirement';
  end if;
  if tg_op='INSERT' then
    new.prepared_by:=coalesce(new.prepared_by,auth.uid());
    if new.prepared_by is null then raise exception 'A participation rule needs a preparer'; end if;
    if new.approved_by is not null and not public.community_credit_v2_writer_on() then raise exception 'A rule is approved only through the approval function'; end if;
  elsif old.approved_by is null and new.approved_by is not null and not public.community_credit_v2_writer_on() then
    raise exception 'A rule is approved only through the approval function';
  elsif old.approved_by is null and new.approved_by is null and (new.rule_code,new.title,new.description,new.points_delta,
       new.annual_points_cap,new.evidence_requirement) is distinct from (old.rule_code,old.title,old.description,old.points_delta,
       old.annual_points_cap,old.evidence_requirement) then
    new.prepared_by:=coalesce(auth.uid(),new.prepared_by);
  end if;
  if new.active and new.approved_by is null then raise exception 'A participation rule must be approved before it is enabled'; end if;
  return new;
end; $$;
create trigger community_credit_rule_guard before insert or update on public.community_credit_rules
  for each row execute function public.community_credit_guard_rule();

-- ── Enrollments ────────────────────────────────────────────────────────────
alter table public.community_credit_enrollments drop constraint community_credit_enrollments_starting_score_check;
alter table public.community_credit_enrollments add constraint community_credit_enrollments_starting_score_check check (starting_score in (0,100));
alter table public.community_credit_enrollments drop constraint community_credit_enrollments_enrollment_source_check;
alter table public.community_credit_enrollments add constraint community_credit_enrollments_enrollment_source_check
  check (enrollment_source in ('active_resident_batch','resident_created','resident_reactivated','policy_transition'));

create function public.community_credit_guard_enrollment()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_base integer;
begin
  select base_score into v_base from public.community_credit_policies where id=new.policy_id;
  if v_base is distinct from new.starting_score then raise exception 'An enrollment starts at its policy''s base score'; end if;
  return new;
end; $$;
create trigger community_credit_enrollment_guard before insert or update on public.community_credit_enrollments
  for each row execute function public.community_credit_guard_enrollment();

-- ── Activities ─────────────────────────────────────────────────────────────
create table public.community_credit_activities (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^ACT-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{6}$'),
  policy_id uuid not null references public.community_credit_policies(id) on delete restrict,
  rule_id uuid not null references public.community_credit_rules(id) on delete restrict,
  title text not null check (length(btrim(title)) between 3 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz,
  activity_date date not null,
  cap_year integer not null,
  location_note text check (length(location_note) <= 200),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 3 and 200),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  request_id uuid unique,
  check (ends_at is null or ends_at>=starts_at),
  check (cap_year = extract(year from activity_date)::integer)
);
create index community_credit_activities_policy_idx on public.community_credit_activities(policy_id,activity_date desc,id);

-- ── Participations: the lockable active-award state ────────────────────────
create table public.community_credit_participations (
  activity_id uuid not null references public.community_credit_activities(id) on delete restrict,
  resident_id uuid not null references public.barangay_residents(id) on delete restrict,
  policy_id uuid not null references public.community_credit_policies(id) on delete restrict,
  participation_mode text not null check (participation_mode in ('in_person','accessible_alternative')),
  verification_note text check (length(verification_note) <= 500),
  verified_by uuid not null references public.profiles(id) on delete restrict,
  verified_at timestamptz not null default now(),
  state text not null default 'verified' check (state in ('verified','awarded','capped','reversed')),
  active_award_event_id uuid unique,
  last_reversed_event_id uuid,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (activity_id,resident_id),
  check ((state='awarded') = (active_award_event_id is not null)),
  check (state<>'reversed' or last_reversed_event_id is not null)
);
create index community_credit_participations_resident_idx on public.community_credit_participations(resident_id,policy_id);

-- ── Ledger links (events stay immutable; ADD COLUMN fires no row trigger) ───
alter table public.community_credit_events
  add column participation_activity_id uuid,
  add column participation_resident_id uuid,
  add column reason text check (reason is null or length(btrim(reason)) between 3 and 500),
  add column reaward_of_event_id uuid unique references public.community_credit_events(id) on delete restrict,
  add column request_id uuid,
  add constraint community_credit_events_participation_fk foreign key (participation_activity_id,participation_resident_id)
    references public.community_credit_participations(activity_id,resident_id) on delete restrict,
  add constraint community_credit_events_participation_pair check ((participation_activity_id is null)=(participation_resident_id is null));
create index community_credit_events_participation_idx on public.community_credit_events(participation_activity_id,participation_resident_id);
alter table public.community_credit_participations
  add constraint community_credit_participations_active_award_fk foreign key (active_award_event_id)
    references public.community_credit_events(id) on delete restrict,
  add constraint community_credit_participations_last_reversed_fk foreign key (last_reversed_event_id)
    references public.community_credit_events(id) on delete restrict;

-- ── Idempotency, cap locks, corrections, transitions ───────────────────────
create table public.community_credit_requests (
  request_id uuid primary key,
  operation text not null,
  actor uuid not null references public.profiles(id) on delete restrict,
  payload_hash text not null,
  result jsonb,
  created_at timestamptz not null default now()
);
create table public.community_credit_cap_locks (
  policy_id uuid not null references public.community_credit_policies(id) on delete restrict,
  resident_id uuid not null references public.barangay_residents(id) on delete restrict,
  rule_id uuid not null references public.community_credit_rules(id) on delete restrict,
  cap_year integer not null,
  created_at timestamptz not null default now(),
  primary key (policy_id,resident_id,rule_id,cap_year)
);
create table public.community_credit_correction_requests (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.barangay_residents(id) on delete restrict,
  policy_id uuid not null references public.community_credit_policies(id) on delete restrict,
  request_kind text not null check (request_kind in ('award_correction','missing_activity')),
  event_id uuid references public.community_credit_events(id) on delete restrict,
  activity_id uuid references public.community_credit_activities(id) on delete restrict,
  activity_description text check (length(activity_description) <= 300),
  message text not null check (length(btrim(message)) between 10 and 1000),
  status text not null default 'submitted' check (status in ('submitted','approved','declined')),
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolved_at timestamptz,
  resolution_reason text check (resolution_reason is null or length(btrim(resolution_reason)) between 3 and 500),
  request_id uuid unique,
  check ((request_kind='award_correction')=(event_id is not null)),
  check ((status='submitted')=(resolved_by is null)),
  check (status='submitted' or (resolved_at is not null and resolution_reason is not null))
);
create unique index community_credit_one_open_correction_per_event
  on public.community_credit_correction_requests(event_id) where status='submitted' and event_id is not null;
create table public.community_credit_transitions (
  id uuid primary key default gen_random_uuid(),
  transition_kind text not null check (transition_kind in ('activate_participation_policy','emergency_restore_previous_policy')),
  from_policy_id uuid references public.community_credit_policies(id) on delete restrict,
  to_policy_id uuid not null references public.community_credit_policies(id) on delete restrict,
  status text not null default 'prepared' check (status in ('prepared','completed','cancelled')),
  note text not null check (length(btrim(note)) between 10 and 1000),
  preflight jsonb not null,
  prepared_by uuid not null references public.profiles(id) on delete restrict,
  prepared_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text,
  result jsonb,
  check (approved_by is null or approved_by<>prepared_by),
  check ((status='completed')=(approved_by is not null and approved_at is not null)),
  check ((status='cancelled')=(cancelled_by is not null and cancelled_at is not null and cancel_reason is not null))
);
create unique index community_credit_one_open_transition on public.community_credit_transitions((true)) where status='prepared';

alter table public.community_credit_activities enable row level security;
alter table public.community_credit_participations enable row level security;
alter table public.community_credit_requests enable row level security;
alter table public.community_credit_cap_locks enable row level security;
alter table public.community_credit_correction_requests enable row level security;
alter table public.community_credit_transitions enable row level security;
revoke all on public.community_credit_activities,public.community_credit_participations,public.community_credit_requests,
  public.community_credit_cap_locks,public.community_credit_correction_requests,public.community_credit_transitions
  from public,anon,authenticated,service_role;

-- ── Integrity triggers for the new tables ──────────────────────────────────
create function public.community_credit_guard_workflow_row()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- ⚠️ NESTED branches, never one AND chain: PL/pgSQL resolves every NEW.field
  -- in a boolean expression whatever the table, and these four tables have
  -- different columns (the 043 protect_kp_record lesson).
  if tg_op='DELETE' then raise exception 'Community Credit workflow records cannot be deleted'; end if;
  if tg_table_name='community_credit_activities' and tg_op='UPDATE' then raise exception 'Community Credit activities are immutable'; end if;
  if not public.community_credit_v2_writer_on() then raise exception 'Community Credit workflow records change only through the workflow functions'; end if;
  if tg_op='UPDATE' then
    if tg_table_name='community_credit_participations' then
      if (new.activity_id,new.resident_id,new.policy_id,new.participation_mode,new.verification_note,new.verified_by,new.verified_at)
         is distinct from (old.activity_id,old.resident_id,old.policy_id,old.participation_mode,old.verification_note,old.verified_by,old.verified_at) then
        raise exception 'A verified participation cannot be rewritten';
      end if;
    elsif tg_table_name='community_credit_correction_requests' then
      if old.status<>'submitted' or
         (new.resident_id,new.policy_id,new.request_kind,new.event_id,new.activity_id,new.activity_description,new.message,new.submitted_by,new.submitted_at,new.request_id)
         is distinct from (old.resident_id,old.policy_id,old.request_kind,old.event_id,old.activity_id,old.activity_description,old.message,old.submitted_by,old.submitted_at,old.request_id) then
        raise exception 'A correction request can only be resolved once';
      end if;
    elsif tg_table_name='community_credit_transitions' then
      if old.status<>'prepared' or
         (new.transition_kind,new.from_policy_id,new.to_policy_id,new.note,new.preflight,new.prepared_by,new.prepared_at)
         is distinct from (old.transition_kind,old.from_policy_id,old.to_policy_id,old.note,old.preflight,old.prepared_by,old.prepared_at) then
        raise exception 'A transition can only be decided once';
      end if;
    end if;
  end if;
  return new;
end; $$;
create trigger community_credit_activities_guard before insert or update or delete on public.community_credit_activities
  for each row execute function public.community_credit_guard_workflow_row();
create trigger community_credit_participations_guard before insert or update or delete on public.community_credit_participations
  for each row execute function public.community_credit_guard_workflow_row();
create trigger community_credit_corrections_guard before insert or update or delete on public.community_credit_correction_requests
  for each row execute function public.community_credit_guard_workflow_row();
create trigger community_credit_transitions_guard before insert or update or delete on public.community_credit_transitions
  for each row execute function public.community_credit_guard_workflow_row();

-- ── Audit vocabulary (059's pattern: keep every prior value) ───────────────
do $audit$
declare v_expression text;
begin
  select pg_catalog.pg_get_expr(conbin,conrelid) into v_expression
  from pg_catalog.pg_constraint
  where conrelid='public.activity_log'::regclass and conname='activity_log_entity_type_check';
  if v_expression is null then raise exception 'Existing activity log vocabulary is required'; end if;
  alter table public.activity_log drop constraint activity_log_entity_type_check;
  execute 'alter table public.activity_log add constraint activity_log_entity_type_check check (('||v_expression||') or entity_type in (''community_credit_activity'',''community_credit_award'',''community_credit_correction'',''community_credit_transition''))';
end;
$audit$;

-- ── Ledger guard: 060's V1 body unchanged, plus the V2 branch ──────────────
create or replace function public.community_credit_guard_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_rule public.community_credit_rules%rowtype; v_original public.community_credit_events%rowtype; v_started timestamptz;
  v_model text; v_part public.community_credit_participations%rowtype;
begin
  select policy_model into v_model from public.community_credit_policies where id=new.policy_id;
  if v_model='participation_v2' then
    if not public.community_credit_v2_writer_on() then raise exception 'Participation points are recorded only through the award workflow'; end if;
    select e.started_at into v_started from public.community_credit_enrollments e where e.resident_id=new.resident_id and e.policy_id=new.policy_id;
    if v_started is null then raise exception 'Resident is not enrolled in this Community Credit policy'; end if;
    if new.verified_at>now() then raise exception 'Verification time cannot be in the future'; end if;
    if new.verified_at<v_started then raise exception 'Pre-enrollment records cannot create Community Credit events'; end if;
    select * into v_part from public.community_credit_participations
      where activity_id=new.participation_activity_id and resident_id=new.participation_resident_id;
    if not found or v_part.resident_id<>new.resident_id or v_part.policy_id<>new.policy_id then raise exception 'A participation award needs its verified participation'; end if;
    if new.reverses_event_id is null then
      select * into v_rule from public.community_credit_rules where id=new.rule_id;
      if not found or v_rule.policy_id<>new.policy_id or not v_rule.active or v_rule.approved_by is null or v_rule.category<>'positive' then
        raise exception 'Active approved rule unavailable'; end if;
      if not exists(select 1 from public.community_credit_activities a where a.id=v_part.activity_id and a.rule_id=v_rule.id) then
        raise exception 'An award must use its activity''s rule'; end if;
      if new.reaward_of_event_id is not null then
        if new.reason is null or not exists(select 1 from public.community_credit_events o
            join public.community_credit_events r on r.reverses_event_id=o.id
            where o.id=new.reaward_of_event_id and o.participation_activity_id=v_part.activity_id and o.participation_resident_id=v_part.resident_id) then
          raise exception 'A re-award needs a reason and a reversed award of the same participation'; end if;
      end if;
      new.event_kind:='positive'; new.rule_code_snapshot:=v_rule.rule_code; new.rule_title_snapshot:=v_rule.title;
      new.points_delta_snapshot:=v_rule.points_delta; new.source_type:='community_activity';
    else
      select * into v_original from public.community_credit_events where id=new.reverses_event_id;
      if not found or v_original.resident_id<>new.resident_id or v_original.policy_id<>new.policy_id or v_original.reverses_event_id is not null
         or v_original.event_kind<>'positive' or v_original.participation_activity_id is distinct from new.participation_activity_id
         or v_original.participation_resident_id is distinct from new.participation_resident_id then raise exception 'Invalid reversal target'; end if;
      if new.reason is null or new.reaward_of_event_id is not null then raise exception 'A reversal needs a reason'; end if;
      new.rule_id:=v_original.rule_id; new.event_kind:='correction'; new.rule_code_snapshot:=v_original.rule_code_snapshot;
      new.rule_title_snapshot:=v_original.rule_title_snapshot; new.points_delta_snapshot:=-v_original.points_delta_snapshot;
      new.source_type:=v_original.source_type;
    end if;
    return new;
  end if;
  select * into v_rule from public.community_credit_rules where id=new.rule_id;
  if not found or v_rule.policy_id<>new.policy_id or not v_rule.active then raise exception 'Active rule unavailable'; end if;
  select e.started_at into v_started from public.community_credit_enrollments e where e.resident_id=new.resident_id and e.policy_id=new.policy_id;
  if v_started is null then raise exception 'Resident is not enrolled in this Community Credit policy'; end if;
  new.event_kind:=v_rule.category; new.rule_code_snapshot:=v_rule.rule_code; new.rule_title_snapshot:=v_rule.title;
  new.points_delta_snapshot:=v_rule.points_delta; new.source_type:=v_rule.source_domain;
  if new.verified_at>now() then raise exception 'Verification time cannot be in the future'; end if;
  if new.verified_at<v_started then raise exception 'Pre-enrollment records cannot create Community Credit events'; end if;
  if new.reverses_event_id is not null then
    select * into v_original from public.community_credit_events where id=new.reverses_event_id;
    if not found or v_original.resident_id<>new.resident_id or v_original.policy_id<>new.policy_id or v_original.reverses_event_id is not null then raise exception 'Invalid reversal target'; end if;
    if v_original.verified_at<v_started then raise exception 'A pre-enrollment event cannot be reversed into the Community Credit ledger'; end if;
    if v_rule.category<>'correction' or v_rule.points_delta<>-v_original.points_delta_snapshot then raise exception 'A reversal must be an equal, opposite correction'; end if;
  end if;
  return new;
end; $$;

-- ── Enrollment: 060's V1 path unchanged; a V2 policy enrolls at 0 ──────────
create or replace function public.community_credit_enroll_resident(p_resident_id uuid,p_source text,p_actor uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_policy public.community_credit_policies%rowtype; v_inserted uuid;
begin
  select * into v_policy from public.community_credit_policies where status='active';
  if not found then return false; end if;
  if v_policy.base_score<>100 or v_policy.minimum_score<>0 or v_policy.maximum_score<>100 then
    raise exception 'The policy must use the approved 100 / 0 / 100 score model';
  end if;
  if p_source not in ('active_resident_batch','resident_created','resident_reactivated') then raise exception 'Invalid enrollment source'; end if;
  if not exists(select 1 from public.barangay_residents r where r.id=p_resident_id and r.resident_status='active') then return false; end if;
  insert into public.community_credit_enrollments(resident_id,policy_id,starting_score,enrollment_source,created_by)
    values(p_resident_id,v_policy.id,v_policy.base_score,p_source,p_actor)
    on conflict(resident_id,policy_id) do nothing returning id into v_inserted;
  return v_inserted is not null;
end; $$;

create or replace function public.community_credit_enroll_active_residents(p_policy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_policy public.community_credit_policies%rowtype; v_added integer;
begin
  perform public.community_credit_require_admin();
  select * into v_policy from public.community_credit_policies where id=p_policy_id and status='active' for update;
  if not found then raise exception 'Active policy unavailable'; end if;
  if v_policy.base_score<>100 or v_policy.minimum_score<>0 or v_policy.maximum_score<>100 then
    raise exception 'The policy must use the approved 100 / 0 / 100 score model';
  end if;
  insert into public.community_credit_enrollments(resident_id,policy_id,starting_score,enrollment_source,created_by)
  select r.id,v_policy.id,v_policy.base_score,'active_resident_batch',auth.uid() from public.barangay_residents r where r.resident_status='active'
  on conflict(resident_id,policy_id) do nothing;
  get diagnostics v_added=row_count;
  return jsonb_build_object('policy_id',v_policy.id,'added',v_added,'enrolled',(
    select count(*) from public.community_credit_enrollments e join public.barangay_residents r on r.id=e.resident_id
    where e.policy_id=v_policy.id and r.resident_status='active'));
end; $$;

-- ── Visibility: the resident themself, or a records administrator ─────────
create or replace function public.community_credit_may_view_resident(p_resident_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    coalesce(public.current_official_may_administer_records(),false) or exists(
      select 1 from public.barangay_residents r
      join public.profiles p on p.id=r.profile_id
      where r.id=p_resident_id and p.id=auth.uid() and p.role='resident'
    )
  );
$$;

-- ── Milestones (display only; never used to decide anything) ──────────────
create function public.community_credit_milestones()
returns jsonb language sql immutable set search_path='' as $$
  select '[{"code":"none","lower":0,"upper":0,"label":"No participation points recorded yet","neutral_label":"No points recorded yet"},
    {"code":"getting_started","lower":1,"upper":24,"label":"Getting Started","neutral_label":"Participation recorded"},
    {"code":"active_participant","lower":25,"upper":49,"label":"Active Participant","neutral_label":"Regular participation"},
    {"code":"community_contributor","lower":50,"upper":74,"label":"Community Contributor","neutral_label":"Sustained participation"},
    {"code":"community_champion","lower":75,"upper":99,"label":"Community Champion","neutral_label":"Extensive participation"},
    {"code":"outstanding_service","lower":100,"upper":100,"label":"Outstanding Community Service","neutral_label":"Maximum points reached"}]'::jsonb;
$$;

create function public.community_credit_milestone(p_points bigint)
returns jsonb language sql immutable set search_path='' as $$
  select m from jsonb_array_elements(public.community_credit_milestones()) m
  where greatest(0,least(100,coalesce(p_points,0))) between (m->>'lower')::int and (m->>'upper')::int;
$$;

-- ── Request claim (idempotency) ────────────────────────────────────────────
create function public.community_credit_request_claim(p_request_id uuid,p_operation text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_hash text:=md5(p_operation||':'||coalesce(p_payload::text,'')); v_row public.community_credit_requests%rowtype; v_inserted uuid;
begin
  if p_request_id is null then raise exception 'A request id is required for this action'; end if;
  insert into public.community_credit_requests(request_id,operation,actor,payload_hash)
    values(p_request_id,p_operation,auth.uid(),v_hash)
    on conflict(request_id) do nothing returning request_id into v_inserted;
  if v_inserted is not null then return null; end if;
  select * into v_row from public.community_credit_requests where request_id=p_request_id;
  if v_row.actor is distinct from auth.uid() or v_row.operation<>p_operation or v_row.payload_hash<>v_hash then
    raise exception 'This request id was already used for a different action';
  end if;
  if v_row.result is null then raise exception 'This request is still being processed'; end if;
  return v_row.result||jsonb_build_object('replayed',true);
end; $$;

create function public.community_credit_request_finish(p_request_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  update public.community_credit_requests set result=p_result where request_id=p_request_id;
  perform public.community_credit_v2_writer(false);
  return p_result||jsonb_build_object('replayed',false);
end; $$;

create function public.community_credit_activity_reference(p_year integer)
returns text language plpgsql volatile security definer set search_path='' as $$
declare v_alphabet constant text:='0123456789ABCDEFGHJKMNPQRSTVWXYZ'; v_ref text;
begin
  loop
    v_ref:='ACT-'||lpad(p_year::text,4,'0')||'-'||(select string_agg(substr(v_alphabet,1+floor(random()*32)::int,1),'') from generate_series(1,6));
    exit when not exists(select 1 from public.community_credit_activities where reference=v_ref);
  end loop;
  return v_ref;
end; $$;

create function public.community_credit_require_resident_self(p_resident_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.barangay_residents r join public.profiles p on p.id=r.profile_id
      where r.id=p_resident_id and p.id=auth.uid() and p.role='resident') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
end; $$;

-- ── Reference data: the five prototype rules (not inserted anywhere) ──────
create function public.community_credit_v2_prototype_rules()
returns table(rule_code text,title text,points integer,annual_points_cap integer,evidence_requirement text,accessible_alternative text)
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.community_credit_require_admin();
  return query select * from (values
    ('CLEANUP_DRIVE','Community clean-up drive',5,20,'Attendance sheet for the activity reference, countersigned by the assigned official','Registration-desk or seated materials duty at the same session'),
    ('VOLUNTEER_SERVICE','Volunteer service at a barangay activity',5,30,'Assignment list and attendance confirmation for the task','A seated or hall-based task of equal duration'),
    ('DRRM_TRAINING','Disaster-preparedness training or drill',10,20,'Completion list or training attendance record','A recognised accessible session or outside training'),
    ('COMMUNITY_PROGRAM','Approved community program',5,20,'Program attendance sheet','A hall-based or remote support role for the program'),
    ('COMMUNITY_SERVICE_TERM','Completed volunteer service term',10,10,'Written confirmation of the role and term, signed by a records administrator','A volunteer role adapted to the resident''s access needs')
  ) v(rule_code,title,points,annual_points_cap,evidence_requirement,accessible_alternative);
end; $$;

-- ── V2 policy and rule preparation and approval ────────────────────────────
create function public.save_community_credit_v2_policy(p_id uuid,p_name text,p_description text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform public.community_credit_require_admin();
  if p_id is null then
    insert into public.community_credit_policies(name,description,base_score,minimum_score,maximum_score,policy_model,prepared_by,created_by,updated_by)
    values(btrim(p_name),coalesce(btrim(p_description),''),100,0,100,'participation_v2',auth.uid(),auth.uid(),auth.uid()) returning id into v_id;
    insert into public.activity_log(action,entity_type,entity_id,subject) values('added','community_credit_policy',v_id,'Participation policy prepared');
  else
    update public.community_credit_policies set name=btrim(p_name),description=coalesce(btrim(p_description),''),prepared_by=auth.uid(),
      updated_by=auth.uid(),updated_at=now()
    where id=p_id and policy_model='participation_v2' and status='draft' and approved_by is null returning id into v_id;
    if v_id is null then raise exception 'Only an unapproved participation draft can be edited'; end if;
    insert into public.activity_log(action,entity_type,entity_id,subject) values('edited','community_credit_policy',v_id,'Participation policy draft updated');
  end if;
  return v_id;
end; $$;

create function public.approve_community_credit_v2_policy(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_policy public.community_credit_policies%rowtype;
begin
  perform public.community_credit_require_admin();
  select * into v_policy from public.community_credit_policies where id=p_id for update;
  if not found or v_policy.policy_model<>'participation_v2' or v_policy.status<>'draft' or v_policy.approved_by is not null then
    raise exception 'Only an unapproved participation draft can be approved'; end if;
  if v_policy.prepared_by=auth.uid() then raise exception 'A different records administrator must approve this policy'; end if;
  update public.community_credit_policies set approved_by=auth.uid(),approved_at=now(),updated_by=auth.uid(),updated_at=now() where id=p_id;
  insert into public.activity_log(action,entity_type,entity_id,subject) values('approved','community_credit_policy',p_id,'Participation policy approved');
  return jsonb_build_object('policy_id',p_id,'approved',true);
end; $$;

create function public.save_community_credit_v2_rule(p_id uuid,p_policy_id uuid,p_rule_code text,p_title text,p_description text,
  p_points integer,p_annual_points_cap integer,p_evidence_requirement text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform public.community_credit_require_admin();
  if not exists(select 1 from public.community_credit_policies where id=p_policy_id and policy_model='participation_v2' and status in ('draft','active')) then
    raise exception 'Rules require a draft or active participation policy'; end if;
  if p_id is null then
    insert into public.community_credit_rules(policy_id,rule_code,title,description,category,source_domain,points_delta,repairable,
      annual_points_cap,evidence_requirement,prepared_by,created_by,updated_by)
    values(p_policy_id,upper(btrim(p_rule_code)),btrim(p_title),coalesce(btrim(p_description),''),'positive','community_activity',p_points,false,
      p_annual_points_cap,btrim(p_evidence_requirement),auth.uid(),auth.uid(),auth.uid()) returning id into v_id;
    insert into public.activity_log(action,entity_type,entity_id,subject) values('added','community_credit_rule',v_id,'Participation rule prepared');
  else
    update public.community_credit_rules set rule_code=upper(btrim(p_rule_code)),title=btrim(p_title),description=coalesce(btrim(p_description),''),
      points_delta=p_points,annual_points_cap=p_annual_points_cap,evidence_requirement=btrim(p_evidence_requirement),prepared_by=auth.uid(),
      updated_by=auth.uid(),updated_at=now()
    where id=p_id and policy_id=p_policy_id and approved_by is null and active=false returning id into v_id;
    if v_id is null then raise exception 'Only an unapproved, disabled participation rule can be edited'; end if;
    insert into public.activity_log(action,entity_type,entity_id,subject) values('edited','community_credit_rule',v_id,'Participation rule draft updated');
  end if;
  return v_id;
end; $$;

create function public.approve_community_credit_v2_rule(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rule public.community_credit_rules%rowtype;
begin
  perform public.community_credit_require_admin();
  select r.* into v_rule from public.community_credit_rules r join public.community_credit_policies p on p.id=r.policy_id
    where r.id=p_id and p.policy_model='participation_v2' and p.status in ('draft','active') for update of r;
  if not found or v_rule.approved_by is not null then raise exception 'Only an unapproved participation rule can be approved'; end if;
  if v_rule.prepared_by=auth.uid() then raise exception 'A different records administrator must approve this rule'; end if;
  perform public.community_credit_v2_writer(true);
  update public.community_credit_rules set approved_by=auth.uid(),approved_at=now(),updated_by=auth.uid(),updated_at=now() where id=p_id;
  perform public.community_credit_v2_writer(false);
  insert into public.activity_log(action,entity_type,entity_id,subject) values('approved','community_credit_rule',p_id,'Participation rule approved');
  return jsonb_build_object('rule_id',p_id,'approved',true);
end; $$;

-- ── Activities and participation ───────────────────────────────────────────
create function public.create_community_credit_activity(p_request_id uuid,p_rule_id uuid,p_title text,p_starts_at timestamptz,
  p_ends_at timestamptz,p_location_note text,p_evidence_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_prior jsonb; v_rule public.community_credit_rules%rowtype; v_date date; v_id uuid; v_ref text;
begin
  perform public.community_credit_require_admin();
  v_prior:=public.community_credit_request_claim(p_request_id,'create_activity',jsonb_build_object('rule_id',p_rule_id,'title',p_title,
    'starts_at',extract(epoch from p_starts_at),'ends_at',extract(epoch from p_ends_at),'location_note',p_location_note,'evidence_reference',p_evidence_reference));
  if v_prior is not null then return v_prior; end if;
  select r.* into v_rule from public.community_credit_rules r join public.community_credit_policies p on p.id=r.policy_id
    where r.id=p_rule_id and p.policy_model='participation_v2' and p.status='active' and r.active and r.approved_by is not null;
  if not found then raise exception 'Activities need an enabled, approved rule of the active participation policy'; end if;
  if p_starts_at is null then raise exception 'An activity needs a start date and time'; end if;
  if p_starts_at>now()+interval '366 days' then raise exception 'An activity cannot be scheduled more than a year ahead'; end if;
  v_date:=(p_starts_at at time zone 'Asia/Manila')::date;
  v_ref:=public.community_credit_activity_reference(extract(year from v_date)::int);
  perform public.community_credit_v2_writer(true);
  insert into public.community_credit_activities(reference,policy_id,rule_id,title,starts_at,ends_at,activity_date,cap_year,location_note,
    evidence_reference,created_by,request_id)
  values(v_ref,v_rule.policy_id,v_rule.id,btrim(p_title),p_starts_at,p_ends_at,v_date,extract(year from v_date)::int,nullif(btrim(p_location_note),''),
    btrim(p_evidence_reference),auth.uid(),p_request_id) returning id into v_id;
  insert into public.activity_log(action,entity_type,entity_id,subject) values('added','community_credit_activity',v_id,'Community activity recorded');
  return public.community_credit_request_finish(p_request_id,jsonb_build_object('activity_id',v_id,'reference',v_ref,'activity_date',v_date,
    'cap_year',extract(year from v_date)::int,'rule_code',v_rule.rule_code));
end; $$;

create function public.community_credit_activities_list(p_year integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.community_credit_require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'reference',a.reference,'policy_id',a.policy_id,'rule_id',a.rule_id,
    'rule_code',r.rule_code,'rule_title',r.title,'points',r.points_delta,'title',a.title,'starts_at',a.starts_at,'ends_at',a.ends_at,
    'activity_date',a.activity_date,'cap_year',a.cap_year,'location_note',a.location_note,'evidence_reference',a.evidence_reference,
    'created_at',a.created_at,
    'participants',(select count(*) from public.community_credit_participations x where x.activity_id=a.id),
    'awarded',(select count(*) from public.community_credit_participations x where x.activity_id=a.id and x.state='awarded'),
    'capped',(select count(*) from public.community_credit_participations x where x.activity_id=a.id and x.state='capped'))
    order by a.activity_date desc,a.created_at desc)
    from public.community_credit_activities a join public.community_credit_rules r on r.id=a.rule_id
    where p_year is null or a.cap_year=p_year),'[]'::jsonb);
end; $$;

create function public.community_credit_check_participant(p_activity_id uuid,p_resident_id uuid,p_lock_policy boolean)
returns public.community_credit_activities language plpgsql security definer set search_path='' as $$
declare v_act public.community_credit_activities%rowtype; v_policy public.community_credit_policies%rowtype; v_started timestamptz;
begin
  select * into v_act from public.community_credit_activities where id=p_activity_id;
  if not found then raise exception 'Activity unavailable'; end if;
  if p_lock_policy then
    select * into v_policy from public.community_credit_policies where id=v_act.policy_id for share;
  else
    select * into v_policy from public.community_credit_policies where id=v_act.policy_id;
  end if;
  if v_policy.policy_model<>'participation_v2' or v_policy.status<>'active' then raise exception 'The activity''s participation policy is not active'; end if;
  if v_act.starts_at>now() then raise exception 'Participation can be verified only after the activity has started'; end if;
  if not exists(select 1 from public.barangay_residents r where r.id=p_resident_id and r.resident_status='active') then
    raise exception 'Only an active resident can receive participation points'; end if;
  select started_at into v_started from public.community_credit_enrollments where resident_id=p_resident_id and policy_id=v_act.policy_id;
  if v_started is null then raise exception 'Resident is not enrolled in the participation policy'; end if;
  if v_act.activity_date<(v_started at time zone 'Asia/Manila')::date then raise exception 'The activity took place before the resident''s enrollment'; end if;
  return v_act;
end; $$;

create function public.verify_community_credit_participation(p_request_id uuid,p_activity_id uuid,p_resident_id uuid,p_mode text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_prior jsonb; v_act public.community_credit_activities%rowtype; v_inserted uuid;
begin
  perform public.community_credit_require_admin();
  v_prior:=public.community_credit_request_claim(p_request_id,'verify_participation',jsonb_build_object('activity_id',p_activity_id,
    'resident_id',p_resident_id,'mode',p_mode,'note',p_note));
  if v_prior is not null then return v_prior; end if;
  if p_mode is null or p_mode not in ('in_person','accessible_alternative') then raise exception 'Choose in-person or accessible-alternative participation'; end if;
  v_act:=public.community_credit_check_participant(p_activity_id,p_resident_id,false);
  perform public.community_credit_v2_writer(true);
  insert into public.community_credit_participations(activity_id,resident_id,policy_id,participation_mode,verification_note,verified_by)
    values(p_activity_id,p_resident_id,v_act.policy_id,p_mode,nullif(btrim(p_note),''),auth.uid())
    on conflict(activity_id,resident_id) do nothing returning activity_id into v_inserted;
  if v_inserted is null then raise exception 'Participation is already verified for this resident and activity'; end if;
  insert into public.activity_log(action,entity_type,entity_id,subject) values('verified','community_credit_activity',p_activity_id,'Participation verified');
  return public.community_credit_request_finish(p_request_id,jsonb_build_object('activity_id',p_activity_id,'resident_id',p_resident_id,'state','verified'));
end; $$;

-- Assumes the caller already holds the participation row lock.
create function public.community_credit_record_award(p_activity_id uuid,p_resident_id uuid,p_reason text,p_reaward_of uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_act public.community_credit_activities%rowtype; v_rule public.community_credit_rules%rowtype; v_used bigint; v_event uuid;
begin
  v_act:=public.community_credit_check_participant(p_activity_id,p_resident_id,true);
  select * into v_rule from public.community_credit_rules where id=v_act.rule_id;
  if not v_rule.active or v_rule.approved_by is null then raise exception 'The activity''s rule is not enabled'; end if;
  insert into public.community_credit_cap_locks(policy_id,resident_id,rule_id,cap_year) values(v_act.policy_id,p_resident_id,v_rule.id,v_act.cap_year)
    on conflict do nothing;
  perform 1 from public.community_credit_cap_locks where policy_id=v_act.policy_id and resident_id=p_resident_id and rule_id=v_rule.id
    and cap_year=v_act.cap_year for update;
  select coalesce(sum(e.points_delta_snapshot),0) into v_used from public.community_credit_events e
    join public.community_credit_activities a on a.id=e.participation_activity_id
    where e.policy_id=v_act.policy_id and e.resident_id=p_resident_id and e.rule_id=v_rule.id and a.cap_year=v_act.cap_year;
  perform public.community_credit_v2_writer(true);
  if v_used+v_rule.points_delta>v_rule.annual_points_cap then
    update public.community_credit_participations set state='capped',version=version+1,updated_at=now()
      where activity_id=p_activity_id and resident_id=p_resident_id;
    return jsonb_build_object('state','capped','points',0,'annual_points_cap',v_rule.annual_points_cap,'used_this_year',v_used,
      'cap_year',v_act.cap_year,'message','Annual maximum reached for this activity; participation is recorded without points.');
  end if;
  insert into public.community_credit_events(resident_id,policy_id,rule_id,event_kind,rule_code_snapshot,rule_title_snapshot,points_delta_snapshot,
    source_type,source_id,source_reference_snapshot,verified_by,verified_at,participation_activity_id,participation_resident_id,reason,reaward_of_event_id,request_id)
  values(p_resident_id,v_act.policy_id,v_rule.id,'positive','-','-',1,'community_activity',v_act.id,v_act.reference,auth.uid(),now(),
    p_activity_id,p_resident_id,p_reason,p_reaward_of,p_request_id) returning id into v_event;
  update public.community_credit_participations set state='awarded',active_award_event_id=v_event,version=version+1,updated_at=now()
    where activity_id=p_activity_id and resident_id=p_resident_id;
  insert into public.activity_log(action,entity_type,entity_id,subject)
    values('added','community_credit_award',v_event,case when p_reaward_of is null then 'Participation points awarded' else 'Participation points re-awarded' end);
  return jsonb_build_object('state','awarded','event_id',v_event,'points',v_rule.points_delta,'annual_points_cap',v_rule.annual_points_cap,
    'used_this_year',v_used+v_rule.points_delta,'cap_year',v_act.cap_year);
end; $$;

create function public.award_community_credit_participation(p_request_id uuid,p_activity_id uuid,p_resident_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_prior jsonb; v_part public.community_credit_participations%rowtype;
begin
  perform public.community_credit_require_admin();
  v_prior:=public.community_credit_request_claim(p_request_id,'award',jsonb_build_object('activity_id',p_activity_id,'resident_id',p_resident_id));
  if v_prior is not null then return v_prior; end if;
  select * into v_part from public.community_credit_participations where activity_id=p_activity_id and resident_id=p_resident_id for update;
  if not found then raise exception 'Verify the resident''s participation before awarding points'; end if;
  if v_part.state='awarded' then raise exception 'Points have already been awarded for this participation'; end if;
  if v_part.state='reversed' then raise exception 'This award was reversed; a re-award needs the re-award workflow and a reason'; end if;
  return public.community_credit_request_finish(p_request_id,public.community_credit_record_award(p_activity_id,p_resident_id,null,null,p_request_id));
end; $$;

create function public.reverse_community_credit_award(p_request_id uuid,p_event_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_prior jsonb; v_event public.community_credit_events%rowtype; v_part public.community_credit_participations%rowtype; v_new uuid;
begin
  perform public.community_credit_require_admin();
  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then raise exception 'A reversal needs a reason'; end if;
  v_prior:=public.community_credit_request_claim(p_request_id,'reverse',jsonb_build_object('event_id',p_event_id,'reason',p_reason));
  if v_prior is not null then return v_prior; end if;
  select * into v_event from public.community_credit_events where id=p_event_id;
  if not found or v_event.participation_activity_id is null or v_event.reverses_event_id is not null or v_event.event_kind<>'positive' then
    raise exception 'Only a participation award can be reversed'; end if;
  select * into v_part from public.community_credit_participations
    where activity_id=v_event.participation_activity_id and resident_id=v_event.participation_resident_id for update;
  if v_part.active_award_event_id is distinct from p_event_id then raise exception 'This award is not active; it may already have been reversed'; end if;
  if v_event.verified_by=auth.uid() then raise exception 'An award must be reversed by a different records administrator'; end if;
  if not exists(select 1 from public.community_credit_policies where id=v_event.policy_id and status='active' and policy_model='participation_v2') then
    raise exception 'Awards of a retired policy are kept as history'; end if;
  perform public.community_credit_v2_writer(true);
  insert into public.community_credit_events(resident_id,policy_id,rule_id,event_kind,rule_code_snapshot,rule_title_snapshot,points_delta_snapshot,
    source_type,source_id,source_reference_snapshot,verified_by,verified_at,reverses_event_id,participation_activity_id,participation_resident_id,reason,request_id)
  values(v_event.resident_id,v_event.policy_id,v_event.rule_id,'correction','-','-',-1,'community_activity',v_event.source_id,v_event.source_reference_snapshot,
    auth.uid(),now(),v_event.id,v_event.participation_activity_id,v_event.participation_resident_id,btrim(p_reason),p_request_id) returning id into v_new;
  update public.community_credit_participations set state='reversed',active_award_event_id=null,last_reversed_event_id=v_event.id,
    version=version+1,updated_at=now() where activity_id=v_part.activity_id and resident_id=v_part.resident_id;
  insert into public.activity_log(action,entity_type,entity_id,subject) values('cancelled','community_credit_award',v_event.id,'Participation award reversed');
  return public.community_credit_request_finish(p_request_id,jsonb_build_object('state','reversed','reversed_event_id',v_event.id,
    'reversal_event_id',v_new,'points',-v_event.points_delta_snapshot));
end; $$;

create function public.reaward_community_credit_participation(p_request_id uuid,p_activity_id uuid,p_resident_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_prior jsonb; v_part public.community_credit_participations%rowtype; v_reverser uuid;
begin
  perform public.community_credit_require_admin();
  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then raise exception 'A re-award needs a reason'; end if;
  v_prior:=public.community_credit_request_claim(p_request_id,'reaward',jsonb_build_object('activity_id',p_activity_id,'resident_id',p_resident_id,'reason',p_reason));
  if v_prior is not null then return v_prior; end if;
  select * into v_part from public.community_credit_participations where activity_id=p_activity_id and resident_id=p_resident_id for update;
  if not found or v_part.state<>'reversed' then raise exception 'Only a reversed award can be re-awarded'; end if;
  select verified_by into v_reverser from public.community_credit_events where reverses_event_id=v_part.last_reversed_event_id;
  if v_reverser=auth.uid() then raise exception 'A re-award must be made by a different records administrator from the one who reversed it'; end if;
  if exists(select 1 from public.community_credit_events where reaward_of_event_id=v_part.last_reversed_event_id) then
    raise exception 'This reversed award has already been re-awarded'; end if;
  return public.community_credit_request_finish(p_request_id,public.community_credit_record_award(p_activity_id,p_resident_id,btrim(p_reason),
    v_part.last_reversed_event_id,p_request_id));
end; $$;

-- ── Resident correction requests ───────────────────────────────────────────
create function public.submit_community_credit_correction_request(p_request_id uuid,p_kind text,p_event_id uuid,p_activity_reference text,p_message text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_prior jsonb; v_resident uuid; v_policy uuid; v_activity uuid; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select r.id into v_resident from public.barangay_residents r join public.profiles p on p.id=r.profile_id where p.id=auth.uid() and p.role='resident';
  if v_resident is null then raise exception 'Not authorized' using errcode='42501'; end if;
  v_prior:=public.community_credit_request_claim(p_request_id,'correction_request',jsonb_build_object('kind',p_kind,'event_id',p_event_id,
    'activity_reference',p_activity_reference,'message',p_message));
  if v_prior is not null then return v_prior; end if;
  select id into v_policy from public.community_credit_policies where status='active' and policy_model='participation_v2';
  if v_policy is null then raise exception 'Correction requests are available while the participation policy is active'; end if;
  if p_kind='award_correction' then
    if not exists(select 1 from public.community_credit_events where id=p_event_id and resident_id=v_resident and policy_id=v_policy
        and participation_activity_id is not null) then raise exception 'Choose one of your own participation records'; end if;
  elsif p_kind='missing_activity' then
    if p_event_id is not null then raise exception 'A missing-activity report does not refer to an award'; end if;
    select id into v_activity from public.community_credit_activities where reference=upper(btrim(p_activity_reference)) and policy_id=v_policy;
  else raise exception 'Unknown request type'; end if;
  perform public.community_credit_v2_writer(true);
  insert into public.community_credit_correction_requests(resident_id,policy_id,request_kind,event_id,activity_id,activity_description,message,submitted_by,request_id)
  values(v_resident,v_policy,p_kind,p_event_id,v_activity,nullif(btrim(coalesce(p_activity_reference,'')),''),btrim(p_message),auth.uid(),p_request_id)
  returning id into v_id;
  return public.community_credit_request_finish(p_request_id,jsonb_build_object('correction_request_id',v_id,'status','submitted'));
end; $$;

create function public.community_credit_correction_json(p public.community_credit_correction_requests)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p.id,'resident_id',p.resident_id,'request_kind',p.request_kind,'event_id',p.event_id,
    'activity_reference',(select reference from public.community_credit_activities where id=p.activity_id),'activity_description',p.activity_description,
    'message',p.message,'status',p.status,'submitted_at',p.submitted_at,'resolved_at',p.resolved_at,'resolution_reason',p.resolution_reason);
$$;

create function public.my_community_credit_correction_requests()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_resident uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select r.id into v_resident from public.barangay_residents r join public.profiles p on p.id=r.profile_id where p.id=auth.uid() and p.role='resident';
  if v_resident is null then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(public.community_credit_correction_json(c) order by c.submitted_at desc)
    from public.community_credit_correction_requests c where c.resident_id=v_resident),'[]'::jsonb);
end; $$;

create function public.community_credit_correction_requests_admin(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.community_credit_require_admin();
  return coalesce((select jsonb_agg(public.community_credit_correction_json(c)||jsonb_build_object('resident_name',
      concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix)) order by c.submitted_at)
    from public.community_credit_correction_requests c join public.barangay_residents r on r.id=c.resident_id
    where p_status is null or c.status=p_status),'[]'::jsonb);
end; $$;

create function public.resolve_community_credit_correction_request(p_id uuid,p_decision text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_req public.community_credit_correction_requests%rowtype;
begin
  perform public.community_credit_require_admin();
  if p_decision is null or p_decision not in ('approved','declined') then raise exception 'Approve or decline the request'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 3 and 500 then raise exception 'A resolution needs a reason'; end if;
  select * into v_req from public.community_credit_correction_requests where id=p_id for update;
  if not found or v_req.status<>'submitted' then raise exception 'Only a submitted request can be resolved'; end if;
  if v_req.request_kind='award_correction' and exists(select 1 from public.community_credit_events where id=v_req.event_id and verified_by=auth.uid()) then
    raise exception 'A different records administrator must review a correction of their own award'; end if;
  perform public.community_credit_v2_writer(true);
  update public.community_credit_correction_requests set status=p_decision,resolved_by=auth.uid(),resolved_at=now(),resolution_reason=btrim(p_reason)
    where id=p_id;
  perform public.community_credit_v2_writer(false);
  insert into public.activity_log(action,entity_type,entity_id,subject)
    values(p_decision,'community_credit_correction',p_id,case when p_decision='approved' then 'Correction request approved' else 'Correction request declined' end);
  return jsonb_build_object('correction_request_id',p_id,'status',p_decision,'points_changed',false);
end; $$;

-- ── Profile: 060's V1 output kept, plus status/gauge; a V2 shape for V2 ────
create or replace function public.community_credit_profile(p_resident_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_resident public.barangay_residents%rowtype; v_policy public.community_credit_policies%rowtype;
 v_enrollment public.community_credit_enrollments%rowtype; v_total bigint; v_result jsonb; v_ledger jsonb; v_res jsonb; v_prev boolean;
 v_year int:=extract(year from (now() at time zone 'Asia/Manila'))::int; v_score int;
begin
  if p_resident_id is null or not public.community_credit_may_view_resident(p_resident_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_resident from public.barangay_residents where id=p_resident_id;
  if not found then raise exception 'Resident unavailable'; end if;
  v_res:=jsonb_build_object('id',v_resident.id,'full_name',concat_ws(' ',v_resident.first_name,v_resident.middle_name,v_resident.last_name,v_resident.suffix),
   'purok',v_resident.purok,'resident_status',v_resident.resident_status,'account_linked',v_resident.profile_id is not null);
  v_prev:=exists(select 1 from public.community_credit_enrollments e join public.community_credit_policies p on p.id=e.policy_id
    where e.resident_id=p_resident_id and p.status='retired');
  select * into v_policy from public.community_credit_policies where status='active';
  if not found then return jsonb_build_object('configured',false,'status','not_configured','message','Community credit policy is not configured.','resident',v_res,
   'ledger','[]'::jsonb,'historical_review',jsonb_build_object('available',false,'threshold',5),'has_previous_policies',v_prev,
   'gauge',jsonb_build_object('status','not_configured','model',null,'value',null,'minimum',0,'maximum',100)); end if;
  select * into v_enrollment from public.community_credit_enrollments where resident_id=p_resident_id and policy_id=v_policy.id;
  if not found then return jsonb_build_object('configured',true,'enrolled',false,'status','not_enrolled','policy_model',v_policy.policy_model,
   'message','Community credit enrollment has not started for this resident.',
   'policy_id',v_policy.id,'policy_name',v_policy.name,'minimum_score',0,'maximum_score',100,'resident',v_res,'ledger','[]'::jsonb,
   'historical_review',jsonb_build_object('available',false,'threshold',5),'has_previous_policies',v_prev,
   'gauge',jsonb_build_object('status','not_enrolled','model',v_policy.policy_model,'value',null,'minimum',0,'maximum',100)); end if;
  if v_policy.policy_model='legacy_v1' then
    select coalesce(sum(e.points_delta_snapshot),0),coalesce(jsonb_agg(jsonb_build_object('id',e.id,'created_at',e.created_at,
     'verified_at',e.verified_at,'event',e.rule_title_snapshot,'rule_code',e.rule_code_snapshot,'category',e.event_kind,'points',e.points_delta_snapshot,
     'source',e.source_type,'source_reference',e.source_reference_snapshot,'verified_by',coalesce(p.full_name,'Verified official'),'note',e.note,
     'reverses_event_id',e.reverses_event_id) order by e.created_at desc,e.id desc),'[]'::jsonb) into v_total,v_ledger
    -- verified_at is the authoritative decision date; created_at only records when the database row was created.
    from public.community_credit_events e left join public.profiles p on p.id=e.verified_by
    where e.resident_id=p_resident_id and e.policy_id=v_policy.id and e.verified_at>=v_enrollment.started_at;
    select jsonb_build_object('configured',true,'enrolled',true,'resident_id',v_resident.id,'policy_id',v_policy.id,'policy_name',v_policy.name,
     'policy_description',v_policy.description,'credit_started_at',v_enrollment.started_at,'starting_score',v_enrollment.starting_score,
     'base_score',v_enrollment.starting_score,'event_total',v_total,'current_score',greatest(0,least(100,v_enrollment.starting_score+v_total)),
     'minimum_score',0,'maximum_score',100,'positive_event_count',count(*) filter(where e.event_kind='positive'),
     'negative_event_count',count(*) filter(where e.event_kind='negative'),'repair_event_count',count(*) filter(where e.event_kind='repair'),
     'correction_event_count',count(*) filter(where e.event_kind='correction'),'last_credit_event_at',max(e.created_at),
     'resident',v_res,'ledger',v_ledger,'historical_review',jsonb_build_object('available',false,'threshold',5)) into v_result
    from public.community_credit_events e where e.resident_id=p_resident_id and e.policy_id=v_policy.id and e.verified_at>=v_enrollment.started_at;
    return v_result||jsonb_build_object('status','enrolled','policy_model','legacy_v1','has_previous_policies',v_prev,
      'gauge',jsonb_build_object('status','enrolled','model','legacy_v1','value',(v_result->>'current_score')::int,'minimum',0,'maximum',100));
  end if;
  select coalesce(sum(e.points_delta_snapshot),0) into v_total from public.community_credit_events e
    where e.resident_id=p_resident_id and e.policy_id=v_policy.id and e.verified_at>=v_enrollment.started_at;
  v_score:=greatest(0,least(100,v_enrollment.starting_score+v_total))::int;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',case when e.reverses_event_id is not null then 'reversal'
      when e.reaward_of_event_id is not null then 'reaward' else 'award' end,'event',e.rule_title_snapshot,'rule_code',e.rule_code_snapshot,
    'points',e.points_delta_snapshot,'activity_reference',a.reference,'activity_title',a.title,'activity_date',a.activity_date,
    'participation_mode',x.participation_mode,'verified_by',coalesce(p.full_name,'Records administrator'),'verified_at',e.verified_at,
    'reason',e.reason,'reverses_event_id',e.reverses_event_id,'reaward_of_event_id',e.reaward_of_event_id,
    'reversed',exists(select 1 from public.community_credit_events r where r.reverses_event_id=e.id))
    order by e.verified_at desc,e.id desc),'[]'::jsonb) into v_ledger
  from public.community_credit_events e left join public.profiles p on p.id=e.verified_by
  left join public.community_credit_activities a on a.id=e.participation_activity_id
  left join public.community_credit_participations x on x.activity_id=e.participation_activity_id and x.resident_id=e.participation_resident_id
  where e.resident_id=p_resident_id and e.policy_id=v_policy.id and e.verified_at>=v_enrollment.started_at;
  return jsonb_build_object('configured',true,'enrolled',true,'status','enrolled','policy_model','participation_v2',
    'resident_id',v_resident.id,'resident',v_res,'policy_id',v_policy.id,'policy_name',v_policy.name,'policy_description',v_policy.description,
    'credit_started_at',v_enrollment.started_at,'starting_score',v_enrollment.starting_score,'minimum_score',0,'maximum_score',100,
    'points_recorded',v_total,'current_score',v_score,'at_maximum',v_total>=100,'milestone',public.community_credit_milestone(v_total),
    'active_award_count',(select count(*) from public.community_credit_participations x where x.resident_id=p_resident_id and x.policy_id=v_policy.id and x.state='awarded'),
    'last_award_at',(select max(e.verified_at) from public.community_credit_events e where e.resident_id=p_resident_id and e.policy_id=v_policy.id and e.event_kind='positive'),
    'this_year',jsonb_build_object('year',v_year,'by_rule',coalesce((select jsonb_agg(jsonb_build_object('rule_code',r.rule_code,'title',r.title,
      'points',r.points_delta,'annual_points_cap',r.annual_points_cap,'used',u.used,'remaining',greatest(0,r.annual_points_cap-u.used)) order by r.rule_code)
      from public.community_credit_rules r cross join lateral (select coalesce(sum(e.points_delta_snapshot),0)::int used
        from public.community_credit_events e join public.community_credit_activities a on a.id=e.participation_activity_id
        where e.resident_id=p_resident_id and e.policy_id=v_policy.id and e.rule_id=r.id and a.cap_year=v_year) u
      where r.policy_id=v_policy.id and r.approved_by is not null),'[]'::jsonb)),
    'participations_without_points',coalesce((select jsonb_agg(jsonb_build_object('activity_reference',a.reference,'activity_title',a.title,
      'activity_date',a.activity_date,'state',x.state) order by a.activity_date desc) from public.community_credit_participations x
      join public.community_credit_activities a on a.id=x.activity_id where x.resident_id=p_resident_id and x.policy_id=v_policy.id and x.state in ('verified','capped')),'[]'::jsonb),
    'ledger',v_ledger,'has_previous_policies',v_prev,
    'transition_notice',case when v_prev then 'This policy starts at 100 points for everyone. Verified participation contributes positive points up to the 100-point ceiling. Your record under the previous policy is kept.' end,
    'service_notice','Participation points recognise volunteering. They do not affect eligibility for any barangay service.',
    'gauge',jsonb_build_object('status','enrolled','model','participation_v2','value',v_score,'minimum',0,'maximum',100,'points_recorded',v_total,
      'at_maximum',v_total>=100,'milestone',public.community_credit_milestone(v_total),'milestones',public.community_credit_milestones()));
end; $$;

create function public.community_credit_policy_history(p_resident_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_resident_id is null or not public.community_credit_may_view_resident(p_resident_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('policy_id',p.id,'policy_name',p.name,'policy_model',p.policy_model,'status',p.status,
    'label','Previous policy (retired)','effective_from',p.effective_from,'status_changed_at',p.updated_at,'credit_started_at',e.started_at,
    'starting_score',e.starting_score,'points_total',t.total,'final_score',greatest(p.minimum_score,least(p.maximum_score,e.starting_score+t.total)),
    'event_count',t.n,'ledger',t.ledger) order by p.effective_from desc nulls last)
    from public.community_credit_enrollments e join public.community_credit_policies p on p.id=e.policy_id
    cross join lateral (select coalesce(sum(v.points_delta_snapshot),0) total,count(v.id) n,coalesce(jsonb_agg(jsonb_build_object('id',v.id,
      'verified_at',v.verified_at,'event',v.rule_title_snapshot,'rule_code',v.rule_code_snapshot,'category',v.event_kind,'points',v.points_delta_snapshot,
      'source_reference',v.source_reference_snapshot,'reason',v.reason,'reverses_event_id',v.reverses_event_id) order by v.verified_at desc,v.id desc)
      filter (where v.id is not null),'[]'::jsonb) ledger
      from public.community_credit_events v where v.resident_id=e.resident_id and v.policy_id=e.policy_id and v.verified_at>=e.started_at) t
    where e.resident_id=p_resident_id and p.status='retired'),'[]'::jsonb);
end; $$;

create function public.my_community_credit_policy_history()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select r.id into v_id from public.barangay_residents r join public.profiles p on p.id=r.profile_id where p.id=auth.uid() and p.role='resident';
  if v_id is null then return jsonb_build_object('linked',false,'policies','[]'::jsonb); end if;
  return jsonb_build_object('linked',true,'policies',public.community_credit_policy_history(v_id));
end; $$;

-- ── Aggregate (any active official): buckets, small counts suppressed ─────
create function public.community_credit_aggregate()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_policy public.community_credit_policies%rowtype; v_buckets jsonb; v_small int:=3;
begin
  if auth.uid() is null or not public.current_official_is_active() then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_policy from public.community_credit_policies where status='active';
  if not found then return jsonb_build_object('configured',false); end if;
  if v_policy.policy_model<>'participation_v2' then
    return jsonb_build_object('configured',true,'policy_model',v_policy.policy_model,'available',false,
      'message','Aggregate participation analytics are available for the participation policy only.');
  end if;
  with scores as (
    select e.resident_id,greatest(0,least(100,coalesce(sum(v.points_delta_snapshot),0)))::int score
    from public.community_credit_enrollments e left join public.community_credit_events v on v.resident_id=e.resident_id and v.policy_id=e.policy_id
    where e.policy_id=v_policy.id group by e.resident_id),
  counted as (
    select m->>'code' code,m->>'neutral_label' label,(m->>'lower')::int lower_bound,(m->>'upper')::int upper_bound,
      (select count(*) from scores s where s.score between (m->>'lower')::int and (m->>'upper')::int)::int n
    from jsonb_array_elements(public.community_credit_milestones()) m),
  primary_hidden as (select c.*,c.n between 1 and v_small-1 hidden from counted c),
  secondary as (
    select p.*,(p.hidden or coalesce((select count(*) from primary_hidden where hidden)=1 and p.code=(select code from primary_hidden
      where not hidden and n>0 order by n,lower_bound limit 1),false)) suppressed from primary_hidden p)
  select jsonb_agg(jsonb_build_object('code',code,'label',label,'lower',lower_bound,'upper',upper_bound,
    'residents',case when suppressed then null else n end,'suppressed',suppressed) order by lower_bound) into v_buckets from secondary;
  return jsonb_build_object('configured',true,'policy_model','participation_v2','available',true,'policy_id',v_policy.id,
    'small_count_threshold',v_small,'buckets',v_buckets,
    'activities',(select count(*) from public.community_credit_activities where policy_id=v_policy.id),
    'verified_participations',(select count(*) from public.community_credit_participations where policy_id=v_policy.id),
    'note','Counts under 3 are not shown, so no individual can be identified. Participation points do not affect eligibility for any barangay service.');
end; $$;

-- ── Transition: preflight, prepare, approve, cancel ────────────────────────
create function public.community_credit_transition_preflight()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_active public.community_credit_policies%rowtype;
begin
  perform public.community_credit_require_admin();
  select * into v_active from public.community_credit_policies where status='active';
  return jsonb_build_object('generated_at',now(),
    'active_policy',case when v_active.id is null then null else jsonb_build_object('id',v_active.id,'name',v_active.name,'policy_model',v_active.policy_model,
      'effective_from',v_active.effective_from,
      'enrollments',(select count(*) from public.community_credit_enrollments where policy_id=v_active.id),
      'events_by_kind',coalesce((select jsonb_object_agg(event_kind,n) from (select event_kind,count(*) n from public.community_credit_events
        where policy_id=v_active.id group by event_kind) x),'{}'::jsonb),
      'rules_by_category',coalesce((select jsonb_object_agg(category,n) from (select category,count(*) n from public.community_credit_rules
        where policy_id=v_active.id group by category) x),'{}'::jsonb),
      'punitive_rules',(select count(*) from public.community_credit_rules where policy_id=v_active.id and
        (category in ('negative','repair') or source_domain in ('incident_outcome','kp_outcome','credit_repair'))),
      'punitive_events',(select count(*) from public.community_credit_events e join public.community_credit_rules r on r.id=e.rule_id
        where e.policy_id=v_active.id and (r.category in ('negative','repair') or r.source_domain in ('incident_outcome','kp_outcome','credit_repair')))) end,
    'participation_drafts',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'approved',p.approved_by is not null,
      'approved_rules',(select count(*) from public.community_credit_rules r where r.policy_id=p.id and r.approved_by is not null),
      'enabled_rules',(select count(*) from public.community_credit_rules r where r.policy_id=p.id and r.approved_by is not null and r.active)) order by p.created_at)
      from public.community_credit_policies p where p.policy_model='participation_v2' and p.status='draft'),'[]'::jsonb),
    'active_residents',(select count(*) from public.barangay_residents where resident_status='active'),
    'open_transition',(select to_jsonb(t)-'preflight' from public.community_credit_transitions t where t.status='prepared'));
end; $$;

create function public.prepare_community_credit_transition(p_to_policy_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_to public.community_credit_policies%rowtype; v_from uuid; v_kind text; v_id uuid;
begin
  perform public.community_credit_require_admin();
  select * into v_to from public.community_credit_policies where id=p_to_policy_id;
  if not found then raise exception 'Policy unavailable'; end if;
  select id into v_from from public.community_credit_policies where status='active';
  if v_to.policy_model='participation_v2' and v_to.status='draft' then
    v_kind:='activate_participation_policy';
    if v_to.approved_by is null then raise exception 'The participation policy must be approved first'; end if;
    if not exists(select 1 from public.community_credit_rules where policy_id=v_to.id and approved_by is not null and active) then
      raise exception 'The participation policy needs at least one approved, enabled rule'; end if;
  elsif v_to.policy_model='legacy_v1' and v_to.status='retired' then
    v_kind:='emergency_restore_previous_policy';
    if v_from is null or not exists(select 1 from public.community_credit_policies where id=v_from and policy_model='participation_v2') then
      raise exception 'An emergency restore applies only while a participation policy is active'; end if;
  else raise exception 'Choose an approved participation draft, or a retired previous policy to restore'; end if;
  if exists(select 1 from public.community_credit_transitions where status='prepared') then raise exception 'Another transition is already prepared'; end if;
  perform public.community_credit_v2_writer(true);
  insert into public.community_credit_transitions(transition_kind,from_policy_id,to_policy_id,note,preflight,prepared_by)
    values(v_kind,v_from,v_to.id,btrim(p_note),public.community_credit_transition_preflight(),auth.uid()) returning id into v_id;
  perform public.community_credit_v2_writer(false);
  insert into public.activity_log(action,entity_type,entity_id,subject) values('added','community_credit_transition',v_id,'Community Credit transition prepared');
  return jsonb_build_object('transition_id',v_id,'transition_kind',v_kind,'from_policy_id',v_from,'to_policy_id',v_to.id,'status','prepared',
    'confirmation_required',case when v_kind='activate_participation_policy' then 'ACTIVATE PARTICIPATION POINTS' else 'RESTORE PREVIOUS POLICY' end);
end; $$;

create function public.approve_community_credit_transition(p_transition_id uuid,p_confirmation text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_t public.community_credit_transitions%rowtype; v_active uuid; v_to public.community_credit_policies%rowtype; v_added int; v_result jsonb;
begin
  perform public.community_credit_require_admin();
  select * into v_t from public.community_credit_transitions where id=p_transition_id for update;
  if not found or v_t.status<>'prepared' then raise exception 'Only a prepared transition can be approved'; end if;
  if v_t.prepared_by=auth.uid() then raise exception 'A different records administrator must approve this transition'; end if;
  if p_confirmation is distinct from (case when v_t.transition_kind='activate_participation_policy' then 'ACTIVATE PARTICIPATION POINTS' else 'RESTORE PREVIOUS POLICY' end) then
    raise exception 'Type the confirmation exactly to approve this transition'; end if;
  perform 1 from public.community_credit_policies where id in (v_t.to_policy_id,v_t.from_policy_id) order by id for update;
  select id into v_active from public.community_credit_policies where status='active';
  if v_active is distinct from v_t.from_policy_id then raise exception 'The active policy changed after this transition was prepared; prepare it again'; end if;
  select * into v_to from public.community_credit_policies where id=v_t.to_policy_id;
  perform public.community_credit_v2_writer(true);
  if v_t.transition_kind='activate_participation_policy' then
    if v_to.policy_model<>'participation_v2' or v_to.status<>'draft' or v_to.approved_by is null then raise exception 'The participation policy is no longer an approved draft'; end if;
    if v_t.from_policy_id is not null then
      update public.community_credit_policies set status='retired',updated_by=auth.uid(),updated_at=now() where id=v_t.from_policy_id;
    end if;
    update public.community_credit_policies set status='active',effective_from=now(),updated_by=auth.uid(),updated_at=now() where id=v_to.id;
  else
    if v_to.policy_model<>'legacy_v1' or v_to.status<>'retired' then raise exception 'The previous policy is no longer retired'; end if;
    update public.community_credit_policies set status='retired',updated_by=auth.uid(),updated_at=now() where id=v_t.from_policy_id;
    update public.community_credit_policies set status='active',updated_by=auth.uid(),updated_at=now() where id=v_to.id;
  end if;
  insert into public.community_credit_enrollments(resident_id,policy_id,starting_score,enrollment_source,created_by)
  select r.id,v_to.id,v_to.base_score,'policy_transition',auth.uid() from public.barangay_residents r where r.resident_status='active'
  on conflict(resident_id,policy_id) do nothing;
  get diagnostics v_added=row_count;
  v_result:=jsonb_build_object('transition_id',v_t.id,'transition_kind',v_t.transition_kind,'retired_policy_id',v_t.from_policy_id,
    'active_policy_id',v_to.id,'enrolled_now',v_added,'status','completed');
  update public.community_credit_transitions set status='completed',approved_by=auth.uid(),approved_at=now(),result=v_result where id=v_t.id;
  perform public.community_credit_v2_writer(false);
  insert into public.activity_log(action,entity_type,entity_id,subject) values('approved','community_credit_transition',v_t.id,
    case when v_t.transition_kind='activate_participation_policy' then 'Participation policy activated by two-person transition'
    else 'Previous policy restored by two-person emergency transition' end);
  return v_result;
end; $$;

create function public.cancel_community_credit_transition(p_transition_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.community_credit_require_admin();
  if p_reason is null or length(btrim(p_reason))<3 then raise exception 'A cancellation needs a reason'; end if;
  perform public.community_credit_v2_writer(true);
  update public.community_credit_transitions set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),cancel_reason=btrim(p_reason)
    where id=p_transition_id and status='prepared';
  if not found then raise exception 'Only a prepared transition can be cancelled'; end if;
  perform public.community_credit_v2_writer(false);
  insert into public.activity_log(action,entity_type,entity_id,subject) values('cancelled','community_credit_transition',p_transition_id,'Community Credit transition cancelled');
  return jsonb_build_object('transition_id',p_transition_id,'status','cancelled');
end; $$;

-- ── Grants ─────────────────────────────────────────────────────────────────
-- Every new function: no PUBLIC, anon or service_role EXECUTE (059's pattern).
revoke all on function public.community_credit_v2_writer(boolean),public.community_credit_v2_writer_on(),
  public.community_credit_guard_policy(),public.community_credit_guard_rule(),public.community_credit_guard_enrollment(),
  public.community_credit_guard_workflow_row(),public.community_credit_milestones(),public.community_credit_milestone(bigint),
  public.community_credit_request_claim(uuid,text,jsonb),public.community_credit_request_finish(uuid,jsonb),
  public.community_credit_activity_reference(integer),public.community_credit_require_resident_self(uuid),
  public.community_credit_check_participant(uuid,uuid,boolean),public.community_credit_record_award(uuid,uuid,text,uuid,uuid),
  public.community_credit_correction_json(public.community_credit_correction_requests),
  public.community_credit_v2_prototype_rules(),public.save_community_credit_v2_policy(uuid,text,text),public.approve_community_credit_v2_policy(uuid),
  public.save_community_credit_v2_rule(uuid,uuid,text,text,text,integer,integer,text),public.approve_community_credit_v2_rule(uuid),
  public.create_community_credit_activity(uuid,uuid,text,timestamptz,timestamptz,text,text),public.community_credit_activities_list(integer),
  public.verify_community_credit_participation(uuid,uuid,uuid,text,text),public.award_community_credit_participation(uuid,uuid,uuid),
  public.reverse_community_credit_award(uuid,uuid,text),public.reaward_community_credit_participation(uuid,uuid,uuid,text),
  public.submit_community_credit_correction_request(uuid,text,uuid,text,text),public.my_community_credit_correction_requests(),
  public.community_credit_correction_requests_admin(text),public.resolve_community_credit_correction_request(uuid,text,text),
  public.community_credit_policy_history(uuid),public.my_community_credit_policy_history(),public.community_credit_aggregate(),
  public.community_credit_transition_preflight(),public.prepare_community_credit_transition(uuid,text),
  public.approve_community_credit_transition(uuid,text),public.cancel_community_credit_transition(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function
  public.community_credit_v2_prototype_rules(),public.save_community_credit_v2_policy(uuid,text,text),public.approve_community_credit_v2_policy(uuid),
  public.save_community_credit_v2_rule(uuid,uuid,text,text,text,integer,integer,text),public.approve_community_credit_v2_rule(uuid),
  public.create_community_credit_activity(uuid,uuid,text,timestamptz,timestamptz,text,text),public.community_credit_activities_list(integer),
  public.verify_community_credit_participation(uuid,uuid,uuid,text,text),public.award_community_credit_participation(uuid,uuid,uuid),
  public.reverse_community_credit_award(uuid,uuid,text),public.reaward_community_credit_participation(uuid,uuid,uuid,text),
  public.submit_community_credit_correction_request(uuid,text,uuid,text,text),public.my_community_credit_correction_requests(),
  public.community_credit_correction_requests_admin(text),public.resolve_community_credit_correction_request(uuid,text,text),
  public.community_credit_policy_history(uuid),public.my_community_credit_policy_history(),public.community_credit_aggregate(),
  public.community_credit_transition_preflight(),public.prepare_community_credit_transition(uuid,text),
  public.approve_community_credit_transition(uuid,text),public.cancel_community_credit_transition(uuid,text)
  to authenticated;
-- The replaced 059/060 functions keep their own grants (CREATE OR REPLACE).

do $check$
declare v_bad int; v_prof int; v_new int; v_active uuid;
begin
  select count(*) into v_bad from (
    select b.kind,b.id from t067i_before b left join (
      select 'policy' kind,id,to_jsonb(p)-array['policy_model','prepared_by','approved_by','approved_at'] row from public.community_credit_policies p
      union all select 'rule',id,to_jsonb(r)-array['annual_points_cap','evidence_requirement','prepared_by','approved_by','approved_at'] from public.community_credit_rules r
      union all select 'enrollment',id,to_jsonb(e) from public.community_credit_enrollments e
      union all select 'event',id,to_jsonb(v)-array['participation_activity_id','participation_resident_id','reason','reaward_of_event_id','request_id'] from public.community_credit_events v
    ) a on a.kind=b.kind and a.id=b.id where a.row is distinct from b.row) x;
  if v_bad<>0 then raise exception 'INSTALL CHECK FAILED: % existing rows changed',v_bad; end if;
  if (select count(*) from t067i_before)<>(select count(*) from public.community_credit_policies)+(select count(*) from public.community_credit_rules)
      +(select count(*) from public.community_credit_enrollments)+(select count(*) from public.community_credit_events) then
    raise exception 'INSTALL CHECK FAILED: rows were added or removed'; end if;
  if exists(select 1 from public.community_credit_policies where policy_model<>'legacy_v1' or prepared_by is not null or approved_by is not null) then
    raise exception 'INSTALL CHECK FAILED: a policy is not plain legacy_v1'; end if;
  select id into v_active from public.community_credit_policies where status='active';
  if v_active is distinct from (select id from t067i where k='p2') then raise exception 'INSTALL CHECK FAILED: the active policy changed'; end if;
  select (select count(*) from public.community_credit_activities)+(select count(*) from public.community_credit_participations)
    +(select count(*) from public.community_credit_transitions)+(select count(*) from public.community_credit_correction_requests)
    +(select count(*) from public.community_credit_requests)+(select count(*) from public.community_credit_cap_locks) into v_new;
  if v_new<>0 then raise exception 'INSTALL CHECK FAILED: % rows in the new tables',v_new; end if;
  select count(*) into v_prof from t067i_profile_before b
    where (pg_temp.as_sec(format('select public.community_credit_profile(%L)',b.id))-array['status','policy_model','has_previous_policies','gauge'])
      is distinct from b.profile
       or (pg_temp.as_sec(format('select public.community_credit_profile(%L)',b.id))->>'current_score') is distinct from (b.profile->>'current_score');
  if v_prof<>0 then raise exception 'INSTALL CHECK FAILED: % profiles changed beyond the added keys',v_prof; end if;
  if (select count(*) from public.activity_log)<>(select activity_log_rows from t067i_counts) then raise exception 'INSTALL CHECK FAILED: installing wrote audit rows'; end if;
  raise notice 'INSTALL PASS: % existing rows byte-identical, % profiles identical apart from added keys, active policy unchanged, no V2 row created; scores: %',
    (select count(*) from t067i_before),(select count(*) from t067i_profile_before),
    (select string_agg(coalesce(profile->>'current_score','n/a'),',' order by id) from t067i_profile_before);
end $check$;
rollback;
