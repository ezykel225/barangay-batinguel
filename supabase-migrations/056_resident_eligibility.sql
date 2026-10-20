-- NOT APPLIED. Requires 054 and 055. Atomic eligibility only; no backfill.
begin;
do $prerequisites$
begin
  if pg_catalog.to_regprocedure('public.sync_verified_resident_directory()') is null
    or pg_catalog.to_regprocedure('public.save_barangay_resident(uuid,text,text,text,text,date,text,text,text)') is null then
    raise exception '056 requires migrations 054 and 055';
  end if;
end;
$prerequisites$;

create function public.set_barangay_resident_eligibility(p_resident_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_link uuid;
  v_profile public.profiles%rowtype;
  v_resident public.barangay_residents%rowtype;
  v_directory_status text;
  v_account_status text;
begin
  if auth.uid() is null or not coalesce(public.current_official_may_administer_records(),false) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_active is null or p_resident_id is null then raise exception 'Resident and target status are required'; end if;
  v_directory_status := case when p_active then 'active' else 'inactive' end;
  v_account_status := case when p_active then 'verified' else 'ineligible' end;

  select profile_id into v_link from public.barangay_residents where id=p_resident_id;
  if not found then raise exception 'Resident unavailable'; end if;
  -- Match 055's profile -> directory lock order to avoid lock inversion.
  if v_link is not null then
    select * into v_profile from public.profiles where id=v_link for update;
    if not found or v_profile.role is distinct from 'resident' then raise exception 'Linked resident account unavailable'; end if;
  end if;
  select * into v_resident from public.barangay_residents where id=p_resident_id for update;
  if not found then raise exception 'Resident unavailable'; end if;
  if v_resident.profile_id is distinct from v_link then raise exception 'Account link changed; reload and retry'; end if;

  -- An identical retry performs no writes, audit inserts, notifications or timestamp changes.
  if v_resident.resident_status=v_directory_status and
    (v_link is null or v_profile.verification_status=v_account_status) then return; end if;

  if v_link is not null and v_profile.verification_status is distinct from v_account_status then
    update public.profiles set verification_status=v_account_status,
      verified_by=auth.uid(),verified_at=now(),
      verification_notes=case when p_active then null else 'Marked not a resident through resident directory review.' end
      where id=v_link;
    if not exists(select 1 from public.profiles where id=v_link and role='resident' and verification_status=v_account_status) then
      raise exception 'Linked account eligibility was not updated';
    end if;
  end if;

  -- Reactivation invokes the existing 055 trigger, whose UUID upsert copies profile
  -- fields into this directory row. Restore the locked authoritative snapshot so
  -- an eligibility action cannot overwrite separately reviewed directory details.
  -- 055's existing notification/audit behavior is retained inside this transaction.
  update public.barangay_residents set resident_status=v_directory_status,
    first_name=v_resident.first_name,middle_name=v_resident.middle_name,
    last_name=v_resident.last_name,suffix=v_resident.suffix,
    birth_date=v_resident.birth_date,mobile_number=v_resident.mobile_number,purok=v_resident.purok
    where id=p_resident_id;
  insert into public.activity_log(action,entity_type,entity_id,subject)
    values('edited','barangay_resident',p_resident_id,
      case when p_active then 'Barangay resident reactivated' else 'Barangay resident marked inactive' end);
end;
$$;
revoke all on function public.set_barangay_resident_eligibility(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_barangay_resident_eligibility(uuid,boolean) to authenticated;
-- Retain the existing writer permissions and data edits, with a status guard.
create or replace function public.save_barangay_resident(p_id uuid,p_first_name text,p_middle_name text,p_last_name text,
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
    -- A metadata edit cannot bypass the atomic eligibility RPC or overwrite a
    -- status changed concurrently while an old form was open.
    perform 1 from public.barangay_residents where id=p_id for update;
    if not found then raise exception 'Resident unavailable'; end if;
    if exists(select 1 from public.barangay_residents where id=p_id and resident_status is distinct from p_resident_status) then
      raise exception 'Eligibility changed or a status change was requested. Reload; use the eligibility action.';
    end if;
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
commit;
