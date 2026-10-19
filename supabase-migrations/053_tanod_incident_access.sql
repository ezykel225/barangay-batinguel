-- NOT APPLIED. Requires 052. Reuses the incident/blotter pipeline and existing attribution.
begin;
do $prerequisites$
declare
  v_table oid;
  v_required record;
  v_definition text;
  v_roles text[];
begin
  if pg_catalog.to_regprocedure('public.require_tanod_member_id()') is null
    or pg_catalog.to_regclass('public.tanod_account_links') is null
    or pg_catalog.to_regclass('public.incident_case_links') is null then
    raise exception '053 requires 052 and the existing 051 incident/KP relationship.';
  end if;
  -- Catalog checks only: never create or repair a substitute prerequisite.
  for v_required in
    select * from (values
      ('public.incident_case_links', '4'),
      ('public.tanod_account_links', '4'),
      ('public.tanod_attendance', '6'),
      ('public.tanod_operation_events', '6')
    ) as required(table_name, column_count)
  loop
    v_table := pg_catalog.to_regclass(v_required.table_name);
    if v_table is null then
      raise exception '053 prerequisite missing: %; apply migrations through 052 first.', v_required.table_name;
    end if;
    if not exists (select 1 from pg_catalog.pg_class
      where oid = v_table and relkind = 'r' and relrowsecurity) then
      raise exception '053 prerequisite invalid: % must be an RLS-enabled table.', v_required.table_name;
    end if;
    if (select count(*) from pg_catalog.pg_attribute
      where attrelid = v_table and attnum > 0 and not attisdropped) <> v_required.column_count::integer then
      raise exception '053 prerequisite invalid: % has incompatible columns.', v_required.table_name;
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
      raise exception '053 prerequisite invalid: % must have no PUBLIC/anon/authenticated direct privileges.', v_required.table_name;
    end if;
  end loop;
  for v_required in
    select * from (values
      ('public.incident_case_links', 'incident_id', 'uuid', true),
      ('public.incident_case_links', 'case_id', 'uuid', true),
      ('public.incident_case_links', 'linked_by', 'uuid', true),
      ('public.incident_case_links', 'linked_at', 'timestamp with time zone', true),
      ('public.tanod_account_links', 'tanod_id', 'uuid', true),
      ('public.tanod_account_links', 'profile_id', 'uuid', true),
      ('public.tanod_account_links', 'linked_by', 'uuid', true),
      ('public.tanod_account_links', 'linked_at', 'timestamp with time zone', true),
      ('public.tanod_attendance', 'id', 'uuid', true),
      ('public.tanod_attendance', 'assignment_id', 'uuid', true),
      ('public.tanod_attendance', 'tanod_id', 'uuid', true),
      ('public.tanod_attendance', 'profile_id', 'uuid', true),
      ('public.tanod_attendance', 'checked_in_at', 'timestamp with time zone', true),
      ('public.tanod_attendance', 'checked_out_at', 'timestamp with time zone', false),
      ('public.tanod_operation_events', 'id', 'uuid', true),
      ('public.tanod_operation_events', 'tanod_id', 'uuid', true),
      ('public.tanod_operation_events', 'actor_id', 'uuid', true),
      ('public.tanod_operation_events', 'event_kind', 'text', true),
      ('public.tanod_operation_events', 'detail', 'jsonb', true),
      ('public.tanod_operation_events', 'created_at', 'timestamp with time zone', true)
    ) as required(table_name, column_name, type_name, not_null)
  loop
    if not exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = pg_catalog.to_regclass(v_required.table_name)
        and a.attname = v_required.column_name and a.attnum > 0 and not a.attisdropped
        and a.atttypid = pg_catalog.to_regtype(v_required.type_name)
        and a.attnotnull = v_required.not_null) then
      raise exception '053 prerequisite invalid: %.% has an incompatible type/nullability.', v_required.table_name, v_required.column_name;
    end if;
  end loop;
  for v_required in
    select * from (values
      ('public.incident_case_links', 'incident_id', 'p'),
      ('public.tanod_account_links', 'tanod_id', 'p'),
      ('public.tanod_account_links', 'profile_id', 'u'),
      ('public.tanod_attendance', 'id', 'p'),
      ('public.tanod_attendance', 'assignment_id', 'u'),
      ('public.tanod_operation_events', 'id', 'p')
    ) as required(table_name, column_name, constraint_kind)
  loop
    if not exists (select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attname = v_required.column_name
      join pg_catalog.pg_index i on i.indexrelid = c.conindid
      where c.conrelid = pg_catalog.to_regclass(v_required.table_name)
        and c.contype::text = v_required.constraint_kind and c.conkey = array[a.attnum]
        and c.convalidated and not c.condeferrable and i.indisunique and i.indisvalid and i.indisready
        and i.indpred is null) then
      raise exception '053 prerequisite invalid: %.% requires its original primary/unique key.', v_required.table_name, v_required.column_name;
    end if;
  end loop;
  for v_required in
    select * from (values
      ('public.incident_case_links', 'incident_id', 'public.incidents', 'r'),
      ('public.incident_case_links', 'case_id', 'public.kp_cases', 'r'),
      ('public.incident_case_links', 'linked_by', 'public.profiles', 'a'),
      ('public.tanod_account_links', 'tanod_id', 'public.tanod_members', 'r'),
      ('public.tanod_account_links', 'profile_id', 'public.profiles', 'r'),
      ('public.tanod_account_links', 'linked_by', 'public.profiles', 'r'),
      ('public.tanod_attendance', 'assignment_id', 'public.tanod_assignments', 'r'),
      ('public.tanod_attendance', 'tanod_id', 'public.tanod_members', 'r'),
      ('public.tanod_attendance', 'profile_id', 'public.profiles', 'r'),
      ('public.tanod_operation_events', 'tanod_id', 'public.tanod_members', 'r'),
      ('public.tanod_operation_events', 'actor_id', 'public.profiles', 'r')
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
      raise exception '053 prerequisite invalid: %.% requires its original foreign key.', v_required.table_name, v_required.column_name;
    end if;
  end loop;


  -- Writers rely on these server-owned defaults; missing defaults fail at runtime.
  for v_required in
    select * from (values
      ('public.incident_case_links', 'linked_at', 'now()'),
      ('public.tanod_account_links', 'linked_at', 'now()'),
      ('public.tanod_attendance', 'id', 'gen_random_uuid()'),
      ('public.tanod_attendance', 'checked_in_at', 'now()'),
      ('public.tanod_operation_events', 'id', 'gen_random_uuid()'),
      ('public.tanod_operation_events', 'detail', '''{}''::jsonb'),
      ('public.tanod_operation_events', 'created_at', 'now()')
    ) as required(table_name, column_name, default_expression)
  loop
    if not exists (select 1 from pg_catalog.pg_attrdef d
      join pg_catalog.pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
      where d.adrelid = pg_catalog.to_regclass(v_required.table_name)
        and a.attname = v_required.column_name
        and pg_catalog.replace(pg_catalog.pg_get_expr(d.adbin, d.adrelid), 'pg_catalog.', '') = v_required.default_expression) then
      raise exception '053 prerequisite invalid: %.% requires its original server default.', v_required.table_name, v_required.column_name;
    end if;
  end loop;
  if not exists (select 1 from pg_catalog.pg_constraint c
    where c.conrelid = pg_catalog.to_regclass('public.tanod_attendance')
      and c.contype = 'c' and c.convalidated
      and pg_catalog.regexp_replace(pg_catalog.pg_get_expr(c.conbin, c.conrelid), '[[:space:]()]', '', 'g')
        = 'checked_out_atISNULLORchecked_out_at>=checked_in_at') then
    raise exception '053 prerequisite invalid: attendance checkout chronology CHECK from 052 is required.';
  end if;
  -- Accept only the validated, single-column four-role CHECK installed by 052.
  select pg_catalog.pg_get_constraintdef(c.oid) into v_definition
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attname = 'role'
    where c.conrelid = pg_catalog.to_regclass('public.profiles')
      and c.conname = 'profiles_role_check' and c.contype = 'c'
      and c.convalidated and c.conkey = array[a.attnum];
  select array_agg(m[1] order by m[1]) into v_roles
    from pg_catalog.regexp_matches(v_definition, '''([^'']+)''', 'g') m;
  if v_definition is null or v_roles is distinct from array['nurse','official','resident','tanod']::text[]
    or pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(pg_catalog.replace(v_definition, '::text', ''), '''[^'']*''', '', 'g'),
      '[[:space:]()]', '', 'g') <> 'CHECKrole=ANYARRAY[,,,]' then
    raise exception '053 prerequisite invalid: profiles_role_check must allow exactly official/nurse/resident/tanod from 052.';
  end if;

  -- The partial unique index must enforce one unclosed attendance per member.
  if not exists (select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attname = 'tanod_id'
    where i.indrelid = pg_catalog.to_regclass('public.tanod_attendance')
      and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
      and i.indnkeyatts = 1 and i.indnatts = 1 and i.indkey[0] = a.attnum
      and pg_catalog.regexp_replace(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '[[:space:]()]', '', 'g') = 'checked_out_atISNULL') then
    raise exception '053 prerequisite invalid: the unique open-attendance index from 052 is required.';
  end if;
  -- Validate the two server-side identity resolvers, including their private ACL.
  for v_required in
    select * from (values ('public.current_tanod_member_id()'), ('public.require_tanod_member_id()')) as required(signature)
  loop
    if not exists (select 1 from pg_catalog.pg_proc p
      where p.oid = pg_catalog.to_regprocedure(v_required.signature)
        and p.prokind = 'f' and p.prosecdef and p.provolatile = 's'
        and not p.proretset and p.prorettype = pg_catalog.to_regtype('uuid')
        and 'search_path=""' = any(p.proconfig)
        and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not exists (select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE')) then
      raise exception '053 prerequisite invalid: % must be the private stable UUID SECURITY DEFINER resolver with empty search_path from 052.', v_required.signature;
    end if;
  end loop;
  -- A partial 052 installation must not leave dashboard/duty RPCs missing.
  for v_required in
    select * from (values
      ('public.tanod_account_states()', true, 's', 'record', true, false, true),
      ('public.set_tanod_account_link(uuid,uuid)', true, 'v', 'void', false, false, true),
      ('public.tanod_shift_window(date,time,time)', false, 'i', 'record', true, false, false),
      ('public.tanod_my_identity()', true, 's', 'record', true, false, true),
      ('public.tanod_my_duty()', true, 's', 'record', true, false, true),
      ('public.tanod_check_in(uuid)', true, 'v', 'void', false, false, true),
      ('public.tanod_check_out(uuid)', true, 'v', 'void', false, false, true),
      ('public.public_tanod_on_duty()', true, 's', 'record', true, true, true)
    ) as required(signature, definer, volatility, return_type, returns_set, anon_execute, authenticated_execute)
  loop
    if not exists (select 1 from pg_catalog.pg_proc p
      where p.oid = pg_catalog.to_regprocedure(v_required.signature) and p.prokind = 'f'
        and p.prosecdef = v_required.definer and p.provolatile::text = v_required.volatility
        and p.prorettype = pg_catalog.to_regtype(v_required.return_type) and p.proretset = v_required.returns_set
        and 'search_path=""' = any(p.proconfig)
        and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') = v_required.anon_execute
        and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') = v_required.authenticated_execute
        and not exists (select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
          where acl.grantee = 0 and acl.privilege_type = 'EXECUTE')) then
      raise exception '053 prerequisite invalid: % must retain the 052 signature/security/EXECUTE contract.', v_required.signature;
    end if;
  end loop;
end;
$prerequisites$;

create table public.tanod_incident_notes (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete restrict,
  tanod_id uuid not null references public.tanod_members(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  note text not null check(length(btrim(note)) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.tanod_incident_notes enable row level security;
revoke all on public.tanod_incident_notes from public,anon,authenticated;
create index tanod_incident_notes_incident_idx on public.tanod_incident_notes(incident_id,created_at);

create function public.tanod_incident_is_visible(p_incident_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_tanod_member_id() is not null and exists(
    select 1 from public.incidents i where i.id = p_incident_id and
      ((i.recorded_by = auth.uid() and exists(select 1 from public.incident_tanod own_report
          where own_report.incident_id = i.id and own_report.tanod_id = public.current_tanod_member_id() and own_report.role = 'reported'))
        or exists(select 1 from public.incident_tanod it
        where it.incident_id = i.id and it.tanod_id = public.current_tanod_member_id() and it.role in ('responded','attended'))));
$$;
create function public.tanod_my_reports()
returns table(incident_id uuid,reference text,incident_type text,occurred_at timestamptz,general_location text,
  status text,submitted_by_me boolean,assigned_to_me boolean,kp_linked boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := public.require_tanod_member_id();
begin
  return query select i.id,i.reference,i.incident_type,i.occurred_at,i.location_text,i.status,
    i.recorded_by = auth.uid(),exists(select 1 from public.incident_tanod it
      where it.incident_id = i.id and it.tanod_id = v_id and it.role in ('responded','attended')),
    exists(select 1 from public.incident_case_links k where k.incident_id = i.id)
    from public.incidents i where public.tanod_incident_is_visible(i.id)
    order by i.occurred_at desc,i.id limit 100;
end; $$;
create function public.tanod_add_followup(p_incident_id uuid,p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid := public.require_tanod_member_id();
begin
  if not public.tanod_incident_is_visible(p_incident_id) then raise exception 'Incident unavailable for this Tanod.'; end if;
  insert into public.tanod_incident_notes(incident_id,tanod_id,actor_id,note)
    values(p_incident_id,v_id,auth.uid(),btrim(p_note));
end; $$;
create function public.tanod_my_followups(p_incident_id uuid)
returns table(id uuid,note text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid := public.require_tanod_member_id();
begin
  if not public.tanod_incident_is_visible(p_incident_id) then raise exception 'Incident unavailable for this Tanod.'; end if;
  return query select n.id,n.note,n.created_at from public.tanod_incident_notes n
    where n.incident_id = p_incident_id and n.tanod_id = v_id and n.actor_id = auth.uid()
    order by n.created_at,n.id;
end; $$;
-- Records staff retain operational oversight without publishing these notes.
create function public.official_tanod_followups(p_incident_id uuid)
returns table(id uuid,tanod_name text,note text,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.id,t.full_name,n.note,n.created_at from public.tanod_incident_notes n
  join public.tanod_members t on t.id = n.tanod_id
  where n.incident_id = p_incident_id and public.current_official_may_administer_records()
  order by n.created_at,n.id;
$$;

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
  v_tanod uuid;
  v_incident_id uuid;
  v_blotter_id uuid;
  v_reference text;
  v_narrative text := btrim(COALESCE(p_narrative, ''));
  v_location  text := btrim(COALESCE(p_location_text, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to record an incident.' USING ERRCODE = 'P0001';
  END IF;

  -- Preserve active-official reporting. Other callers must resolve to an
  -- active Tanod account link; their reporting attribution is server-owned.
  IF NOT public.current_official_is_active() THEN
    v_tanod := public.require_tanod_member_id();
    IF p_tanod_id IS NOT NULL AND p_tanod_id IS DISTINCT FROM v_tanod THEN
      RAISE EXCEPTION 'A Tanod cannot report as another roster member.';
    END IF;
    IF p_tanod_role IS NOT NULL AND p_tanod_role <> 'reported' THEN
      RAISE EXCEPTION 'Tanod submissions must use reporting attribution.';
    END IF;
    p_tanod_id := v_tanod;
    p_tanod_role := 'reported';
    p_source := 'tanod_report';
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

revoke all on function public.tanod_incident_is_visible(uuid) from public,anon,authenticated;
revoke all on function public.tanod_my_reports(),public.tanod_add_followup(uuid,text),public.tanod_my_followups(uuid),
  public.official_tanod_followups(uuid),public.record_incident(text,timestamptz,text,text,text,numeric,numeric,text,uuid,text) from public,anon;
grant execute on function public.tanod_my_reports(),public.tanod_add_followup(uuid,text),public.tanod_my_followups(uuid),
  public.official_tanod_followups(uuid),public.record_incident(text,timestamptz,text,text,text,numeric,numeric,text,uuid,text) to authenticated;
commit;
