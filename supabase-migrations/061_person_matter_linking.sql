-- APPLIED. Verified present in production on 2026-10-30 by read-only catalog inspection
-- (all 32 tables, functions, triggers and indexes this file creates, plus its constraints);
-- the original application date was not recorded. Requires migrations 001-060.
-- UUID identity and factual person-history foundation only. No credit events or analytics conclusions.
begin;

create table public.external_persons (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check(length(btrim(first_name)) between 1 and 100),
  middle_name text check(middle_name is null or length(middle_name)<=100),
  last_name text not null check(length(btrim(last_name)) between 1 and 100),
  suffix text check(suffix is null or length(suffix)<=30),
  recorded_barangay text check(recorded_barangay is null or length(recorded_barangay)<=120),
  recorded_city_municipality text check(recorded_city_municipality is null or length(recorded_city_municipality)<=120),
  address_snapshot text check(address_snapshot is null or length(address_snapshot)<=500),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict
);
create index external_persons_name_idx on public.external_persons(last_name,first_name,id);

-- A reviewed transition never rewrites historical party rows. It establishes that
-- an old external UUID and a later resident UUID are the same verified identity.
create table public.external_person_resident_links (
  external_person_id uuid primary key references public.external_persons(id) on delete restrict,
  resident_id uuid not null unique references public.barangay_residents(id) on delete restrict,
  verified_by uuid not null references public.profiles(id) on delete restrict,
  verified_at timestamptz not null default now(),
  note text check(note is null or length(note)<=500)
);

-- Corrections are exceptional and reconstructible. The normal linking RPC
-- below is insert-once and cannot overwrite a verified mapping.
create table public.external_person_resident_link_history (
  id uuid primary key default gen_random_uuid(),
  external_person_id uuid not null references public.external_persons(id) on delete restrict,
  previous_resident_id uuid not null references public.barangay_residents(id) on delete restrict,
  new_resident_id uuid not null references public.barangay_residents(id) on delete restrict,
  corrected_by uuid not null references public.profiles(id) on delete restrict,
  corrected_at timestamptz not null default now(),
  reason text not null check(length(btrim(reason)) between 1 and 500),
  check(previous_resident_id<>new_resident_id)
);
create index external_person_resident_link_history_external_idx
  on public.external_person_resident_link_history(external_person_id,corrected_at desc,id);

create table public.incident_parties (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete restrict,
  resident_id uuid references public.barangay_residents(id) on delete restrict,
  external_person_id uuid references public.external_persons(id) on delete restrict,
  role text not null check(role in ('victim','witness','reporting_party','respondent','subject','other_involved')),
  name_snapshot text not null check(length(btrim(name_snapshot)) between 1 and 250),
  address_snapshot text check(address_snapshot is null or length(address_snapshot)<=500),
  involvement_note text check(involvement_note is null or length(involvement_note)<=1000),
  outcome_status text not null default 'not_determined'
    check(outcome_status in ('not_determined','substantiated','not_substantiated','referred','closed','unknown')),
  -- closed is procedural record closure only; it is not substantiation or proof of responsibility.
  outcome_recorded_at timestamptz,
  outcome_recorded_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  constraint incident_parties_exactly_one_identity check(
    (resident_id is not null and external_person_id is null) or
    (resident_id is null and external_person_id is not null)),
  constraint incident_party_outcome_actor check(
    (outcome_status='not_determined' and outcome_recorded_at is null and outcome_recorded_by is null) or
    (outcome_status<>'not_determined' and outcome_recorded_at is not null and outcome_recorded_by is not null))
);
create index incident_parties_incident_idx on public.incident_parties(incident_id,role,id);
create index incident_parties_resident_idx on public.incident_parties(resident_id,incident_id) where resident_id is not null;
create index incident_parties_external_idx on public.incident_parties(external_person_id,incident_id) where external_person_id is not null;
create unique index incident_parties_unique_resident_role
  on public.incident_parties(incident_id,resident_id,role) where resident_id is not null;
