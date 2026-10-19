-- Not applied. Manual decision support only; no statutory periods or automatic dispositions.
begin;
-- PL/pgSQL write bodies alone do not establish this installation dependency.
do $prerequisites$
declare
  v_events oid := pg_catalog.to_regclass('public.case_support_events');
  v_column record;
  v_fk record;
begin
  if v_events is null then
    raise exception '051 prerequisite missing: apply migration 050 first (public.case_support_events is required).';
  end if;
  if not exists (select 1 from pg_catalog.pg_class where oid = v_events and relkind = 'r' and relrowsecurity) then
    raise exception '051 prerequisite invalid: case_support_events must be the RLS-enabled table from migration 050.';
  end if;
  if (select count(*) from pg_catalog.pg_attribute where attrelid = v_events and attnum > 0 and not attisdropped) <> 6 then
    raise exception '051 prerequisite invalid: case_support_events must match migration 050 columns.';
  end if;
  for v_column in
    select * from (values
      ('id', 'uuid'), ('complaint_id', 'uuid'), ('event_kind', 'text'),
      ('detail', 'jsonb'), ('actor_id', 'uuid'), ('created_at', 'timestamp with time zone')
    ) as required(column_name, type_name)
  loop
    if not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = v_events and a.attname = v_column.column_name and not a.attisdropped
        and a.attnum > 0 and a.attnotnull and a.atttypid = pg_catalog.to_regtype(v_column.type_name)) then
      raise exception '051 prerequisite invalid: case_support_events.% must have the migration 050 type and NOT NULL constraint.', v_column.column_name;
    end if;
  end loop;
  if not exists (select 1 from pg_catalog.pg_constraint c join pg_catalog.pg_attribute a
    on a.attrelid = c.conrelid and a.attname = 'id'
    where c.conrelid = v_events and c.contype = 'p' and c.conkey = array[a.attnum] and c.convalidated) then
    raise exception '051 prerequisite invalid: case_support_events.id primary key from migration 050 is required.';
  end if;
  for v_fk in
    select * from (values ('complaint_id', 'public.complaints', 'r'), ('actor_id', 'public.profiles', 'a'))
      as required(column_name, target_table, delete_action)
  loop
    if not exists (select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attname = v_fk.column_name
      join pg_catalog.pg_attribute target on target.attrelid = c.confrelid and target.attname = 'id'
      where c.conrelid = v_events and c.contype = 'f' and c.convalidated
        and c.confrelid = pg_catalog.to_regclass(v_fk.target_table)
        and c.conkey = array[a.attnum] and c.confkey = array[target.attnum]
        and c.confdeltype::text = v_fk.delete_action) then
      raise exception '051 prerequisite invalid: case_support_events.% foreign key from migration 050 is required.', v_fk.column_name;
    end if;
  end loop;
  for v_column in
    select * from (values ('id', 'gen_random_uuid()'), ('detail', '''{}''::jsonb'), ('created_at', 'now()'))
      as required(column_name, default_expression)
  loop
    if not exists (select 1 from pg_catalog.pg_attrdef d join pg_catalog.pg_attribute a
      on a.attrelid = d.adrelid and a.attnum = d.adnum
      where d.adrelid = v_events and a.attname = v_column.column_name
        and pg_catalog.replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid), 'pg_catalog.', '') = v_column.default_expression) then
      raise exception '051 prerequisite invalid: case_support_events.% default from migration 050 is required.', v_column.column_name;
    end if;
  end loop;
  if pg_catalog.has_table_privilege('anon', v_events, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or pg_catalog.has_table_privilege('authenticated', v_events, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or pg_catalog.has_any_column_privilege('anon', v_events, 'SELECT,INSERT,UPDATE,REFERENCES')
    or pg_catalog.has_any_column_privilege('authenticated', v_events, 'SELECT,INSERT,UPDATE,REFERENCES') then
    raise exception '051 prerequisite invalid: case_support_events must retain migration 050 private client privileges.';
  end if;
end;
$prerequisites$;

create table public.kp_case_followups (
  case_id uuid primary key references public.kp_cases(id) on delete restrict,
  mediation_due date, conciliation_due date, repudiation_end date, compliance_due date,
  compliance_status text not null default 'not_recorded' check(compliance_status in ('not_recorded','pending','completed','not_met')),
  settlement_terms text not null default '', review_note text not null default '',
  updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now()
);
create table public.incident_case_links (
  incident_id uuid primary key references public.incidents(id) on delete restrict,
  case_id uuid not null references public.kp_cases(id) on delete restrict,
  linked_by uuid not null references public.profiles(id), linked_at timestamptz not null default now()
);
alter table public.kp_case_followups enable row level security;
alter table public.incident_case_links enable row level security;
revoke all on public.kp_case_followups, public.incident_case_links from public, anon, authenticated;

create function public.kp_followups_for(p_case_id uuid)
returns setof public.kp_case_followups language sql stable security definer set search_path = '' as $$
  select f.* from public.kp_case_followups f where f.case_id = p_case_id and public.kp_case_is_visible_to_caller(p_case_id);
$$;
create function public.save_kp_followups(p_case_id uuid,p_mediation_due date,p_conciliation_due date,
  p_repudiation_end date,p_compliance_due date,p_compliance_status text,p_settlement_terms text,p_review_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_complaint uuid;
begin
  if auth.uid() is null or not public.kp_case_is_visible_to_caller(p_case_id) then raise exception 'Not authorized'; end if;
  select complaint_id into v_complaint from public.kp_cases where id = p_case_id;
  insert into public.kp_case_followups(case_id,mediation_due,conciliation_due,repudiation_end,compliance_due,compliance_status,settlement_terms,review_note,updated_by)
  values(p_case_id,p_mediation_due,p_conciliation_due,p_repudiation_end,p_compliance_due,p_compliance_status,coalesce(p_settlement_terms,''),coalesce(p_review_note,''),auth.uid())
  on conflict(case_id) do update set mediation_due = excluded.mediation_due, conciliation_due = excluded.conciliation_due,
    repudiation_end = excluded.repudiation_end, compliance_due = excluded.compliance_due, compliance_status = excluded.compliance_status,
    settlement_terms = excluded.settlement_terms, review_note = excluded.review_note, updated_by = auth.uid(),updated_at = now();
  insert into public.case_support_events(complaint_id,event_kind,actor_id,detail)
  values(v_complaint,'followups_saved',auth.uid(),jsonb_build_object('case_id',p_case_id,
    'mediation_due',p_mediation_due,'conciliation_due',p_conciliation_due,'repudiation_end',p_repudiation_end,
    'compliance_due',p_compliance_due,'compliance_status',p_compliance_status,
    'settlement_terms',p_settlement_terms,'review_note',p_review_note));
end; $$;

-- Staff select an explicit existing ID; names are search hints, never identity matches.
create function public.search_case_residents(p_search text)
returns table(record_kind text,record_id uuid,full_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.current_official_may_administer_records() then raise exception 'Not authorized'; end if;
  if length(btrim(coalesce(p_search,''))) < 3 then return; end if;
  return query select 'registry'::text,r.id,r.full_name::text from public.residents_registry r
    where r.full_name ilike '%' || btrim(p_search) || '%' order by r.full_name,r.id limit 20;
  return query select 'profile'::text,p.id,p.full_name::text from public.profiles p
    where p.role = 'resident' and p.full_name ilike '%' || btrim(p_search) || '%' order by p.full_name,p.id limit 20;
end; $$;
create function public.link_complaint_party(p_party_id uuid,p_record_kind text,p_record_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_complaint uuid;
begin
  if auth.uid() is null or not public.current_official_may_administer_records() then raise exception 'Not authorized'; end if;
  if p_record_kind not in ('profile','registry','external') or p_record_kind is null then raise exception 'Invalid record kind'; end if;
  if p_record_kind = 'profile' and not exists(select 1 from public.profiles p where p.id = p_record_id and p.role = 'resident') then raise exception 'Resident profile unavailable'; end if;
  if p_record_kind = 'registry' and not exists(select 1 from public.residents_registry r where r.id = p_record_id) then raise exception 'Registry entry unavailable'; end if;
  update public.complaint_parties set profile_id = case when p_record_kind = 'profile' then p_record_id end,
    registry_entry_id = case when p_record_kind = 'registry' then p_record_id end
  where id = p_party_id returning complaint_id into v_complaint;
  if v_complaint is null then raise exception 'Party unavailable'; end if;
  insert into public.case_support_events(complaint_id,event_kind,actor_id,detail)
  values(v_complaint,'party_link_changed',auth.uid(),jsonb_build_object('party_id',p_party_id,'record_kind',p_record_kind,'record_id',p_record_id));
end; $$;

-- Boolean only. Never joins by names; no case references, narratives or identities returned.
create function public.clearance_case_warning(p_request_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.current_official_may_administer_records() then raise exception 'Not authorized'; end if;
  return exists(select 1 from public.document_requests d join public.complaint_parties p on p.profile_id = d.resident_id
    join public.kp_cases k on k.complaint_id = p.complaint_id
    where d.id = p_request_id and d.document_type = 'Barangay Clearance'
      and p.party_role in ('complainant','respondent') and k.status <> 'concluded');
end; $$;
create function public.incident_kp_link(p_incident_id uuid)
returns table(case_id uuid,reference text,status text)
language sql stable security definer set search_path = '' as $$
  select k.id,k.reference,k.status from public.incident_case_links l join public.kp_cases k on k.id = l.case_id
  where l.incident_id = p_incident_id and public.kp_case_is_visible_to_caller(k.id);
$$;
create function public.link_incident_kp(p_incident_id uuid,p_case_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_case uuid; v_complaint uuid;
begin
  if auth.uid() is null or not public.current_official_may_administer_records() then raise exception 'Not authorized'; end if;
  select id,complaint_id into v_case,v_complaint from public.kp_cases where reference = btrim(p_case_reference);
  if v_case is null or not public.kp_case_is_visible_to_caller(v_case) then raise exception 'KP case unavailable'; end if;
  insert into public.incident_case_links(incident_id,case_id,linked_by) values(p_incident_id,v_case,auth.uid())
  on conflict(incident_id) do update set case_id = excluded.case_id,linked_by = auth.uid(),linked_at = now();
  insert into public.case_support_events(complaint_id,event_kind,actor_id,detail)
  values(v_complaint,'incident_linked',auth.uid(),jsonb_build_object('incident_id',p_incident_id,'case_id',v_case));
end; $$;

revoke all on function public.kp_followups_for(uuid),public.save_kp_followups(uuid,date,date,date,date,text,text,text),
  public.search_case_residents(text),public.link_complaint_party(uuid,text,uuid),public.clearance_case_warning(uuid),
  public.incident_kp_link(uuid),public.link_incident_kp(uuid,text) from public, anon;
grant execute on function public.kp_followups_for(uuid),public.save_kp_followups(uuid,date,date,date,date,text,text,text),
  public.search_case_residents(text),public.link_complaint_party(uuid,text,uuid),public.clearance_case_warning(uuid),
  public.incident_kp_link(uuid),public.link_incident_kp(uuid,text) to authenticated;
commit;
