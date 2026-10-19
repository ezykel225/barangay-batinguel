-- NOT APPLIED. Requires 001-051. Auth account creation/role provisioning stays with trusted administration.
begin;
do $prerequisites$
declare
  v_table oid;
  v_required record;
begin
  if pg_catalog.to_regclass('public.case_support_events') is null
    or pg_catalog.to_regclass('public.tanod_members') is null
    or pg_catalog.to_regclass('public.tanod_assignments') is null
    or pg_catalog.to_regprocedure('public.current_official_may_administer_records()') is null then
    raise exception '052 requires migrations through 051, including the existing Tanod roster and identity helpers.';
  end if;
  -- Catalog checks only: never create or repair a substitute prerequisite.
  for v_required in
    select * from (values
      ('public.incident_case_links', '4')
    ) as required(table_name, column_count)
  loop
    v_table := pg_catalog.to_regclass(v_required.table_name);
    if v_table is null then
      raise exception '052 prerequisite missing: %; apply migrations through 051 first.', v_required.table_name;
    end if;
    if not exists (select 1 from pg_catalog.pg_class
      where oid = v_table and relkind = 'r' and relrowsecurity) then
      raise exception '052 prerequisite invalid: % must be an RLS-enabled table.', v_required.table_name;
    end if;
    if (select count(*) from pg_catalog.pg_attribute
      where attrelid = v_table and attnum > 0 and not attisdropped) <> v_required.column_count::integer then
      raise exception '052 prerequisite invalid: % has incompatible columns.', v_required.table_name;
    end if;
    if pg_catalog.has_table_privilege('anon', v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or pg_catalog.has_table_privilege('authenticated', v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or pg_catalog.has_any_column_privilege('anon', v_table, 'SELECT,INSERT,UPDATE,REFERENCES')
      or pg_catalog.has_any_column_privilege('authenticated', v_table, 'SELECT,INSERT,UPDATE,REFERENCES')
      or exists (select 1 from pg_catalog.pg_class c
        cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) acl
        where c.oid = v_table and acl.grantee = 0)
      or exists (select 1 from pg_catalog.pg_attribute a
        cross join lateral pg_catalog.aclexplode(a.attacl) acl
        where a.attrelid = v_table and a.attnum > 0 and not a.attisdropped and acl.grantee = 0) then
      raise exception '052 prerequisite invalid: % must have no PUBLIC/anon/authenticated direct privileges.', v_required.table_name;
    end if;
  end loop;
  for v_required in
    select * from (values
      ('public.incident_case_links', 'incident_id', 'uuid', true),
      ('public.incident_case_links', 'case_id', 'uuid', true),
      ('public.incident_case_links', 'linked_by', 'uuid', true),
      ('public.incident_case_links', 'linked_at', 'timestamp with time zone', true)
    ) as required(table_name, column_name, type_name, not_null)
  loop
    if not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = pg_catalog.to_regclass(v_required.table_name)
        and a.attname = v_required.column_name and a.attnum > 0 and not a.attisdropped
        and a.atttypid = pg_catalog.to_regtype(v_required.type_name)
        and a.attnotnull = v_required.not_null) then
      raise exception '052 prerequisite invalid: %.% has an incompatible type/nullability.', v_required.table_name, v_required.column_name;
    end if;
  end loop;
  for v_required in
    select * from (values
      ('public.incident_case_links', 'incident_id', 'p')
    ) as required(table_name, column_name, constraint_kind)
  loop
    if not exists (select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attname = v_required.column_name
      join pg_catalog.pg_index i on i.indexrelid = c.conindid
      where c.conrelid = pg_catalog.to_regclass(v_required.table_name)
        and c.contype::text = v_required.constraint_kind and c.conkey = array[a.attnum]
        and c.convalidated and not c.condeferrable and i.indisunique and i.indisvalid and i.indisready
        and i.indpred is null) then
      raise exception '052 prerequisite invalid: %.% requires its original primary/unique key.', v_required.table_name, v_required.column_name;
    end if;
  end loop;
  for v_required in
    select * from (values
      ('public.incident_case_links', 'incident_id', 'public.incidents', 'r'),
      ('public.incident_case_links', 'case_id', 'public.kp_cases', 'r'),
      ('public.incident_case_links', 'linked_by', 'public.profiles', 'a')
    ) as required(table_name, column_name, target_table, delete_action)
  loop
    if not exists (select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attname = v_required.column_name
      join pg_catalog.pg_attribute target on target.attrelid = c.confrelid and target.attname = 'id'
      where c.conrelid = pg_catalog.to_regclass(v_required.table_name)
        and c.contype = 'f' and c.convalidated and not c.condeferrable
        and c.confrelid = pg_catalog.to_regclass(v_required.target_table)
        and c.conkey = array[a.attnum] and c.confkey = array[target.attnum]
        and c.confdeltype::text = v_required.delete_action) then
      raise exception '052 prerequisite invalid: %.% requires its original foreign key.', v_required.table_name, v_required.column_name;
    end if;
  end loop;