create unique index incident_parties_unique_external_role
  on public.incident_parties(incident_id,external_person_id,role) where external_person_id is not null;

create table public.incident_party_history (
  id uuid primary key default gen_random_uuid(),
  incident_party_id uuid not null references public.incident_parties(id) on delete restrict,
  incident_id uuid not null references public.incidents(id) on delete restrict,
  previous_resident_id uuid references public.barangay_residents(id) on delete restrict,
  previous_external_person_id uuid references public.external_persons(id) on delete restrict,
  previous_role text not null check(previous_role in ('victim','witness','reporting_party','respondent','subject','other_involved')),
  previous_outcome_status text not null check(previous_outcome_status in ('not_determined','substantiated','not_substantiated','referred','closed','unknown')),
  new_resident_id uuid references public.barangay_residents(id) on delete restrict,
  new_external_person_id uuid references public.external_persons(id) on delete restrict,
  new_role text not null check(new_role in ('victim','witness','reporting_party','respondent','subject','other_involved')),
  new_outcome_status text not null check(new_outcome_status in ('not_determined','substantiated','not_substantiated','referred','closed','unknown')),
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  change_type text not null check(change_type in ('identity','role','outcome','combined')),
  constraint incident_party_history_previous_identity check(
    (previous_resident_id is not null and previous_external_person_id is null) or
    (previous_resident_id is null and previous_external_person_id is not null)),
  constraint incident_party_history_new_identity check(
    (new_resident_id is not null and new_external_person_id is null) or
    (new_resident_id is null and new_external_person_id is not null))
);
create index incident_party_history_party_idx on public.incident_party_history(incident_party_id,changed_at desc,id);

alter table public.complaint_parties
  add column resident_id uuid references public.barangay_residents(id) on delete restrict,
  add column external_person_id uuid references public.external_persons(id) on delete restrict;
alter table public.complaint_parties add constraint complaint_parties_one_stable_identity
  check(not (resident_id is not null and external_person_id is not null));
create index complaint_parties_resident_idx on public.complaint_parties(resident_id,complaint_id) where resident_id is not null;
create index complaint_parties_external_idx on public.complaint_parties(external_person_id,complaint_id) where external_person_id is not null;

alter table public.external_persons enable row level security;
alter table public.external_person_resident_links enable row level security;
alter table public.external_person_resident_link_history enable row level security;
alter table public.incident_parties enable row level security;
alter table public.incident_party_history enable row level security;
revoke all on public.external_persons,public.external_person_resident_links,public.external_person_resident_link_history,
  public.incident_parties,public.incident_party_history
  from public,anon,authenticated,service_role;

do $audit$
declare v_expression text;
begin
  select pg_catalog.pg_get_expr(conbin,conrelid) into v_expression from pg_catalog.pg_constraint
  where conrelid='public.activity_log'::regclass and conname='activity_log_entity_type_check';
  if v_expression is null then raise exception 'Existing activity log vocabulary is required'; end if;
  alter table public.activity_log drop constraint activity_log_entity_type_check;
  execute 'alter table public.activity_log add constraint activity_log_entity_type_check check (('||v_expression||') or entity_type in (''external_person'',''incident_party'',''complaint_party''))';
end;
$audit$;

create function public.person_history_require_view()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.current_official_is_active() then
    raise exception 'Not authorized' using errcode='42501';
  end if;
end; $$;
create function public.person_history_require_admin()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.current_official_may_administer_records(),false) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
end; $$;

-- Legacy registry links are reference metadata only. A legacy profile link,
-- however, must resolve through barangay_residents.profile_id to the same
-- resident as the new stable resident identity. Snapshot-only rows remain valid.
create function public.guard_complaint_party_identity()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.resident_id is not null and new.external_person_id is not null then
    raise exception 'Choose only one stable complaint-party identity';
  end if;
  if new.external_person_id is not null and new.profile_id is not null then
    raise exception 'External identity conflicts with the linked resident profile';
  end if;
  if new.resident_id is not null and new.profile_id is not null and not exists(
    select 1 from public.barangay_residents r where r.id=new.resident_id and r.profile_id=new.profile_id
  ) then
    raise exception 'Resident identity conflicts with the linked resident profile';
  end if;
  return new;
