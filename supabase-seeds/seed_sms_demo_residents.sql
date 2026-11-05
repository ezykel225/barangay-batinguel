-- PROPOSED ONLY. NOT EXECUTED. Synthetic SMS AUDIENCE tests in a DEMO database only.
-- Requires migrations 054-056. Review first; run manually as the database owner.
-- Never run against a production directory. No Auth/profile/voter writes or SMS.
-- All 30 demo residents intentionally have no mobile numbers.
-- This safely exercises skipped/missing-phone audience behavior.
-- Phone normalization, invalid-number handling and deduplication belong in
-- automated SMS tests using mocked provider data.
-- A controlled live SMS test must use only a number explicitly owned/controlled
-- by the project team. No real phone number should be inserted into this seed file.
-- Fixed ages are measured on 2026-10-20. 'Senior' is a synthetic group name for
-- age-range testing ONLY, not an official Senior Citizen eligibility policy.
-- Purok is free text (<=100 chars), not an enum. These five labels are schema-
-- permitted demo values, not a declaration of confirmed official purok boundaries.
-- Each age group has 10 NULL mobile numbers; no fabricated phone numbers are seeded.
-- No existing rows are updated. Any identity/data/phone collision aborts everything.

begin;
-- Serialize collision checks with directory writes; held only until commit/rollback.
lock table public.barangay_residents in share row exclusive mode;

do $sms_demo_seed$
declare
  v_row record;
  v_existing public.barangay_residents%rowtype;
  v_inserted integer := 0;
begin
  for v_row in
  with numbered as (
    select n, ((n - 1) / 10) as group_no, ((n - 1) % 10 + 1) as group_index
    from pg_catalog.generate_series(1, 30) as series(n)
  )
  select
    ('7c2d8f10-5a60-4b30-9d57-' || pg_catalog.lpad(n::text, 12, '0'))::uuid as id,
    case group_no when 0 then 'Demo SMS Senior'
      when 1 then 'Demo SMS Adult' else 'Demo SMS Young Adult' end as first_name,
    pg_catalog.lpad(group_index::text, 2, '0') as last_name,
    pg_catalog.make_date(case group_no when 0 then 1949 + group_index
      when 1 then 1964 + 3 * group_index else 1996 + group_index end, 1, 15) as birth_date,
    null::text as mobile_number,
    'Purok ' || (((n - 1) % 5) + 1)::text as purok
  from numbered
  loop
    -- Defensive collision guard retained; every mobile in this manifest is NULL.
    if v_row.mobile_number is not null and exists (
      select 1 from public.barangay_residents r
      where r.id <> v_row.id and
        pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(r.mobile_number, '[[:space:]()-]', '', 'g'),
          '^[+]?63', '0') = v_row.mobile_number
    ) then
      raise exception 'Synthetic phone collision for demo row %; nothing seeded.', v_row.id;
    end if;
    -- Do not duplicate an identically marked name already stored under another UUID.
    if exists (select 1 from public.barangay_residents r
      where r.id <> v_row.id and r.first_name = v_row.first_name
        and r.last_name = v_row.last_name) then
      raise exception 'Synthetic name collision for demo row %; nothing seeded.', v_row.id;
    end if;

    select r.* into v_existing from public.barangay_residents r where r.id = v_row.id;
    if found then
      -- Repeat runs accept only the exact original payload; never overwrite edits,
      -- reactivate a row, clear a profile link, or assume a colliding UUID is ours.
      if row(v_existing.first_name, v_existing.middle_name, v_existing.last_name,
             v_existing.suffix, v_existing.birth_date, v_existing.mobile_number,
             v_existing.purok, v_existing.resident_status, v_existing.profile_id)
        is distinct from
         row(v_row.first_name, null::text, v_row.last_name, null::text,
             v_row.birth_date, v_row.mobile_number, v_row.purok, 'active'::text, null::uuid) then
        raise exception 'Existing UUID % does not match the untouched demo payload; nothing seeded.', v_row.id;
      end if;
    else
      insert into public.barangay_residents (
        id, first_name, middle_name, last_name, suffix, birth_date,
        mobile_number, purok, resident_status, profile_id
      ) values (
        v_row.id, v_row.first_name, null, v_row.last_name, null, v_row.birth_date,
        v_row.mobile_number, v_row.purok, 'active', null
      );
      v_inserted := v_inserted + 1;
    end if;
  end loop;
  raise notice 'Synthetic SMS demo set: 30 expected rows; % inserted, % already present. No SMS sent.',
    v_inserted, 30 - v_inserted;
end;
$sms_demo_seed$;
commit;

-- OPTIONAL CLEANUP: COMMENTED OUT; run separately only after review.
-- Deletes only the exact 30 UUID + synthetic-name + original-payload matches.
-- Edited, linked, or eligibility-changed rows are deliberately left for review.
-- No CASCADE. Future foreign-key references may block deletion rather than erase history.
-- begin;
-- with expected as (
--   with numbered as (
--     select n, ((n - 1) / 10) as group_no, ((n - 1) % 10 + 1) as group_index
--     from pg_catalog.generate_series(1, 30) as series(n)
--   )
--   select
--     ('7c2d8f10-5a60-4b30-9d57-' || pg_catalog.lpad(n::text, 12, '0'))::uuid as id,
--     case group_no when 0 then 'Demo SMS Senior'
--       when 1 then 'Demo SMS Adult' else 'Demo SMS Young Adult' end as first_name,
--     pg_catalog.lpad(group_index::text, 2, '0') as last_name,
--     pg_catalog.make_date(case group_no when 0 then 1949 + group_index
--       when 1 then 1964 + 3 * group_index else 1996 + group_index end, 1, 15) as birth_date,
--     null::text as mobile_number,
--     'Purok ' || (((n - 1) % 5) + 1)::text as purok
--   from numbered
-- )
-- delete from public.barangay_residents r using expected e
-- where r.id = e.id
--   and r.first_name = e.first_name and r.last_name = e.last_name
--   and r.middle_name is null and r.suffix is null
--   and r.birth_date = e.birth_date
--   and r.mobile_number is null
--   and r.purok = e.purok
--   and r.resident_status = 'active' and r.profile_id is null;
-- commit;
