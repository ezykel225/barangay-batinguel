-- CONTROLLED DEMO DATA ONLY. Not migration 055. Requires migration 054.
-- Run manually in the intended DEMO project's SQL Editor as its database owner.
-- THIS SCRIPT HAS NOT BEEN EXECUTED BY THE IMPLEMENTING AGENT.
-- Owner confirmed: in THIS capstone/demo database, every currently verified
-- resident profile is an intended demo account. Resolve those UUIDs at execution;
-- never use names, email, voter membership or a hard-coded account count.
-- Do not use this seed in a production database. No live counts are assumed.
--
-- DEMO ONLY: birth dates below are synthetic and are not asserted to be
-- the real birth dates of these account holders.
-- They are written only to new directory rows, never to profiles.
-- Fixed UUID ordering assigns the first three candidates senior-example DOBs.
-- The example distribution is relative to the capstone date 20 October 2026;
-- it defines no permanent Senior Citizen eligibility rule for the application.
-- Existing linked directory rows (including real DOBs/statuses) are preserved.

begin;

do $demo_seed$
declare
  demo_profile_ids uuid[];
  v_expected integer;
  v_found integer;
  v_inserted integer;
begin
  select coalesce(array_agg(p.id order by p.id),array[]::uuid[]) into demo_profile_ids
    from public.profiles p
    where p.role = 'resident' and p.verification_status = 'verified';
  v_expected := cardinality(demo_profile_ids);
  if coalesce(v_expected,0) = 0 then
    raise exception 'No currently verified resident profiles exist; no residents were seeded.';
  end if;
  if exists (select 1 from unnest(demo_profile_ids) as x(id) where id is null)
     or v_expected <> (select count(distinct id) from unnest(demo_profile_ids) as x(id)) then
    raise exception 'Demo UUID allowlist contains null or duplicate IDs.';
  end if;

  -- Lock selected source rows until commit so eligibility cannot change mid-seed.
  perform p.id from public.profiles p where p.id = any(demo_profile_ids) for share;
  select count(*) into v_found from public.profiles p
    where p.id = any(demo_profile_ids)
      and p.role = 'resident' and p.verification_status = 'verified';
  if v_found <> v_expected then
    raise exception 'Every allowlisted UUID must exist and currently be a verified resident. Expected %, eligible %; no rows seeded.', v_expected,v_found;
  end if;

  -- Migration 054 requires structured names and usable nonempty mobiles.
  -- Fail the entire transaction instead of splitting full_name, replacing values,
  -- silently dropping invalid phones, truncating names or inventing puroks.
  if exists (
    select 1 from public.profiles p where p.id = any(demo_profile_ids) and (
      nullif(btrim(p.first_name),'') is null or length(p.first_name) > 100
      or nullif(btrim(p.last_name),'') is null or length(p.last_name) > 100
      or length(p.middle_name) > 100 or length(p.suffix) > 30
      or length(p.purok) > 100
      or (nullif(btrim(p.contact_number),'') is not null and
          regexp_replace(p.contact_number,'[[:space:]()-]','','g') !~ '^(09[0-9]{9}|[+]639[0-9]{9}|639[0-9]{9})$')
    )
  ) then
    raise exception 'An allowlisted profile has missing/incompatible name parts, mobile or purok. Review source data; no replacements were invented.';
  end if;
  if current_date < date '2000-04-18' then
    raise exception 'Demo dates are not valid for this database date.';
  end if;

  -- Transaction-local scope used by the verification SELECTs below; no persistent
  -- schema, profile or authentication configuration is changed.
  perform pg_catalog.set_config('batinguel.demo_resident_profile_ids',array_to_string(demo_profile_ids,','),true);

  with selected as (
    select p.*,row_number() over (order by p.id) as demo_order
      from public.profiles p where p.id = any(demo_profile_ids)
  )
  insert into public.barangay_residents (
    first_name,middle_name,last_name,suffix,birth_date,mobile_number,purok,resident_status,profile_id
  )
  select first_name,middle_name,last_name,suffix,
    case demo_order
      when 1 then date '1950-01-15'
      when 2 then date '1958-06-10'
      when 3 then date '1965-03-22'
      else (date '1980-04-18' + ((demo_order - 4) % 21)::integer * interval '1 year')::date
    end,
    case when nullif(btrim(contact_number),'') is null then null else contact_number end,
    purok,'active',id
  from selected
  on conflict (profile_id) do nothing;

  get diagnostics v_inserted = row_count;
  raise notice 'Confirmed demo profiles: %. New rows inserted: %. Existing linked rows preserved: %.',v_expected,v_inserted,v_expected-v_inserted;
  raise notice 'Planned senior-example DOB slots: % (first three sorted UUIDs). Existing DOBs are never overwritten.',least(3,v_expected);
end;
$demo_seed$;

-- Verification is scoped ONLY to this execution-time verified demo UUID snapshot, not all residents.
-- DOB/mobile counts and senior-example results reflect preserved existing rows too.
select count(*) as allowlisted_directory_residents,
  count(profile_id) as linked_profile_count,
  count(*) filter (where resident_status = 'active') as active_count,
  count(birth_date) as with_birth_date,
  count(*) filter (where nullif(btrim(mobile_number),'') is not null) as with_mobile_number,
  count(*) filter (where birth_date <= (current_date - interval '60 years')::date) as age_60_plus_today
from public.barangay_residents
where profile_id = any(string_to_array(current_setting('batinguel.demo_resident_profile_ids'),',')::uuid[]);

select purok,count(*) as resident_count from public.barangay_residents
where profile_id = any(string_to_array(current_setting('batinguel.demo_resident_profile_ids'),',')::uuid[])
group by purok order by purok nulls last;

-- Identity/date verification only: no bulk phone list, credentials or auth data.
select profile_id,concat_ws(' ',first_name,middle_name,last_name,suffix) as resident_name,
  birth_date,extract(year from age(current_date,birth_date))::integer as age_today,
  birth_date <= (current_date - interval '60 years')::date as age_60_plus_today
from public.barangay_residents
where profile_id = any(string_to_array(current_setting('batinguel.demo_resident_profile_ids'),',')::uuid[])
order by profile_id;

commit;