end; $$;
create trigger complaint_party_identity_guard before insert or update of profile_id,resident_id,external_person_id
  on public.complaint_parties for each row execute function public.guard_complaint_party_identity();

create function public.person_identity_history_immutable()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Person identity correction history is immutable'; end; $$;
create trigger external_person_resident_link_history_immutable before update or delete
  on public.external_person_resident_link_history for each row execute function public.person_identity_history_immutable();
create trigger incident_party_history_immutable before update or delete
  on public.incident_party_history for each row execute function public.person_identity_history_immutable();

create function public.search_people(p_search text)
returns table(person_kind text,person_id uuid,full_name text,secondary_text text,credit_applicable boolean)
language plpgsql stable security definer set search_path='' as $$
declare v_search text:=btrim(coalesce(p_search,''));
begin
  perform public.person_history_require_view();
  if length(v_search)<2 then return; end if;
  return query
    select 'resident'::text,r.id,concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix)::text,
      concat_ws(' · ',nullif(r.purok,''),'Batinguel resident')::text,true
    from public.barangay_residents r
    where concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix) ilike '%'||v_search||'%'
    union all
    select 'external'::text,e.id,concat_ws(' ',e.first_name,e.middle_name,e.last_name,e.suffix)::text,
      concat_ws(' · ',nullif(e.recorded_barangay,''),nullif(e.recorded_city_municipality,''),'External person')::text,false
    from public.external_persons e
    where e.archived_at is null and concat_ws(' ',e.first_name,e.middle_name,e.last_name,e.suffix) ilike '%'||v_search||'%'
    order by 3,1,2 limit 40;
end; $$;

