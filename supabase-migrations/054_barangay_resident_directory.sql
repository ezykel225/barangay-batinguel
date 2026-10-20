-- NOT APPLIED. Apply manually after 053. No residents are seeded or copied.
begin;
create table public.barangay_residents (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(btrim(first_name)) between 1 and 100),
  middle_name text check (length(middle_name) <= 100),
  last_name text not null check (length(btrim(last_name)) between 1 and 100),
  suffix text check (length(suffix) <= 30),
  birth_date date,
  mobile_number text check (mobile_number is null or regexp_replace(mobile_number, '[[:space:]()-]', '', 'g') ~ '^(09[0-9]{9}|[+]639[0-9]{9}|639[0-9]{9})$'),
  purok text check (length(purok) <= 100),
  resident_status text not null default 'active' check (resident_status in ('active','inactive')),
  profile_id uuid unique references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.barangay_residents enable row level security;
revoke all on public.barangay_residents from public, anon, authenticated;
create index barangay_residents_birth_idx on public.barangay_residents(birth_date) where resident_status = 'active';
create index barangay_residents_purok_idx on public.barangay_residents(purok) where resident_status = 'active';
create index barangay_residents_name_idx on public.barangay_residents(last_name,first_name);
-- Extend only the existing audit entity vocabulary, retaining all prior values.
do $audit$
declare v_expression text;
begin
  select pg_catalog.pg_get_expr(conbin,conrelid) into v_expression from pg_catalog.pg_constraint
    where conrelid = 'public.activity_log'::regclass and conname = 'activity_log_entity_type_check';
  if v_expression is null then raise exception 'Existing activity log vocabulary is required'; end if;
  alter table public.activity_log drop constraint activity_log_entity_type_check;
  execute 'alter table public.activity_log add constraint activity_log_entity_type_check check ((' || v_expression || ') or entity_type = ''barangay_resident'')';
end;
$audit$;
create function public.stamp_barangay_resident()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.birth_date > (now() at time zone 'Asia/Manila')::date then raise exception 'Birth date cannot be in the future'; end if;
  if new.profile_id is not null and not exists(select 1 from public.profiles where id = new.profile_id and role = 'resident') then
    raise exception 'Linked account must be a resident account';
  end if;
  new.updated_at := now();
  return new;
end; $$;
create trigger stamp_barangay_resident before insert or update on public.barangay_residents
  for each row execute function public.stamp_barangay_resident();
create function public.barangay_resident_directory()
returns setof public.barangay_residents language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.current_official_may_administer_records() then raise exception 'Not authorized'; end if;
  return query select r.* from public.barangay_residents r order by r.last_name,r.first_name,r.id;
end; $$;
-- Deliberately no delete RPC: deactivate a record without erasing identity.
-- Linking UI is deferred; this writer cannot create or change profile links.
create function public.save_barangay_resident(p_id uuid,p_first_name text,p_middle_name text,p_last_name text,
  p_suffix text,p_birth_date date,p_mobile_number text,p_purok text,p_resident_status text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_action text;
begin
  if auth.uid() is null or not public.current_official_may_administer_records() then raise exception 'Not authorized'; end if;
  if p_id is null then
    insert into public.barangay_residents(first_name,middle_name,last_name,suffix,birth_date,mobile_number,purok,resident_status)
      values(btrim(p_first_name),nullif(btrim(p_middle_name),''),btrim(p_last_name),nullif(btrim(p_suffix),''),p_birth_date,
        nullif(btrim(p_mobile_number),''),nullif(btrim(p_purok),''),p_resident_status) returning id into v_id;
    v_action := 'added';
  else
    update public.barangay_residents set first_name=btrim(p_first_name),middle_name=nullif(btrim(p_middle_name),''),
      last_name=btrim(p_last_name),suffix=nullif(btrim(p_suffix),''),birth_date=p_birth_date,
      mobile_number=nullif(btrim(p_mobile_number),''),purok=nullif(btrim(p_purok),''),resident_status=p_resident_status
      where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Resident unavailable'; end if;
    v_action := 'edited';
  end if;
  insert into public.activity_log(action,entity_type,entity_id,subject)
    values(v_action,'barangay_resident',v_id,'Barangay resident directory record');
  return v_id;
end; $$;
-- Private foundation for a future authorized targeting service. No age/senior
-- rule or provider normalization is assumed. Bounds are inclusive calendar dates.
create function public.barangay_resident_candidates(p_born_from date default null,p_born_through date default null,p_purok text default null)
returns table(resident_id uuid,birth_date date,mobile_number text,purok text,profile_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.id,r.birth_date,r.mobile_number,r.purok,r.profile_id from public.barangay_residents r
    where r.resident_status='active'
      and (p_born_from is null or r.birth_date >= p_born_from)
      and (p_born_through is null or r.birth_date <= p_born_through)
      and (p_purok is null or r.purok=p_purok);
$$;
revoke all on function public.stamp_barangay_resident(),public.barangay_resident_directory(),
  public.save_barangay_resident(uuid,text,text,text,text,date,text,text,text),
  public.barangay_resident_candidates(date,date,text) from public,anon,authenticated;
grant execute on function public.barangay_resident_directory(),public.save_barangay_resident(uuid,text,text,text,text,date,text,text,text) to authenticated;
commit;
