-- Migration 063 behavioral acceptance harness.
-- Run ONLY in a disposable test database that holds the post-061 schema (062 optional)
-- AFTER 063 has been applied there. Every fixture is rolled back.
--
-- Each probe runs as the real caller: JWT claims plus the real API role, exactly as
-- PostgREST would. A refusal must be SQLSTATE 42501 (insufficient_privilege); every
-- refusal test is paired with positive controls, so a test cannot pass merely
-- because everything was refused.
--
-- Negative control: run a copy whose assert_true raises NOTICE instead of EXCEPTION
-- against a database WITHOUT 063 -- the retirement tests must then report failures.
begin;

set local timezone='UTC';

create function pg_temp.assert_true(p_ok boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_ok,false) then raise exception '%',p_message; end if;
end; $$;

create function pg_temp.set_actor(p_id uuid,p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',coalesce(p_id::text,''),true);
  perform set_config('request.jwt.claims',case when p_id is null then '{}' else
    jsonb_build_object('sub',p_id,'role',p_role)::text end,true);
  execute format('set local role %I',p_role);
end; $$;

-- Runs one statement AS the caller and returns {"state": SQLSTATE or "00000",
-- "data": result}. The role switch sits OUTSIDE the inner exception block, so a
-- refused call cannot roll the switch back and leave the next probe running as
-- the previous caller.
create function pg_temp.as_actor(p_id uuid,p_role text,p_sql text)
returns jsonb language plpgsql as $$
declare v_result jsonb; v_state text:='00000';
begin
  perform pg_temp.set_actor(p_id,p_role);
  begin
    execute p_sql into v_result;
  exception when others then
    v_state:=sqlstate; v_result:=null;
  end;
  reset role;
  return jsonb_build_object('state',v_state,'data',v_result);
end; $$;

-- The fixtures below take two powered positions. Refuse clearly rather than touch
-- a real official: this harness is for a disposable database only.
do $precondition$
begin
  if exists(select 1 from public.barangay_officials where archived_at is null
            and position in ('Barangay Secretary','Barangay Treasurer')) then
    raise exception 'SETUP PRECONDITION FAILED: a powered position already has an active holder; run only on a disposable database';
  end if;
end $precondition$;

create temp table t063_ids(k text primary key,id uuid not null);
insert into t063_ids values
 ('resident','f0630000-0000-4000-8000-000000000001'),
 ('nurse','f0630000-0000-4000-8000-000000000002'),
 ('treasurer','f0630000-0000-4000-8000-000000000003'),
 ('secretary','f0630000-0000-4000-8000-000000000004'),
 ('reservation','f0630000-0000-4000-8000-000000000101'),
 ('health_event','f0630000-0000-4000-8000-000000000201'),
 ('nurse_slot','f0630000-0000-4000-8000-000000000202'),
 ('medicine','f0630000-0000-4000-8000-000000000203'),
 ('program','f0630000-0000-4000-8000-000000000204'),
 ('waste','f0630000-0000-4000-8000-000000000301'),
 ('registry','f0630000-0000-4000-8000-000000000401'),
 ('complaint','f0630000-0000-4000-8000-000000000501');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',k||'@retired-063-test.invalid','',now(),'{}','{}',now(),now()
from t063_ids where k in ('resident','nurse','treasurer','secretary') on conflict(id) do nothing;
insert into public.profiles(id,full_name,role) values
 ((select id from t063_ids where k='resident'),'Retired Test Resident','resident'),
 ((select id from t063_ids where k='nurse'),'Retired Test Nurse','nurse'),
 ((select id from t063_ids where k='treasurer'),'Retired Test Treasurer','official'),
 ((select id from t063_ids where k='secretary'),'Retired Test Secretary','official')
on conflict(id) do update set full_name=excluded.full_name,role=excluded.role;
insert into public.barangay_officials(id,full_name,position,committee,contact_number,display_order,created_by,archived_at,archived_by) values
 ('f0630000-0000-4000-8000-000000000013','Retired Test Treasurer','Barangay Treasurer',null,null,906301,(select id from t063_ids where k='secretary'),null,null),
 ('f0630000-0000-4000-8000-000000000014','Retired Test Secretary','Barangay Secretary',null,null,906302,(select id from t063_ids where k='secretary'),null,null);
insert into public.official_account_links(official_id,profile_id,linked_by) values
 ('f0630000-0000-4000-8000-000000000013',(select id from t063_ids where k='treasurer'),'migration-063 behavioral test'),
 ('f0630000-0000-4000-8000-000000000014',(select id from t063_ids where k='secretary'),'migration-063 behavioral test');

-- Historical records, written as the table owner (the maintenance path).
insert into public.reservations(id,full_name,purok,contact_number,residency_status,preferred_date,preferred_time,duration_hours,purpose,status,activity_type,reference)
values((select id from t063_ids where k='reservation'),'Retired Test Booker','Analytics Area','09170000063','resident',
       (now() at time zone 'Asia/Manila')::date+30,'5:00 PM',1,'Historical fixture','pending','Basketball','RES-063-FIXTURE');
insert into public.health_events(id,title) values((select id from t063_ids where k='health_event'),'Retired Test Health Event');
insert into public.nurse_availability(id,day_of_week,time_start,time_end,status) values((select id from t063_ids where k='nurse_slot'),'Monday','8:00 AM','5:00 PM','available');
insert into public.medicine_stock(id,name,status) values((select id from t063_ids where k='medicine'),'Retired Test Medicine','available');
insert into public.medical_programs(id,title,schedule_label,time_label) values((select id from t063_ids where k='program'),'Retired Test Program','Mondays','8:00 AM');
insert into public.waste_schedule(id,purok,waste_type,day_of_week) values((select id from t063_ids where k='waste'),'Retired Test Purok','Biodegradable','Monday');
insert into public.residents_registry(id,full_name,purok) values((select id from t063_ids where k='registry'),'Retired Test Voter','Retired Test Purok');
insert into public.complaints(id,reference,intake_channel,category,narrative,status,location_note,encoded_by,created_at)
values((select id from t063_ids where k='complaint'),'CMP-063-FIXTURE','walk_in','other','Retired-module fixture complaint','received','Retired Test Area',(select id from t063_ids where k='secretary'),now());
insert into public.complaint_parties(complaint_id,party_role,full_name_snapshot,contact_number_snapshot)
values((select id from t063_ids where k='complaint'),'complainant','Retired Test Complainant','0917-555-0630');

reset role;
do $tests$
declare
  res uuid:=(select id from t063_ids where k='resident');
  nur uuid:=(select id from t063_ids where k='nurse');
  tre uuid:=(select id from t063_ids where k='treasurer');
  sec uuid:=(select id from t063_ids where k='secretary');
  rid uuid:=(select id from t063_ids where k='reservation');
  cmp_ref text:=(select reference from public.complaints where id=(select id from t063_ids where k='complaint'));
  rpcs text[]:=array[
    'select to_jsonb(public.create_court_reservation(''A'',''P'',''09170000000'',null,''resident'',current_date+30,''5:00 PM'',1,''6:00 PM'',''x'',''Basketball''))',
    'select to_jsonb(count(*)) from public.track_court_reservation(''RES-063-FIXTURE'',''09170000063'')',
    'select to_jsonb(count(*)) from public.get_reservation_slots(current_date+30)',
    'select to_jsonb(count(*)) from public.get_reservation_slots_range(current_date,current_date+60)'];
  q text; ok boolean; r jsonb; actor uuid; role text; tbl text;
begin
  perform pg_temp.assert_true(cmp_ref is not null and rid is not null,'SETUP FAILED: fixtures missing');

  -- 1-3 the four retired reservation RPCs are refused (42501) for every client.
  ok:=true; foreach q in array rpcs loop ok:=ok and (pg_temp.as_actor(null,'anon',q))->>'state'='42501'; end loop;
  perform pg_temp.assert_true(ok,'TEST 1 FAILED: anon could reach a retired reservation RPC');
  ok:=true; foreach q in array rpcs loop ok:=ok and (pg_temp.as_actor(res,'authenticated',q))->>'state'='42501'; end loop;
  perform pg_temp.assert_true(ok,'TEST 2 FAILED: a resident could reach a retired reservation RPC');
  ok:=true; foreach q in array rpcs loop ok:=ok and (pg_temp.as_actor(tre,'authenticated',q))->>'state'='42501'; end loop;
  perform pg_temp.assert_true(ok,'TEST 3 FAILED: the Treasurer could reach a retired reservation RPC');

  -- 4 the reference generator is not an RPC for anybody.
  perform pg_temp.assert_true((pg_temp.as_actor(null,'anon','select to_jsonb(public.generate_reservation_reference(2026))'))->>'state'='42501'
    and (pg_temp.as_actor(res,'authenticated','select to_jsonb(public.generate_reservation_reference(2026))'))->>'state'='42501',
    'TEST 4 FAILED: generate_reservation_reference is client-executable');

  -- 5-7 no direct reservations path: read, create, change or delete.
  perform pg_temp.assert_true((pg_temp.as_actor(null,'anon','select to_jsonb(count(*)) from public.reservations'))->>'state'='42501'
    and (pg_temp.as_actor(null,'anon','insert into public.reservations(full_name,preferred_date,preferred_time,residency_status,activity_type) values(''X'',current_date+30,''6:00 PM'',''resident'',''Basketball'') returning to_jsonb(id)'))->>'state'='42501',
    'TEST 5 FAILED: anon has a direct reservations path');
  ok:=true;
  foreach q in array array[
    'select to_jsonb(count(*)) from public.reservations',
    'insert into public.reservations(full_name,preferred_date,preferred_time,residency_status,activity_type) values(''X'',current_date+30,''6:00 PM'',''resident'',''Basketball'') returning to_jsonb(id)',
    format('update public.reservations set resident_viewed_at=now() where id=%L returning to_jsonb(id)',rid),
    format('delete from public.reservations where id=%L returning to_jsonb(id)',rid)] loop
    ok:=ok and (pg_temp.as_actor(res,'authenticated',q))->>'state'='42501';
  end loop;
  perform pg_temp.assert_true(ok,'TEST 6 FAILED: a resident has a direct reservations path');
  perform pg_temp.assert_true((pg_temp.as_actor(tre,'authenticated','select to_jsonb(count(*)) from public.reservations'))->>'state'='42501'
    and (pg_temp.as_actor(tre,'authenticated',format('update public.reservations set status=''approved'' where id=%L returning to_jsonb(id)',rid)))->>'state'='42501',
    'TEST 7 FAILED: the Treasurer can still read or decide reservations');

  -- 8 no write policy survives on reservations; the inert SELECT policies remain.
  perform pg_temp.assert_true(
    not exists(select 1 from pg_policies where schemaname='public' and tablename='reservations' and cmd in ('INSERT','UPDATE','DELETE','ALL'))
    and (select count(*) from pg_policies where schemaname='public' and tablename='reservations' and cmd='SELECT')=2,
    'TEST 8 FAILED: reservations policy set is not as intended');

  -- 9 the maintenance paths remain: service_role reads the history and may still
  -- call the retired RPC (so an approved administrative action is possible).
  r:=pg_temp.as_actor(null,'service_role',format('select to_jsonb(count(*)) from public.reservations where id=%L',rid));
  perform pg_temp.assert_true(r->>'state'='00000' and (r->>'data')::int=1
    and has_function_privilege('service_role','public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text)','EXECUTE'),
    'TEST 9 FAILED: service_role lost its maintenance access');

  -- 10 history and structure are preserved: the row, its stamped reference, the
  -- four triggers and the overlap constraint.
  perform pg_temp.assert_true(
    (select count(*) from public.reservations where id=rid)=1
    and (select reference from public.reservations where id=rid) is not null
    and (select count(*) from pg_trigger where tgrelid='public.reservations'::regclass and not tgisinternal)=4
    and exists(select 1 from pg_constraint where conname='reservations_no_overlapping_slots' and convalidated),
    'TEST 10 FAILED: reservation history or structure changed');

  -- 11 the nurse role can no longer write any health table.
  ok:=true;
  foreach q in array array[
    'insert into public.health_events(title) values(''X'') returning to_jsonb(id)',
    format('update public.health_events set title=''X'' where id=%L returning to_jsonb(id)',(select id from t063_ids where k='health_event')),
    format('delete from public.health_events where id=%L returning to_jsonb(id)',(select id from t063_ids where k='health_event')),
    'insert into public.nurse_availability(day_of_week,status) values(''Tuesday'',''available'') returning to_jsonb(id)',
    format('update public.nurse_availability set status=''on-leave'' where id=%L returning to_jsonb(id)',(select id from t063_ids where k='nurse_slot')),
    format('delete from public.nurse_availability where id=%L returning to_jsonb(id)',(select id from t063_ids where k='nurse_slot')),
    'insert into public.medicine_stock(name,status) values(''X'',''low'') returning to_jsonb(id)',
    format('update public.medicine_stock set status=''low'' where id=%L returning to_jsonb(id)',(select id from t063_ids where k='medicine')),
    format('delete from public.medicine_stock where id=%L returning to_jsonb(id)',(select id from t063_ids where k='medicine')),
    'insert into public.medical_programs(title,schedule_label,time_label) values(''X'',''Y'',''Z'') returning to_jsonb(id)',
    format('update public.medical_programs set title=''X'' where id=%L returning to_jsonb(id)',(select id from t063_ids where k='program')),
    format('delete from public.medical_programs where id=%L returning to_jsonb(id)',(select id from t063_ids where k='program'))] loop
    ok:=ok and (pg_temp.as_actor(nur,'authenticated',q))->>'state'='42501';
  end loop;
  perform pg_temp.assert_true(ok,'TEST 11 FAILED: the nurse role can still write a retired health table');

  -- 12 nor can anon or a resident.
  perform pg_temp.assert_true((pg_temp.as_actor(null,'anon','insert into public.health_events(title) values(''X'') returning to_jsonb(id)'))->>'state'='42501'
    and (pg_temp.as_actor(res,'authenticated',format('update public.medicine_stock set status=''low'' where id=%L returning to_jsonb(id)',(select id from t063_ids where k='medicine'))))->>'state'='42501',
    'TEST 12 FAILED: anon or a resident can write a retired health table');

  -- 13 positive control: the kept public reads still work and see the history.
  -- (ids are inlined: anon cannot read the owner's temporary fixture table)
  ok:=true;
  foreach tbl in array array['health_events:health_event','nurse_availability:nurse_slot','medicine_stock:medicine','medical_programs:program'] loop
    r:=pg_temp.as_actor(null,'anon',format('select to_jsonb(count(*)) from public.%I where id=%L',
      split_part(tbl,':',1),(select id from t063_ids where k=split_part(tbl,':',2))));
    ok:=ok and r->>'state'='00000' and (r->>'data')::int=1;
  end loop;
  perform pg_temp.assert_true(ok,'TEST 13 FAILED: a kept public health read stopped working');

  -- 14-15 Waste Management: no official write; the public read remains.
  ok:=true;
  foreach q in array array[
    'insert into public.waste_schedule(purok,waste_type,day_of_week) values(''X'',''Y'',''Monday'') returning to_jsonb(id)',
    format('update public.waste_schedule set notes=''x'' where id=%L returning to_jsonb(id)',(select id from t063_ids where k='waste')),
    format('delete from public.waste_schedule where id=%L returning to_jsonb(id)',(select id from t063_ids where k='waste'))] loop
    ok:=ok and (pg_temp.as_actor(sec,'authenticated',q))->>'state'='42501';
  end loop;
  perform pg_temp.assert_true(ok,'TEST 14 FAILED: an official can still write the waste schedule');
  r:=pg_temp.as_actor(null,'anon',format('select to_jsonb(count(*)) from public.waste_schedule where id=%L',(select id from t063_ids where k='waste')));
  perform pg_temp.assert_true(r->>'state'='00000' and (r->>'data')::int=1,'TEST 15 FAILED: the kept public waste read stopped working');

  -- 16-19 Voter registry: writes closed even for the Secretary; the official read
  -- that feeds the Voter List Match column remains; others see nothing.
  ok:=true;
  foreach q in array array[
    'insert into public.residents_registry(full_name) values(''X'') returning to_jsonb(id)',
    format('update public.residents_registry set purok=''x'' where id=%L returning to_jsonb(id)',(select id from t063_ids where k='registry')),
    format('delete from public.residents_registry where id=%L returning to_jsonb(id)',(select id from t063_ids where k='registry'))] loop
    ok:=ok and (pg_temp.as_actor(sec,'authenticated',q))->>'state'='42501';
  end loop;
  perform pg_temp.assert_true(ok,'TEST 16 FAILED: the voter registry is still writable by an official');
  r:=pg_temp.as_actor(sec,'authenticated',format('select to_jsonb(count(*)) from public.residents_registry where id=%L',(select id from t063_ids where k='registry')));
  perform pg_temp.assert_true(r->>'state'='00000' and (r->>'data')::int=1,'TEST 17 FAILED: officials lost the registry read used by Voter List Match');
  r:=pg_temp.as_actor(res,'authenticated','select to_jsonb(count(*)) from public.residents_registry');
  perform pg_temp.assert_true(r->>'state'='00000' and (r->>'data')::int=0,'TEST 18 FAILED: a resident can read the voter registry');
  perform pg_temp.assert_true((pg_temp.as_actor(null,'anon','select to_jsonb(count(*)) from public.residents_registry'))->>'state'='42501',
    'TEST 19 FAILED: anon still holds SELECT on the voter registry');

  -- 20-21 complaint tracking still works and still depends on the kept function.
  r:=pg_temp.as_actor(null,'anon',format('select to_jsonb(count(*)) from public.track_complaint(%L,%L)',lower(cmp_ref),'0917 555 0630'));
  perform pg_temp.assert_true(r->>'state'='00000' and (r->>'data')::int=1
    and ((pg_temp.as_actor(null,'anon',format('select to_jsonb(count(*)) from public.track_complaint(%L,%L)',cmp_ref,'09990000000')))->>'data')::int=0,
    'TEST 20 FAILED: public complaint tracking stopped working (or stopped requiring the contact)');
  perform pg_temp.assert_true((pg_temp.as_actor(null,'anon','select to_jsonb(public.normalize_reservation_reference(''cmp-2026-abcdef''))'))->>'state'='00000'
    and public.reservation_slot_hour('5:00 PM')=17,
    'TEST 21 FAILED: a kept helper function stopped working');

  -- 22 retained registry readers (SECURITY DEFINER) still work for officials.
  perform pg_temp.assert_true((pg_temp.as_actor(sec,'authenticated','select to_jsonb(count(*)) from public.search_case_residents(''Retired Test'')'))->>'state'='00000',
    'TEST 22 FAILED: search_case_residents broke');

  -- 23 retained services are untouched: availability, documents, complaints,
  -- Community Credit, Tanod.
  perform pg_temp.assert_true(
    ((pg_temp.as_actor(null,'anon','select to_jsonb(count(*)) from public.kapitan_availability'))->>'state')='00000'
    and has_table_privilege('authenticated','public.document_requests','INSERT')
    and has_function_privilege('authenticated','public.file_complaint_as_resident(text,text,text,jsonb)','EXECUTE')
    and has_function_privilege('anon','public.track_complaint(text,text)','EXECUTE')
    and has_function_privilege('authenticated','public.my_community_credit_profile()','EXECUTE')
    and has_function_privilege('authenticated','public.tanod_roster(boolean)','EXECUTE'),
    'TEST 23 FAILED: a retained service lost access');

  -- 24 no retired function keeps a bare PUBLIC grant (MASTER-B B5's rule).
  perform pg_temp.assert_true(not exists(select 1 from pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid in ('public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text)'::regprocedure,
                      'public.track_court_reservation(text,text)'::regprocedure,'public.get_reservation_slots(date)'::regprocedure,
                      'public.get_reservation_slots_range(date,date)'::regprocedure,'public.generate_reservation_reference(integer)'::regprocedure)
        and a.grantee=0),
    'TEST 24 FAILED: a retired function still carries PUBLIC EXECUTE');
end;
$tests$;

reset role;
select 'PASS: all 24 migration-063 behavioral contracts passed; transaction will now roll back.' as result;
rollback;