create function public.save_external_person(p_id uuid,p_first_name text,p_middle_name text,p_last_name text,p_suffix text,
  p_recorded_barangay text,p_recorded_city_municipality text,p_address_snapshot text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_action text;
begin
  perform public.person_history_require_admin();
  if p_id is null then
    insert into public.external_persons(first_name,middle_name,last_name,suffix,recorded_barangay,recorded_city_municipality,address_snapshot,created_by,updated_by)
    values(btrim(p_first_name),nullif(btrim(p_middle_name),''),btrim(p_last_name),nullif(btrim(p_suffix),''),
      nullif(btrim(p_recorded_barangay),''),nullif(btrim(p_recorded_city_municipality),''),nullif(btrim(p_address_snapshot),''),auth.uid(),auth.uid())
    returning id into v_id; v_action:='added';
  else
    update public.external_persons set first_name=btrim(p_first_name),middle_name=nullif(btrim(p_middle_name),''),last_name=btrim(p_last_name),
      suffix=nullif(btrim(p_suffix),''),recorded_barangay=nullif(btrim(p_recorded_barangay),''),
      recorded_city_municipality=nullif(btrim(p_recorded_city_municipality),''),address_snapshot=nullif(btrim(p_address_snapshot),''),
      updated_by=auth.uid(),updated_at=now() where id=p_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'External person unavailable'; end if; v_action:='edited';
  end if;
  insert into public.activity_log(action,entity_type,entity_id,subject)
    values(v_action,'external_person',v_id,'External person identity record');
  return v_id;
end; $$;

create function public.save_incident_party(p_id uuid,p_incident_id uuid,p_resident_id uuid,p_external_person_id uuid,
  p_role text,p_address_snapshot text,p_involvement_note text,p_outcome_status text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_name text; v_outcome text:=coalesce(p_outcome_status,'not_determined');
  v_old public.incident_parties%rowtype; v_identity_changed boolean; v_role_changed boolean; v_outcome_changed boolean;
begin
  perform public.person_history_require_admin();
  if (p_resident_id is null)=(p_external_person_id is null) then raise exception 'Choose exactly one person identity'; end if;
  if not exists(select 1 from public.incidents where id=p_incident_id) then raise exception 'Incident unavailable'; end if;
  if p_resident_id is not null then
    select concat_ws(' ',first_name,middle_name,last_name,suffix) into v_name from public.barangay_residents where id=p_resident_id;
  else
    select concat_ws(' ',first_name,middle_name,last_name,suffix) into v_name from public.external_persons where id=p_external_person_id and archived_at is null;
  end if;
  if v_name is null then raise exception 'Person identity unavailable'; end if;
  if p_id is null then
    insert into public.incident_parties(incident_id,resident_id,external_person_id,role,name_snapshot,address_snapshot,involvement_note,
      outcome_status,outcome_recorded_at,outcome_recorded_by,created_by,updated_by)
    values(p_incident_id,p_resident_id,p_external_person_id,p_role,v_name,nullif(btrim(p_address_snapshot),''),nullif(btrim(p_involvement_note),''),
      v_outcome,case when v_outcome='not_determined' then null else now() end,case when v_outcome='not_determined' then null else auth.uid() end,auth.uid(),auth.uid()) returning id into v_id;
  else
    select * into v_old from public.incident_parties where id=p_id and incident_id=p_incident_id for update;
    if not found then raise exception 'Incident party unavailable'; end if;
    v_identity_changed:=v_old.resident_id is distinct from p_resident_id or v_old.external_person_id is distinct from p_external_person_id;
    v_role_changed:=v_old.role is distinct from p_role;
    v_outcome_changed:=v_old.outcome_status is distinct from v_outcome;
    if v_identity_changed or v_role_changed or v_outcome_changed then
      insert into public.incident_party_history(incident_party_id,incident_id,previous_resident_id,previous_external_person_id,
        previous_role,previous_outcome_status,new_resident_id,new_external_person_id,new_role,new_outcome_status,changed_by,change_type)
      values(v_old.id,v_old.incident_id,v_old.resident_id,v_old.external_person_id,v_old.role,v_old.outcome_status,
        p_resident_id,p_external_person_id,p_role,v_outcome,auth.uid(),
        case when (v_identity_changed::int+v_role_changed::int+v_outcome_changed::int)>1 then 'combined'
          when v_identity_changed then 'identity' when v_role_changed then 'role' else 'outcome' end);
    end if;
    update public.incident_parties set resident_id=p_resident_id,external_person_id=p_external_person_id,role=p_role,name_snapshot=v_name,
      address_snapshot=nullif(btrim(p_address_snapshot),''),involvement_note=nullif(btrim(p_involvement_note),''),outcome_status=v_outcome,
      outcome_recorded_at=case when v_outcome='not_determined' then null else now() end,
      outcome_recorded_by=case when v_outcome='not_determined' then null else auth.uid() end,updated_by=auth.uid(),updated_at=now()
      where id=p_id and incident_id=p_incident_id returning id into v_id;
  end if;
  insert into public.activity_log(action,entity_type,entity_id,subject)
    values(case when p_id is null then 'added' else 'edited' end,'incident_party',v_id,'Incident party identity link');
  return v_id;
end; $$;

create function public.incident_parties_for(p_incident_id uuid)
returns table(id uuid,person_kind text,person_id uuid,name_snapshot text,role text,outcome_status text,outcome_recorded_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  perform public.person_history_require_view();
  return query select p.id,case when p.resident_id is not null then 'resident' else 'external' end,
    coalesce(p.resident_id,p.external_person_id),p.name_snapshot,p.role,p.outcome_status,p.outcome_recorded_at
    from public.incident_parties p where p.incident_id=p_incident_id order by p.created_at,p.id;
end; $$;

-- Retain the legacy RPC for deployed complaint UI compatibility, but route
-- every write through the database trigger above. residents_registry remains
-- reference metadata and is never converted to a resident identity.
create or replace function public.link_complaint_party(p_party_id uuid,p_record_kind text,p_record_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_complaint uuid;
begin
  perform public.person_history_require_admin();
  if p_record_kind not in ('profile','registry','external') or p_record_kind is null then raise exception 'Invalid record kind'; end if;
  if p_record_kind='profile' and not exists(select 1 from public.profiles p where p.id=p_record_id and p.role='resident') then
    raise exception 'Resident profile unavailable';
  end if;
  if p_record_kind='registry' and not exists(select 1 from public.residents_registry r where r.id=p_record_id) then
    raise exception 'Registry entry unavailable';
  end if;
  update public.complaint_parties set profile_id=case when p_record_kind='profile' then p_record_id end,
    registry_entry_id=case when p_record_kind='registry' then p_record_id end
    where id=p_party_id returning complaint_id into v_complaint;
  if v_complaint is null then raise exception 'Complaint party unavailable'; end if;
  insert into public.case_support_events(complaint_id,event_kind,actor_id,detail)
    values(v_complaint,'party_link_changed',auth.uid(),jsonb_build_object('party_id',p_party_id,'record_kind',p_record_kind,'record_id',p_record_id));
end; $$;

create function public.link_complaint_party_identity(p_party_id uuid,p_person_kind text,p_person_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_complaint uuid; v_name text; v_party public.complaint_parties%rowtype;
begin
  perform public.person_history_require_admin();
  select * into v_party from public.complaint_parties where id=p_party_id for update;
  if not found then raise exception 'Complaint party unavailable'; end if;
  if p_person_kind='resident' then
    select concat_ws(' ',first_name,middle_name,last_name,suffix) into v_name from public.barangay_residents where id=p_person_id;
    if v_party.external_person_id is not null then raise exception 'Complaint party already has a different stable identity'; end if;
    if v_party.resident_id is not null and v_party.resident_id<>p_person_id then raise exception 'Complaint party already has a different stable identity'; end if;
    if v_party.profile_id is not null and not exists(
      select 1 from public.barangay_residents r where r.id=p_person_id and r.profile_id=v_party.profile_id
    ) then raise exception 'Resident identity conflicts with the linked resident profile'; end if;
  elsif p_person_kind='external' then
    select concat_ws(' ',first_name,middle_name,last_name,suffix) into v_name from public.external_persons where id=p_person_id and archived_at is null;
    if v_party.profile_id is not null or v_party.resident_id is not null then raise exception 'External identity conflicts with the linked resident identity'; end if;
    if v_party.external_person_id is not null and v_party.external_person_id<>p_person_id then raise exception 'Complaint party already has a different stable identity'; end if;
  else raise exception 'Invalid person kind'; end if;
  if v_name is null then raise exception 'Person identity unavailable'; end if;
  update public.complaint_parties set resident_id=case when p_person_kind='resident' then p_person_id end,
    external_person_id=case when p_person_kind='external' then p_person_id end where id=p_party_id returning complaint_id into v_complaint;
  if v_complaint is null then raise exception 'Complaint party unavailable'; end if;
  insert into public.activity_log(action,entity_type,entity_id,subject) values('edited','complaint_party',p_party_id,'Complaint party identity link');
end; $$;

-- Preserve the established privacy-shaped return type while making its two
-- booleans reflect the new stable identities as well as legacy links.
create or replace function public.complaint_parties_for(p_complaint_id uuid)
returns table(id uuid,party_role text,full_name_snapshot text,contact_number_snapshot text,address_note text,
  has_profile_link boolean,has_registry_link boolean,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select p.id,p.party_role,p.full_name_snapshot,
    case when public.current_official_holds_position('Barangay Secretary') or public.current_official_holds_position('Punong Barangay')
      or p.profile_id=auth.uid() then p.contact_number_snapshot end,
    case when public.current_official_holds_position('Barangay Secretary') or public.current_official_holds_position('Punong Barangay')
      or p.profile_id=auth.uid() then p.address_note end,
    (p.profile_id is not null or p.resident_id is not null),
    (p.registry_entry_id is not null or p.external_person_id is not null),p.created_at
  from public.complaint_parties p where p.complaint_id=p_complaint_id and public.complaint_is_visible_to_caller(p_complaint_id)
  order by case p.party_role when 'complainant' then 0 when 'respondent' then 1 else 2 end,p.created_at;
$$;

create function public.link_external_person_to_resident(p_external_person_id uuid,p_resident_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_existing uuid;
begin
  perform public.person_history_require_admin();
  if not exists(select 1 from public.external_persons where id=p_external_person_id) or
     not exists(select 1 from public.barangay_residents where id=p_resident_id) then raise exception 'Person identity unavailable'; end if;
  select resident_id into v_existing from public.external_person_resident_links where external_person_id=p_external_person_id for update;
  if found then
    if v_existing=p_resident_id then return; end if;
    raise exception 'External identity is already linked to a different resident; use the correction operation';
  end if;
  insert into public.external_person_resident_links(external_person_id,resident_id,verified_by,note)
    values(p_external_person_id,p_resident_id,auth.uid(),nullif(btrim(p_note),''));
  insert into public.activity_log(action,entity_type,entity_id,subject) values('edited','external_person',p_external_person_id,'External identity linked to resident');
end; $$;

create function public.correct_external_person_resident_link(p_external_person_id uuid,p_new_resident_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_previous uuid; v_reason text:=btrim(coalesce(p_reason,''));
begin
  perform public.person_history_require_admin();
  if length(v_reason)<1 or length(v_reason)>500 then raise exception 'A correction reason is required'; end if;
  if not exists(select 1 from public.barangay_residents where id=p_new_resident_id) then raise exception 'Resident identity unavailable'; end if;
  select resident_id into v_previous from public.external_person_resident_links
    where external_person_id=p_external_person_id for update;
  if not found then raise exception 'Verified external identity mapping unavailable'; end if;
  if v_previous=p_new_resident_id then raise exception 'The external identity is already linked to that resident'; end if;
  insert into public.external_person_resident_link_history(external_person_id,previous_resident_id,new_resident_id,corrected_by,reason)
    values(p_external_person_id,v_previous,p_new_resident_id,auth.uid(),v_reason);
  update public.external_person_resident_links set resident_id=p_new_resident_id,verified_by=auth.uid(),verified_at=now(),note=null
    where external_person_id=p_external_person_id;
  insert into public.activity_log(action,entity_type,entity_id,subject)
    values('edited','external_person',p_external_person_id,'External identity mapping corrected');
end; $$;

create function public.person_history(p_person_kind text,p_person_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_identity jsonb; v_incidents jsonb; v_complaints jsonb;
begin
  perform public.person_history_require_view();
  if p_person_kind='resident' then
    select jsonb_build_object('kind','resident','id',r.id,'full_name',concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix),
      'purok',r.purok,'resident_status',r.resident_status,'credit_applicable',true) into v_identity
      from public.barangay_residents r where r.id=p_person_id;
  elsif p_person_kind='external' then
    select jsonb_build_object('kind','external','id',e.id,'full_name',concat_ws(' ',e.first_name,e.middle_name,e.last_name,e.suffix),
      'recorded_barangay',e.recorded_barangay,'recorded_city_municipality',e.recorded_city_municipality,
      'address_snapshot',e.address_snapshot,'credit_applicable',false,'linked_resident_id',l.resident_id,
      'linked_resident_name',concat_ws(' ',r.first_name,r.middle_name,r.last_name,r.suffix)) into v_identity
      from public.external_persons e left join public.external_person_resident_links l on l.external_person_id=e.id
      left join public.barangay_residents r on r.id=l.resident_id where e.id=p_person_id;
  else raise exception 'Invalid person kind'; end if;
  if v_identity is null then raise exception 'Person unavailable'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('matter_id',p.incident_id,'matter_key','incident:'||p.incident_id::text,
    'incident_id',i.id,'reference',i.reference,'occurred_at',i.occurred_at,
    'type',i.incident_type,'status',i.status,'role',p.role,'outcome',p.outcome_status,'blotter_reference',b.entry_reference,
    'kp_reference',k.reference,'complaint_reference',c.reference) order by i.occurred_at desc,i.id),'[]'::jsonb) into v_incidents
  from public.incident_parties p join public.incidents i on i.id=p.incident_id
  left join public.blotter_entries b on b.incident_id=i.id
  left join public.incident_case_links l on l.incident_id=i.id left join public.kp_cases k on k.id=l.case_id
  left join public.complaints c on c.id=k.complaint_id
  where (p_person_kind='resident' and p.resident_id=p_person_id) or (p_person_kind='external' and p.external_person_id=p_person_id);

  select coalesce(jsonb_agg(jsonb_build_object('matter_id',q.complaint_id,'matter_key','complaint:'||q.complaint_id::text,
    'complaint_id',q.complaint_id,'reference',q.reference,'created_at',q.created_at,'category',q.category,'status',q.status,
    'roles',q.roles,'kp_reference',q.kp_reference,'linked_incident_references',q.linked_incident_references)
    order by q.created_at desc,q.complaint_id),'[]'::jsonb) into v_complaints
  from (
    select c.id complaint_id,c.reference,c.created_at,c.category,c.status,
      array_agg(distinct cp.party_role order by cp.party_role) roles,
      (select k.reference from public.kp_cases k where k.complaint_id=c.id) kp_reference,
      (select coalesce(jsonb_agg(i.reference order by i.reference),'[]'::jsonb)
       from public.kp_cases k2 join public.incident_case_links l on l.case_id=k2.id
       join public.incidents i on i.id=l.incident_id where k2.complaint_id=c.id) linked_incident_references
    from public.complaint_parties cp join public.complaints c on c.id=cp.complaint_id
    where (p_person_kind='resident' and cp.resident_id=p_person_id)
       or (p_person_kind='external' and cp.external_person_id=p_person_id)
    group by c.id,c.reference,c.created_at,c.category,c.status
  ) q;

  return jsonb_build_object('identity',v_identity,'incidents',v_incidents,'complaints',v_complaints,
    'timeline',coalesce((select jsonb_agg(x order by x->>'occurred_at' desc) from (
      select jsonb_build_object('kind','incident','occurred_at',r->>'occurred_at','matter_id',r->>'matter_id','matter_key',r->>'matter_key','record',r) x from jsonb_array_elements(v_incidents) r
      union all select jsonb_build_object('kind','complaint','occurred_at',r->>'created_at','matter_id',r->>'matter_id','matter_key',r->>'matter_key','record',r) from jsonb_array_elements(v_complaints) r
    ) s),'[]'::jsonb));
end; $$;

revoke all on function public.person_history_require_view(),public.person_history_require_admin(),
  public.guard_complaint_party_identity(),public.person_identity_history_immutable(),public.search_people(text),
  public.save_external_person(uuid,text,text,text,text,text,text,text),
  public.save_incident_party(uuid,uuid,uuid,uuid,text,text,text,text),public.incident_parties_for(uuid),
  public.link_complaint_party(uuid,text,uuid),public.link_complaint_party_identity(uuid,text,uuid),
  public.link_external_person_to_resident(uuid,uuid,text),public.correct_external_person_resident_link(uuid,uuid,text),
  public.person_history(text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.search_people(text),public.save_external_person(uuid,text,text,text,text,text,text,text),
  public.save_incident_party(uuid,uuid,uuid,uuid,text,text,text,text),public.incident_parties_for(uuid),
  public.link_complaint_party(uuid,text,uuid),public.link_complaint_party_identity(uuid,text,uuid),
  public.link_external_person_to_resident(uuid,uuid,text),public.correct_external_person_resident_link(uuid,uuid,text),
  public.person_history(text,uuid)
  to authenticated;
commit;