end;
$prerequisites$;

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('official','nurse','resident','tanod'));
-- Keep 002's resident-only self-insert policy and 007's prohibition on API role changes.
-- Do not derive privileged roles from auth signup metadata.

create table public.tanod_account_links (
  tanod_id uuid primary key references public.tanod_members(id) on delete restrict,
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  linked_by uuid not null references public.profiles(id) on delete restrict,
  linked_at timestamptz not null default now()
);
create table public.tanod_attendance (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.tanod_assignments(id) on delete restrict,
  tanod_id uuid not null references public.tanod_members(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  check (checked_out_at is null or checked_out_at >= checked_in_at)
);
create unique index tanod_one_active_checkin on public.tanod_attendance(tanod_id) where checked_out_at is null;
create table public.tanod_operation_events (
  id uuid primary key default gen_random_uuid(),
  tanod_id uuid not null references public.tanod_members(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_kind text not null check(event_kind in ('account_linked','account_unlinked','checked_in','checked_out')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.tanod_account_links enable row level security;
alter table public.tanod_attendance enable row level security;
alter table public.tanod_operation_events enable row level security;
revoke all on public.tanod_account_links,public.tanod_attendance,public.tanod_operation_events from public,anon,authenticated;

-- Internal helpers are reached only through gated SECURITY DEFINER readers/writers.
create function public.current_tanod_member_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select l.tanod_id from public.tanod_account_links l
  join public.profiles p on p.id = l.profile_id
  join public.tanod_members t on t.id = l.tanod_id
  where l.profile_id = auth.uid() and p.role = 'tanod' and t.active;
$$;
create function public.require_tanod_member_id()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := public.current_tanod_member_id();
begin
  if auth.uid() is null or v_id is null then
    raise exception 'An active, linked Tanod account is required.';
  end if;
  return v_id;
end; $$;

create function public.tanod_account_states()
returns table(tanod_id uuid,profile_id uuid,account_state text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.current_official_may_administer_records() then raise exception 'Not authorized'; end if;
  return query select t.id,l.profile_id,
    case when not t.active then 'Inactive' when l.profile_id is null then 'Not linked'
      when p.role = 'tanod' then 'Account linked' else 'Account role needs review' end
    from public.tanod_members t left join public.tanod_account_links l on l.tanod_id = t.id
    left join public.profiles p on p.id = l.profile_id order by t.display_order,t.full_name,t.id;
end; $$;
create function public.set_tanod_account_link(p_tanod_id uuid,p_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old uuid;
begin
  if auth.uid() is null or not public.current_official_may_administer_records() then raise exception 'Not authorized'; end if;
  -- Serialize administration against check-in and other link changes for this member.
  perform 1 from public.tanod_members where id = p_tanod_id for update;
  if not found then raise exception 'Tanod member unavailable'; end if;
  select profile_id into v_old from public.tanod_account_links where tanod_id = p_tanod_id;
  if p_profile_id is null then
    delete from public.tanod_account_links where tanod_id = p_tanod_id;
    if v_old is null then return; end if;
  else
    if not exists(select 1 from public.profiles where id = p_profile_id and role = 'tanod') then
      raise exception 'Provision the Tanod profile through trusted administration first.';
    end if;
    insert into public.tanod_account_links(tanod_id,profile_id,linked_by)
    values(p_tanod_id,p_profile_id,auth.uid()) on conflict(tanod_id)
    do update set profile_id = excluded.profile_id,linked_by = auth.uid(),linked_at = now();
  end if;
  insert into public.tanod_operation_events(tanod_id,actor_id,event_kind,detail)
  values(p_tanod_id,auth.uid(),case when p_profile_id is null then 'account_unlinked' else 'account_linked' end,
    jsonb_build_object('previous_profile_id',v_old,'profile_id',p_profile_id));
end; $$;

-- Private shift-window helper: overnight shifts end on the following Manila date.
-- Missing times remain unknown; an all-day assignment is not invented.
create function public.tanod_shift_window(p_date date,p_start time,p_end time)
returns table(shift_start timestamptz,shift_end timestamptz)
language sql immutable set search_path = '' as $$
  select (p_date + p_start) at time zone 'Asia/Manila',
    ((p_date + case when p_end <= p_start then 1 else 0 end) + p_end) at time zone 'Asia/Manila';
$$;
create function public.tanod_my_identity()
returns table(display_name text,usual_area text,reports_today bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := public.require_tanod_member_id();
begin
  return query select t.full_name,t.area_note,
    (select count(*) from public.incidents i where i.recorded_by = auth.uid()
      and exists(select 1 from public.incident_tanod it where it.incident_id = i.id and it.tanod_id = v_id and it.role = 'reported')
      and (i.created_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date)
    from public.tanod_members t where t.id = v_id;
end; $$;
create function public.tanod_my_duty()
returns table(assignment_id uuid,assignment_date date,area_label text,shift_start timestamptz,shift_end timestamptz,
  active boolean,attendance_id uuid,checked_in_at timestamptz,checked_out_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := public.require_tanod_member_id();
begin
  return query select a.id,a.assignment_date,a.area_label,w.shift_start,w.shift_end,a.active,
    d.id,d.checked_in_at,d.checked_out_at
    from public.tanod_assignments a cross join lateral public.tanod_shift_window(a.assignment_date,a.start_time,a.end_time) w
    left join public.tanod_attendance d on d.assignment_id = a.id and d.tanod_id = v_id
    where a.tanod_id = v_id and (a.assignment_date between (now() at time zone 'Asia/Manila')::date - 14
      and (now() at time zone 'Asia/Manila')::date + 30 or (d.checked_in_at is not null and d.checked_out_at is null))
    order by (d.checked_in_at is not null and d.checked_out_at is null) desc,a.assignment_date desc,a.start_time,a.id limit 100;
end; $$;
create function public.tanod_check_in(p_assignment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid := public.require_tanod_member_id(); v_start timestamptz; v_end timestamptz; v_attendance uuid;
begin
  perform 1 from public.tanod_members where id = v_id for update;
  if public.current_tanod_member_id() is distinct from v_id then raise exception 'Tanod access changed; refresh your session.'; end if;
  select w.shift_start,w.shift_end into v_start,v_end from public.tanod_assignments a
    cross join lateral public.tanod_shift_window(a.assignment_date,a.start_time,a.end_time) w
    where a.id = p_assignment_id and a.tanod_id = v_id and a.active for update of a;
  if v_start is null or v_end is null or now() < v_start or now() >= v_end then
    raise exception 'Check-in requires your active scheduled shift with recorded start/end times.';
  end if;
  insert into public.tanod_attendance(assignment_id,tanod_id,profile_id)
  values(p_assignment_id,v_id,auth.uid()) returning id into v_attendance;
  insert into public.tanod_operation_events(tanod_id,actor_id,event_kind,detail)
  values(v_id,auth.uid(),'checked_in',jsonb_build_object('assignment_id',p_assignment_id,'attendance_id',v_attendance));
end; $$;
create function public.tanod_check_out(p_attendance_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid := public.require_tanod_member_id(); v_assignment uuid;
begin
  perform 1 from public.tanod_members where id = v_id for update;
  if public.current_tanod_member_id() is distinct from v_id then raise exception 'Tanod access changed; refresh your session.'; end if;
  update public.tanod_attendance set checked_out_at = now()
    where id = p_attendance_id and tanod_id = v_id and checked_out_at is null returning assignment_id into v_assignment;
  if v_assignment is null then raise exception 'No active check-in for this Tanod.'; end if;
  insert into public.tanod_operation_events(tanod_id,actor_id,event_kind,detail)
  values(v_id,auth.uid(),'checked_out',jsonb_build_object('assignment_id',v_assignment,'attendance_id',p_attendance_id));
end; $$;

-- This duty card is independent of historical incident-period filters.
-- No UUIDs, notes, contact details, routes, incident data or device locations.
create function public.public_tanod_on_duty()
returns table(display_name text,general_area text,shift_start timestamptz,shift_end timestamptz,duty_state text)
language sql stable security definer set search_path = '' as $$
  select t.full_name,a.area_label,w.shift_start,w.shift_end,
    case when d.checked_in_at is not null and d.checked_out_at is null and w.shift_start <= now() and now() < w.shift_end
      and p.role = 'tanod' then 'currently_on_duty' else 'scheduled' end
    from public.tanod_assignments a join public.tanod_members t on t.id = a.tanod_id and t.active
    cross join lateral public.tanod_shift_window(a.assignment_date,a.start_time,a.end_time) w
    left join public.tanod_account_links l on l.tanod_id = t.id
    left join public.profiles p on p.id = l.profile_id
    left join public.tanod_attendance d on d.assignment_id = a.id and d.profile_id = l.profile_id and d.tanod_id = t.id
    where a.active and ((w.shift_end > now() and w.shift_start < now() + interval '24 hours')
      or (w.shift_start is null and a.assignment_date = (now() at time zone 'Asia/Manila')::date))
    order by w.shift_start nulls last,t.display_order,t.full_name,a.id limit 50;
$$;

-- Own-document policies were historically role-neutral. A Tanod account must
-- not inherit resident-document access even if an administrator reuses an account.
create policy tanod_no_document_requests on public.document_requests as restrictive for all to authenticated
  using (not exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'tanod'))
  with check (not exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'tanod'));

revoke all on function public.current_tanod_member_id(),public.require_tanod_member_id(),public.tanod_shift_window(date,time,time)
  from public,anon,authenticated;
revoke all on function public.tanod_account_states(),public.set_tanod_account_link(uuid,uuid),public.tanod_my_identity(),
  public.tanod_my_duty(),public.tanod_check_in(uuid),public.tanod_check_out(uuid),public.public_tanod_on_duty() from public,anon;
grant execute on function public.tanod_account_states(),public.set_tanod_account_link(uuid,uuid),public.tanod_my_identity(),
  public.tanod_my_duty(),public.tanod_check_in(uuid),public.tanod_check_out(uuid) to authenticated;
grant execute on function public.public_tanod_on_duty() to anon,authenticated;
commit;
