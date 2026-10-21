-- NOT APPLIED. Future verification synchronization only; NOT demo seed data.
-- Requires 054. Apply separately after seeding current demo residents if desired.
-- No backfill, synthetic birth dates, name matching, voter writes or SMS.
begin;
do $prerequisites$
begin
  if pg_catalog.to_regclass('public.barangay_residents') is null
    or pg_catalog.to_regprocedure('public.stamp_barangay_resident()') is null then
    raise exception '055 requires the resident directory foundation in 054';
  end if;
end;
$prerequisites$;

create function public.sync_verified_resident_directory()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_existed boolean;
begin
  -- Existing profile RLS and BEFORE verification guards remain authoritative.
  -- This AFTER trigger cannot verify an account or change any profile value.
  if new.role is distinct from 'resident' or new.verification_status is distinct from 'verified' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.role = 'resident' and old.verification_status = 'verified' then
      return new; -- Not a newly verified account; no continuous profile mirroring.
    end if;
  end if;

  -- Do not invent structured names or replace malformed contact details.
  -- If source fields violate 054, the verification transaction fails atomically,
  -- requiring correction of that source data before the official retries.
  select exists(select 1 from public.barangay_residents where profile_id = new.id) into v_existed;
  insert into public.barangay_residents as directory (
    first_name,middle_name,last_name,suffix,birth_date,mobile_number,purok,resident_status,profile_id
  ) values (
    new.first_name,new.middle_name,new.last_name,new.suffix,null,
    case when nullif(btrim(new.contact_number),'') is null then null else new.contact_number end,
    new.purok,'active',new.id
  )
  on conflict (profile_id) do update set
    first_name=excluded.first_name,
    middle_name=excluded.middle_name,
    last_name=excluded.last_name,
    suffix=excluded.suffix,
    mobile_number=excluded.mobile_number,
    purok=excluded.purok
  -- Deliberately omit birth_date and resident_status on conflict:
  -- preserve any legitimately supplied DOB, existing demo DOB, or stand-down.
  returning id into v_id;

  insert into public.activity_log(action,entity_type,entity_id,subject)
    values(case when v_existed then 'edited' else 'added' end,
      'barangay_resident',v_id,'Resident directory synchronized after account verification');
  return new;
end;
$$;
revoke all on function public.sync_verified_resident_directory() from public,anon,authenticated;
create trigger trg_sync_verified_resident_directory
  after insert or update of role,verification_status on public.profiles
  for each row execute function public.sync_verified_resident_directory();
commit;
