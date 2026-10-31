-- Migration 062 behavioral acceptance harness.
-- Run ONLY in a disposable Supabase preview/test database after 001-062.
-- Every fixture and temporary identity change is rolled back.
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

-- Fixed UUIDs are synthetic and deliberately outside production identity use.
create temp table analytics_test_ids(k text primary key,id uuid not null);
insert into analytics_test_ids values
 ('official','f0620000-0000-4000-8000-000000000001'),
 ('resident_login','f0620000-0000-4000-8000-000000000002'),
 ('unlinked','f0620000-0000-4000-8000-000000000003'),
 ('archived','f0620000-0000-4000-8000-000000000004'),
 ('tanod','f0620000-0000-4000-8000-000000000005'),
 -- Authorization fixtures (TESTS 71-89): one synthetic account per position.
 ('punong','f0620000-0000-4000-8000-000000000006'),
 ('treasurer','f0620000-0000-4000-8000-000000000007'),
 ('kagawad','f0620000-0000-4000-8000-000000000008'),
 ('kagawad_po','f0620000-0000-4000-8000-000000000009'),
 ('sk_chair','f0620000-0000-4000-8000-00000000000a'),
 ('nurse','f0620000-0000-4000-8000-00000000000b'),
 ('resident_a','f0620000-0000-4000-8000-000000000101'),
 ('resident_b','f0620000-0000-4000-8000-000000000102'),
 ('resident_five','f0620000-0000-4000-8000-000000000105'),
 ('resident_six','f0620000-0000-4000-8000-000000000106'),
 ('resident_outcomes','f0620000-0000-4000-8000-000000000107'),
 ('resident_matter','f0620000-0000-4000-8000-000000000108'),
 ('resident_roles','f0620000-0000-4000-8000-000000000109'),
 ('external_a','f0620000-0000-4000-8000-000000000201'),
 ('external_b','f0620000-0000-4000-8000-000000000202'),
 ('external_c','f0620000-0000-4000-8000-000000000203'),
 ('external_d','f0620000-0000-4000-8000-000000000204');

-- Supabase auth.users is populated first because profiles.id may reference it.
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',k||'@analytics-test.invalid','',now(),'{}','{}',now(),now()
from analytics_test_ids where k in ('official','resident_login','unlinked','archived','tanod','punong','treasurer','kagawad','kagawad_po','sk_chair','nurse')
on conflict(id) do nothing;

insert into public.profiles(id,full_name,role) values
 ((select id from analytics_test_ids where k='official'),'Analytics Test Active Official','official'),
 ((select id from analytics_test_ids where k='resident_login'),'Analytics Test Login Resident','resident'),
 ((select id from analytics_test_ids where k='unlinked'),'Analytics Test Unlinked Official','official'),
 ((select id from analytics_test_ids where k='archived'),'Analytics Test Archived Official','official'),
 ((select id from analytics_test_ids where k='tanod'),'Analytics Test Tanod','tanod'),
 ((select id from analytics_test_ids where k='punong'),'Analytics Test Punong Barangay','official'),
 ((select id from analytics_test_ids where k='treasurer'),'Analytics Test Treasurer','official'),
 ((select id from analytics_test_ids where k='kagawad'),'Analytics Test Kagawad','official'),
 ((select id from analytics_test_ids where k='kagawad_po'),'Analytics Test Kagawad Peace And Order','official'),
 ((select id from analytics_test_ids where k='sk_chair'),'Analytics Test SK Chairperson','official'),
 ((select id from analytics_test_ids where k='nurse'),'Analytics Test Nurse','nurse')
on conflict(id) do update set full_name=excluded.full_name,role=excluded.role;

-- The fixtures below take the three powered positions, which a unique index
-- allows only one active holder of. This harness runs on a schema-only
-- disposable database; refuse clearly rather than touch a real official.
do $precondition$
begin
  if exists(select 1 from public.barangay_officials where archived_at is null
            and position in ('Punong Barangay','Barangay Secretary','Barangay Treasurer')) then
    raise exception 'SETUP PRECONDITION FAILED: a powered position already has an active holder; run only on a disposable schema-only database';
  end if;
end $precondition$;

-- Fully synthetic directory identities. Direct owner SQL is the sanctioned
-- maintenance path used by migrations, so the powered-position INSERT guard
-- permits this transaction-scoped Secretary fixture without weakening it.
insert into public.barangay_officials
  (id,full_name,position,committee,contact_number,display_order,created_by,archived_at,archived_by)
values
  ('f0620000-0000-4000-8000-000000000011','Analytics Test Active Official','Barangay Secretary',null,null,900001,
    (select id from analytics_test_ids where k='official'),null,null),
  ('f0620000-0000-4000-8000-000000000012','Analytics Test Archived Official','Kagawad',null,null,900002,
    (select id from analytics_test_ids where k='official'),now(),(select id from analytics_test_ids where k='official'));
-- One active, linked official per remaining position. The peace-and-order
-- committee is descriptive data and must grant nothing (TEST 78).
insert into public.barangay_officials
  (id,full_name,position,committee,contact_number,display_order,created_by,archived_at,archived_by)
values
  ('f0620000-0000-4000-8000-000000000013','Analytics Test Punong Barangay','Punong Barangay',null,null,900003,(select id from analytics_test_ids where k='official'),null,null),
  ('f0620000-0000-4000-8000-000000000014','Analytics Test Treasurer','Barangay Treasurer',null,null,900004,(select id from analytics_test_ids where k='official'),null,null),
  ('f0620000-0000-4000-8000-000000000015','Analytics Test Kagawad','Kagawad','Health',null,900005,(select id from analytics_test_ids where k='official'),null,null),
  ('f0620000-0000-4000-8000-000000000016','Analytics Test Kagawad Peace And Order','Kagawad','Peace and Order and Appropriation',null,900006,(select id from analytics_test_ids where k='official'),null,null),
  ('f0620000-0000-4000-8000-000000000017','Analytics Test SK Chairperson','SK Chairperson',null,null,900007,(select id from analytics_test_ids where k='official'),null,null);
insert into public.official_account_links(official_id,profile_id,linked_by)
values
 ('f0620000-0000-4000-8000-000000000011',(select id from analytics_test_ids where k='official'),'migration-062 behavioral test'),
 ('f0620000-0000-4000-8000-000000000012',(select id from analytics_test_ids where k='archived'),'migration-062 behavioral test'),
 ('f0620000-0000-4000-8000-000000000013',(select id from analytics_test_ids where k='punong'),'migration-062 behavioral test'),
 ('f0620000-0000-4000-8000-000000000014',(select id from analytics_test_ids where k='treasurer'),'migration-062 behavioral test'),
 ('f0620000-0000-4000-8000-000000000015',(select id from analytics_test_ids where k='kagawad'),'migration-062 behavioral test'),
 ('f0620000-0000-4000-8000-000000000016',(select id from analytics_test_ids where k='kagawad_po'),'migration-062 behavioral test'),
 ('f0620000-0000-4000-8000-000000000017',(select id from analytics_test_ids where k='sk_chair'),'migration-062 behavioral test');

insert into public.barangay_residents(id,first_name,last_name,purok,resident_status,profile_id) values
 ((select id from analytics_test_ids where k='resident_a'),'Analytics Test','Resident A','Analytics Area','active',(select id from analytics_test_ids where k='resident_login')),
 ((select id from analytics_test_ids where k='resident_b'),'Analytics Test','Resident A','Analytics Area','active',null),
 ((select id from analytics_test_ids where k='resident_five'),'Analytics Test','Five','Analytics Area','active',null),
 ((select id from analytics_test_ids where k='resident_six'),'Analytics Test','Six','Analytics Area','active',null),
 ((select id from analytics_test_ids where k='resident_outcomes'),'Analytics Test','Outcomes','Analytics Area','active',null);
insert into public.barangay_residents(id,first_name,last_name,purok,resident_status)
values
 ((select id from analytics_test_ids where k='resident_matter'),'Analytics Test','Matter','Analytics Area','active'),
 ((select id from analytics_test_ids where k='resident_roles'),'Analytics Test','Roles','Analytics Area','active');
insert into public.external_persons(id,first_name,last_name,recorded_barangay,created_by,updated_by) values
 ((select id from analytics_test_ids where k='external_a'),'Analytics Test','Same External','Batinguel',(select id from analytics_test_ids where k='official'),(select id from analytics_test_ids where k='official')),
 ((select id from analytics_test_ids where k='external_b'),'Analytics Test','Same External','Batinguel',(select id from analytics_test_ids where k='official'),(select id from analytics_test_ids where k='official'));
-- Display-name regression fixtures (TESTS 60-62): distinct external names, one
-- carrying every name part, so a blank or partial name cannot pass.
insert into public.external_persons(id,first_name,middle_name,last_name,suffix,recorded_barangay,created_by,updated_by) values
 ((select id from analytics_test_ids where k='external_c'),'Analytics Test','Middle','External Respondent','Jr.','Batinguel',(select id from analytics_test_ids where k='official'),(select id from analytics_test_ids where k='official')),
 ((select id from analytics_test_ids where k='external_d'),'Analytics Test',null,'External Complainant',null,'Batinguel',(select id from analytics_test_ids where k='official'),(select id from analytics_test_ids where k='official'));

-- Replace only policy status inside this disposable transaction, then create a
-- controlled active/retired pair. Existing rows and status return on rollback.
update public.community_credit_policies set status='retired' where status='active';
insert into public.community_credit_policies(id,name,base_score,minimum_score,maximum_score,status,effective_from,created_by,updated_by)
values
 ('f0620000-0000-4000-8000-000000000301','Analytics Active Policy',100,0,100,'active',now()-interval '3 years',(select id from analytics_test_ids where k='official'),(select id from analytics_test_ids where k='official')),
 ('f0620000-0000-4000-8000-000000000302','Analytics Retired Policy',100,0,100,'retired',now()-interval '4 years',(select id from analytics_test_ids where k='official'),(select id from analytics_test_ids where k='official'));
insert into public.community_credit_enrollments(resident_id,policy_id,started_at,starting_score,enrollment_source,created_by)
select id,'f0620000-0000-4000-8000-000000000301',now()-interval '1 year',100,'active_resident_batch',(select id from analytics_test_ids where k='official')
from analytics_test_ids where k in ('resident_a','resident_five','resident_six','resident_outcomes','resident_matter','resident_roles');
insert into public.community_credit_enrollments(resident_id,policy_id,started_at,starting_score,enrollment_source,created_by)
values((select id from analytics_test_ids where k='resident_b'),'f0620000-0000-4000-8000-000000000302',now()-interval '2 years',100,'active_resident_batch',(select id from analytics_test_ids where k='official'));

create temp table analytics_fixture_incidents(id uuid primary key,reference text,fixture text,n int);
-- Five and six qualifying pre-enrollment matters, plus role exclusions and the
-- exact enrollment-boundary matter.
insert into analytics_fixture_incidents
select gen_random_uuid(),'INC-AN-FIVE-'||n,'five',n from generate_series(1,5)n
union all select gen_random_uuid(),'INC-AN-SIX-'||n,'six',n from generate_series(1,6)n
union all select gen_random_uuid(),'INC-AN-ROLE-'||n,'roles',n from generate_series(1,5)n
union all select gen_random_uuid(),'INC-AN-OUT-'||n,'outcomes',n from generate_series(1,6)n
union all select gen_random_uuid(),'INC-AN-TIME-'||n,'windows',n from generate_series(1,5)n
union all select gen_random_uuid(),'INC-AN-BOUNDARY','boundary',1
union all select gen_random_uuid(),'INC-AN-HOUR-'||n,'hours',n from generate_series(0,23)n;

insert into public.incidents(id,reference,incident_type,occurred_at,narrative,location_text,area_note,source,status,recorded_by)
select id,reference,
 case when fixture='outcomes' then 'threat' when fixture='windows' then 'disturbance' else 'other' end,
 case fixture
  when 'five' then now()-interval '18 months'-(n||' days')::interval
  when 'six' then now()-interval '18 months'-(n||' days')::interval
  when 'roles' then now()-interval '18 months'-(n||' hours')::interval
  when 'outcomes' then now()-(n||' days')::interval
  when 'windows' then case n when 1 then now()-interval '10 days' when 2 then now()-interval '45 days' when 3 then now()-interval '100 days' when 4 then now()-interval '13 months' else now()-interval '18 months' end
  when 'boundary' then (select started_at from public.community_credit_enrollments where resident_id=(select id from analytics_test_ids where k='resident_six') and policy_id='f0620000-0000-4000-8000-000000000301')
  else ((now() at time zone 'Asia/Manila')::date::timestamp + (n||' hours')::interval) at time zone 'Asia/Manila' end,
 'Synthetic analytics fixture','Analytics Harness Location',
 case when fixture='hours' then 'Analytics Hour Area' when fixture='windows' then 'Analytics Window Area' else 'Analytics Area' end,
 'official_report','recorded',(select id from analytics_test_ids where k='official')
from analytics_fixture_incidents;
-- trg_stamp_incident_reference replaces any supplied reference on INSERT, so the
-- 'INC-AN-*' values above are labels only. Record each fixture's
-- database-generated reference by its UUID; assertions read it from here.
update analytics_fixture_incidents f set reference=i.reference
from public.incidents i where i.id=f.id;

insert into public.incident_parties(incident_id,resident_id,role,name_snapshot,outcome_status,outcome_recorded_at,outcome_recorded_by,created_by,updated_by)
select i.id,t.id,'respondent','Analytics Test Five','not_determined',null,null,o.id,o.id
from analytics_fixture_incidents i cross join lateral(select id from analytics_test_ids where k='resident_five')t
cross join lateral(select id from analytics_test_ids where k='official')o where i.fixture='five';
insert into public.incident_parties(incident_id,resident_id,role,name_snapshot,outcome_status,outcome_recorded_at,outcome_recorded_by,created_by,updated_by)
select i.id,t.id,case when n=6 then 'subject' else 'respondent' end,'Analytics Test Six','not_determined',null,null,o.id,o.id
from analytics_fixture_incidents i cross join lateral(select id from analytics_test_ids where k='resident_six')t
cross join lateral(select id from analytics_test_ids where k='official')o where i.fixture='six';
insert into public.incident_parties(incident_id,resident_id,role,name_snapshot,outcome_status,outcome_recorded_at,outcome_recorded_by,created_by,updated_by)
select i.id,t.id,(array['victim','witness','reporting_party','respondent'])[n],'Analytics Test Roles','not_determined',null,null,o.id,o.id
from analytics_fixture_incidents i cross join lateral(select id from analytics_test_ids where k='resident_roles')t
cross join lateral(select id from analytics_test_ids where k='official')o where i.fixture='roles' and i.n<=4;
insert into public.incident_parties(incident_id,resident_id,role,name_snapshot,outcome_status,outcome_recorded_at,outcome_recorded_by,created_by,updated_by)
select i.id,t.id,'subject','Analytics Test Roles','not_determined',null,null,o.id,o.id
from analytics_fixture_incidents i cross join lateral(select id from analytics_test_ids where k='resident_roles')t
cross join lateral(select id from analytics_test_ids where k='official')o where i.fixture='roles' and i.n=5;
insert into public.incident_parties(incident_id,resident_id,role,name_snapshot,outcome_status,outcome_recorded_at,outcome_recorded_by,created_by,updated_by)
select i.id,t.id,'respondent','Analytics Test Outcomes',(array['substantiated','not_substantiated','not_determined','referred','closed','unknown'])[n],
 case when n=3 then null else now() end,case when n=3 then null else o.id end,o.id,o.id
from analytics_fixture_incidents i cross join lateral(select id from analytics_test_ids where k='resident_outcomes')t
cross join lateral(select id from analytics_test_ids where k='official')o where i.fixture='outcomes';
-- Two roles for one person/matter prove DISTINCT matter counting.
insert into public.incident_parties(incident_id,resident_id,role,name_snapshot,outcome_status,outcome_recorded_at,outcome_recorded_by,created_by,updated_by)
select i.id,t.id,x.role,'Analytics Test Resident A','not_determined',null,null,o.id,o.id
from analytics_fixture_incidents i cross join (values('respondent'),('subject'))x(role)
cross join lateral(select id from analytics_test_ids where k='resident_matter')t
cross join lateral(select id from analytics_test_ids where k='official')o where i.fixture='windows' and i.n=1;
insert into public.incident_parties(incident_id,resident_id,role,name_snapshot,outcome_status,outcome_recorded_at,outcome_recorded_by,created_by,updated_by)
select i.id,t.id,'respondent','Analytics Test Resident A','not_determined',null,null,o.id,o.id
from analytics_fixture_incidents i
join analytics_test_ids t on (i.n=2 and t.k='resident_a') or (i.n=3 and t.k='resident_b')
cross join lateral(select id from analytics_test_ids where k='official')o
where i.fixture='windows' and i.n in(2,3);
insert into public.incident_parties(incident_id,resident_id,role,name_snapshot,outcome_status,outcome_recorded_at,outcome_recorded_by,created_by,updated_by)
select i.id,t.id,'respondent','Analytics Test Six','not_determined',null,null,o.id,o.id
from analytics_fixture_incidents i cross join lateral(select id from analytics_test_ids where k='resident_six')t
cross join lateral(select id from analytics_test_ids where k='official')o where i.fixture='boundary';

-- One blotter row cannot create another authoritative incident matter.
insert into public.blotter_entries(entry_reference,incident_id,summary,recorded_by)
select 'BLT-AN-001',id,'Synthetic linked blotter',(select id from analytics_test_ids where k='official')
from analytics_fixture_incidents where fixture='windows' and n=1;

-- Complaint/KP fixtures and explicit incident relation.
insert into public.complaints(id,reference,intake_channel,category,narrative,status,location_note,encoded_by,created_at) values
 ('f0620000-0000-4000-8000-000000000401','CMP-AN-001','walk_in','other','Synthetic complaint','received','Analytics Area',(select id from analytics_test_ids where k='official'),now()-interval '20 days'),
 ('f0620000-0000-4000-8000-000000000402','CMP-AN-002','walk_in','other','Synthetic reversed dispute','received','Analytics Area',(select id from analytics_test_ids where k='official'),now()-interval '10 days'),
 ('f0620000-0000-4000-8000-000000000403','CMP-AN-EXTERNAL','walk_in','other','Same text, no explicit link','received','Analytics Area',(select id from analytics_test_ids where k='official'),now()-interval '8 days');
insert into public.complaints(id,reference,intake_channel,category,narrative,status,location_note,encoded_by,created_at)
values('f0620000-0000-4000-8000-000000000404','CMP-AN-BLANK','walk_in','other','Blank-location fixture','received',' ',(select id from analytics_test_ids where k='official'),now()-interval '7 days');
-- trg_stamp_complaint_reference likewise replaces 'CMP-AN-*'. Capture the
-- database-generated reference of each complaint fixture by its fixed UUID.
create temp table analytics_fixture_refs(k text primary key,id uuid not null,reference text);
insert into analytics_fixture_refs
select v.k,v.id,c.reference
from (values('cmp_001','f0620000-0000-4000-8000-000000000401'::uuid),('cmp_002','f0620000-0000-4000-8000-000000000402'::uuid),
             ('cmp_external','f0620000-0000-4000-8000-000000000403'::uuid),('cmp_blank','f0620000-0000-4000-8000-000000000404'::uuid))v(k,id)
left join public.complaints c on c.id=v.id;
insert into public.complaint_parties(complaint_id,party_role,full_name_snapshot,resident_id) values
 ('f0620000-0000-4000-8000-000000000401','complainant','Analytics Test Resident A',(select id from analytics_test_ids where k='resident_a')),
 ('f0620000-0000-4000-8000-000000000401','respondent','Analytics Test Resident A',(select id from analytics_test_ids where k='resident_b')),
 ('f0620000-0000-4000-8000-000000000401','respondent','Analytics Test Matter',(select id from analytics_test_ids where k='resident_matter')),
 ('f0620000-0000-4000-8000-000000000402','complainant','Analytics Test Resident A',(select id from analytics_test_ids where k='resident_b')),
 ('f0620000-0000-4000-8000-000000000402','respondent','Analytics Test Resident A',(select id from analytics_test_ids where k='resident_a'));
insert into public.complaint_parties(complaint_id,party_role,full_name_snapshot,external_person_id) values
 ('f0620000-0000-4000-8000-000000000403','complainant','Analytics Test Same External',(select id from analytics_test_ids where k='external_a')),
 ('f0620000-0000-4000-8000-000000000403','respondent','Analytics Test Same External',(select id from analytics_test_ids where k='external_b'));
insert into public.complaint_parties(complaint_id,party_role,full_name_snapshot,external_person_id)
values('f0620000-0000-4000-8000-000000000404','respondent','Analytics Test Same External',(select id from analytics_test_ids where k='external_a'));
-- Three complaints between two external people (TESTS 60-62). Deliberately THREE,
-- not two, so this pair can never satisfy TEST 48/49's matter_count == 2 checks
-- on behalf of the resident A/B pair those tests exist to prove.
insert into public.complaints(id,reference,intake_channel,category,narrative,status,location_note,encoded_by,created_at)
-- Their location note is a unique marker so TESTS 76-79 can prove it never
-- reaches a non-administrator through ANY response field.
select v.id::uuid,'CMP-AN-EXT-'||right(v.id,1),'walk_in','other','External display-name fixture','received','ANALYTICS-SECRET-LOCATION',
 (select id from analytics_test_ids where k='official'),now()-v.age
from (values('f0620000-0000-4000-8000-000000000405',interval '6 days'),('f0620000-0000-4000-8000-000000000406',interval '5 days'),
             ('f0620000-0000-4000-8000-000000000407',interval '4 days'))v(id,age);
insert into public.complaint_parties(complaint_id,party_role,full_name_snapshot,external_person_id)
select c.id::uuid,x.role,x.snapshot,(select id from analytics_test_ids where k=x.k)
from (values('f0620000-0000-4000-8000-000000000405'),('f0620000-0000-4000-8000-000000000406'),('f0620000-0000-4000-8000-000000000407'))c(id)
cross join (values('complainant','Snapshot Complainant','external_d'),('respondent','Snapshot Respondent','external_c'))x(role,snapshot,k);
insert into public.complaint_screenings(id,complaint_id,checklist_version,answers,prepared_by,confirmed_outcome,confirmed_by,confirmed_at)
values('f0620000-0000-4000-8000-000000000411','f0620000-0000-4000-8000-000000000401','v1','{}',(select id from analytics_test_ids where k='official'),'proceed_to_kp_process',(select id from analytics_test_ids where k='official'),now());
insert into public.kp_cases(id,reference,complaint_id,screening_id,status,opened_by)
values('f0620000-0000-4000-8000-000000000421','KP-AN-001','f0620000-0000-4000-8000-000000000401','f0620000-0000-4000-8000-000000000411','open',(select id from analytics_test_ids where k='official'));
insert into public.incident_case_links(incident_id,case_id,linked_by)
select id,'f0620000-0000-4000-8000-000000000421',(select id from analytics_test_ids where k='official')
from analytics_fixture_incidents where fixture='windows' and n=1;

-- Every captured reference must exist, be non-blank, be unique, and belong to
-- the fixture row it was read from; otherwise a negative assertion below could
-- pass merely because it searched for a value that was never stored.
do $ref_check$
begin
  if (select count(*) from analytics_fixture_refs)<>4
     or exists(select 1 from analytics_fixture_refs f left join public.complaints c on c.id=f.id and c.reference=f.reference
               where c.id is null or coalesce(btrim(f.reference),'')='')
     or (select count(distinct reference) from analytics_fixture_refs)<>4
     or (select count(*) from analytics_fixture_incidents)<>52
     or exists(select 1 from analytics_fixture_incidents f left join public.incidents i on i.id=f.id and i.reference=f.reference
               where i.id is null or coalesce(btrim(f.reference),'')='')
     or (select count(distinct reference) from analytics_fixture_incidents)<>52
  then raise exception 'SETUP FAILED: a fixture has no unique database-generated reference'; end if;
end;
$ref_check$;

-- Input-validation helpers (TESTS 63-70). rejects_with is true only when the
-- call raises the function's OWN validation message, so an unrelated failure
-- (for example 'Person unavailable' or a permission error) cannot count as a pass.
create function pg_temp.rejects_with(p_sql text,p_message text)
returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when raise_exception then
  return sqlerrm=p_message;
end; $$;
create function pg_temp.accepts(p_sql text)
returns boolean language plpgsql as $$
begin
  execute p_sql;
  return true;
exception when others then
  raise notice 'accepts() refused a valid call: % %',sqlstate,sqlerrm;
  return false;
end; $$;
-- Authorization helper (TESTS 71-89). Runs one statement AS the given caller --
-- real JWT claims and the real API role, exactly as PostgREST would -- and
-- returns {"state": SQLSTATE or "00000", "data": result}. The role switch sits
-- OUTSIDE the inner exception block, so a refused call cannot roll it back and
-- leave the next probe running as the previous caller.
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

-- Direct helper calls run as owner for fixture assertions; RPC authorization is
-- separately exercised below with actual authenticated/anon roles.
reset role;
select set_config('request.jwt.claim.sub',(select id::text from analytics_test_ids where k='official'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from analytics_test_ids where k='official'),'role','authenticated')::text,true);

do $tests$
declare a jsonb; b jsonb; d jsonb; before_events bigint; before_enrollments bigint;
  five uuid:=(select id from analytics_test_ids where k='resident_five');
  six uuid:=(select id from analytics_test_ids where k='resident_six');
  outp uuid:=(select id from analytics_test_ids where k='resident_outcomes');
  ra uuid:=(select id from analytics_test_ids where k='resident_a');
  rm uuid:=(select id from analytics_test_ids where k='resident_matter');
  rr uuid:=(select id from analytics_test_ids where k='resident_roles');
  ext_a uuid:=(select id from analytics_test_ids where k='external_a');
  -- Database-generated references, captured by fixture UUID during setup.
  ref_cmp_001 text:=(select reference from analytics_fixture_refs where k='cmp_001');
  ref_cmp_external text:=(select reference from analytics_fixture_refs where k='cmp_external');
  ref_cmp_blank text:=(select reference from analytics_fixture_refs where k='cmp_blank');
  ref_boundary text:=(select reference from analytics_fixture_incidents where fixture='boundary');
begin
  -- 1-6 matter identity and explicit relationships.
  a:=public.person_analytics('resident',rm,null,null,'all');
  perform pg_temp.assert_true((a#>>'{summary,incident_matters}')::int=1,'TEST 1 FAILED: incident alone must be one matter');
  perform pg_temp.assert_true((a#>>'{summary,incident_matters}')::int=1,'TEST 2 FAILED: linked blotter inflated incident matter');
  perform pg_temp.assert_true((a#>>'{summary,complaint_kp_matters}')::int=1,'TEST 3 FAILED: complaint must be one matter');
  perform pg_temp.assert_true((a#>>'{summary,complaint_kp_matters}')::int=1,'TEST 4 FAILED: KP inflated complaint matter');
  perform pg_temp.assert_true((a#>>'{summary,distinct_linked_matters}')::int=2 and jsonb_path_exists(a,'$.contributing_matters[*].related_records[*] ? (@.reference == $r)',jsonb_build_object('r',ref_cmp_001)),'TEST 5 FAILED: linked incident/complaint must remain two related matter keys');
  -- Positive control first: the external complaint's real reference IS reported for
  -- the person explicitly linked to it, so its absence below is meaningful.
  perform pg_temp.assert_true(exists(select 1 from public.analytics_person_matters('external',ext_a) where matter_id='f0620000-0000-4000-8000-000000000403' and reference=ref_cmp_external)
    and not jsonb_path_exists(a,'$.contributing_matters[*] ? (@.reference == $r)',jsonb_build_object('r',ref_cmp_external)),'TEST 6 FAILED: similar text/name created implicit linkage');

  -- 7-12 role semantics.
  a:=public.person_analytics('resident',rr,null,null,'all');
  perform pg_temp.assert_true(jsonb_path_exists(a,'$.roles[*] ? (@.role == "victim" && @.total == 1)'),'TEST 7 FAILED: victim role count');
  perform pg_temp.assert_true(jsonb_path_exists(a,'$.roles[*] ? (@.role == "witness" && @.total == 1)'),'TEST 8 FAILED: witness role count');
  perform pg_temp.assert_true((a#>>'{historical_review,qualifying_count}')::int=2,'TEST 9 FAILED: reporting party entered historical review');
  perform pg_temp.assert_true(not jsonb_path_exists(a,'$.historical_review.contributing_matters[*] ? (@.role == "complainant")'),'TEST 10 FAILED: complainant entered historical review');
  perform pg_temp.assert_true(jsonb_path_exists(a,'$.historical_review.contributing_matters[*] ? (@.role == "respondent")'),'TEST 11 FAILED: respondent did not qualify');
  perform pg_temp.assert_true(jsonb_path_exists(a,'$.historical_review.contributing_matters[*] ? (@.role == "subject")'),'TEST 12 FAILED: subject did not qualify');

  -- 13-19 outcomes remain distinct; closed is not substantiated.
  a:=public.person_analytics('resident',outp,null,null,'all');
  perform pg_temp.assert_true(jsonb_path_exists(a,'$.outcomes[*] ? (@.outcome == "substantiated" && @.total == 1)'),'TEST 13 FAILED: substantiated outcome');
  perform pg_temp.assert_true(jsonb_path_exists(a,'$.outcomes[*] ? (@.outcome == "not_substantiated" && @.total == 1)'),'TEST 14 FAILED: not_substantiated outcome');
  perform pg_temp.assert_true(jsonb_path_exists(a,'$.outcomes[*] ? (@.outcome == "not_determined" && @.total == 1)'),'TEST 15 FAILED: not_determined outcome');
  perform pg_temp.assert_true(jsonb_path_exists(a,'$.outcomes[*] ? (@.outcome == "referred" && @.total == 1)'),'TEST 16 FAILED: referred outcome');
  perform pg_temp.assert_true(jsonb_path_exists(a,'$.outcomes[*] ? (@.outcome == "closed" && @.total == 1)'),'TEST 17 FAILED: closed outcome');
  perform pg_temp.assert_true(jsonb_path_exists(a,'$.outcomes[*] ? (@.outcome == "unknown" && @.total == 1)'),'TEST 18 FAILED: unknown outcome');
  perform pg_temp.assert_true((select (x->>'total')::int from jsonb_array_elements(a->'outcomes')x where x->>'outcome'='substantiated')=1,'TEST 19 FAILED: closed incremented substantiated');

  -- 20-29 historical review and no credit mutation.
  a:=public.person_analytics('resident',five,null,null,'all');
  perform pg_temp.assert_true((a#>>'{historical_review,qualifying_count}')::int=5 and (a#>>'{historical_review,requires_review}')::boolean=false,'TEST 20 FAILED: five matters must not require review');
  a:=public.person_analytics('resident',six,null,null,'all');
  perform pg_temp.assert_true((a#>>'{historical_review,qualifying_count}')::int=6 and (a#>>'{historical_review,requires_review}')::boolean=true,'TEST 21 FAILED: exactly six matters must require review');
  perform pg_temp.assert_true(not jsonb_path_exists(a,'$.historical_review.contributing_matters[*] ? (@.role == "victim")'),'TEST 22 FAILED: victim contributed');
  perform pg_temp.assert_true(not jsonb_path_exists(a,'$.historical_review.contributing_matters[*] ? (@.role == "witness")'),'TEST 23 FAILED: witness contributed');
  perform pg_temp.assert_true(not jsonb_path_exists(a,'$.historical_review.contributing_matters[*] ? (@.role == "reporting_party")'),'TEST 24 FAILED: reporting party contributed');
  perform pg_temp.assert_true(not jsonb_path_exists(a,'$.historical_review.contributing_matters[*] ? (@.role == "complainant")'),'TEST 25 FAILED: complainant contributed');
  perform pg_temp.assert_true((a#>>'{community_credit_periods,post_enrollment_qualifying_matters}')::int=1 and (a#>>'{historical_review,qualifying_count}')::int=6,'TEST 26 FAILED: post-enrollment matter contributed');
  perform pg_temp.assert_true(jsonb_array_length(a#>'{historical_review,contributing_matters}')=(a#>>'{historical_review,qualifying_count}')::int,'TEST 27 FAILED: linked representation inflated history');
  select count(*) into before_events from public.community_credit_events;
  select count(*) into before_enrollments from public.community_credit_enrollments;
  perform public.person_analytics('resident',six,null,null,'all'); perform public.barangay_safety_analytics(null,null,null,null,'all');
  perform pg_temp.assert_true((select count(*) from public.community_credit_events)=before_events,'TEST 28 FAILED: analytics created a credit event');
  perform pg_temp.assert_true((select count(*) from public.community_credit_enrollments)=before_enrollments,'TEST 29 FAILED: analytics changed resident credit state');

  -- 30-35 windows. Counts use the uniquely named fixture area.
  a:=public.barangay_safety_analytics(null,null,'disturbance','Analytics Window Area','last_30_days');
  perform pg_temp.assert_true((a#>>'{overview,distinct_incident_matters}')::int=1,'TEST 30 FAILED: last 30 days');
  a:=public.barangay_safety_analytics(null,null,'disturbance','Analytics Window Area','last_90_days');
  perform pg_temp.assert_true((a#>>'{overview,distinct_incident_matters}')::int=2,'TEST 31 FAILED: last 90 days');
  a:=public.barangay_safety_analytics(null,null,'disturbance','Analytics Window Area','last_12_months');
  perform pg_temp.assert_true((a#>>'{overview,distinct_incident_matters}')::int=3,'TEST 32 FAILED: last 12 months');
  a:=public.barangay_safety_analytics(null,null,'disturbance','Analytics Window Area','previous_12_months');
  perform pg_temp.assert_true((a#>>'{overview,distinct_incident_matters}')::int=2,'TEST 33 FAILED: previous 12 months');
  perform pg_temp.assert_true((public.barangay_safety_analytics(null,null,'disturbance','Analytics Window Area','last_12_months')#>>'{overview,distinct_incident_matters}')::int+
    (public.barangay_safety_analytics(null,null,'disturbance','Analytics Window Area','previous_12_months')#>>'{overview,distinct_incident_matters}')::int=5,'TEST 34 FAILED: twelve-month windows overlap or leave a gap');
  -- Boundary semantics are directly verified from the RPC contract.
  a:=public.person_analytics('resident',six,null,null,'all');
  perform pg_temp.assert_true((a#>>'{community_credit_periods,post_enrollment_qualifying_matters}')::int=1
    and jsonb_path_exists(a,'$.contributing_matters[*] ? (@.reference == $r)',jsonb_build_object('r',ref_boundary))
    and not jsonb_path_exists(a,'$.historical_review.contributing_matters[*] ? (@.reference == $r)',jsonb_build_object('r',ref_boundary)),'TEST 35 FAILED: enrollment boundary must be post-enrollment');

  -- 36-43 temporal/category/location aggregation.
  a:=public.barangay_safety_analytics((now() at time zone 'Asia/Manila')::date,(now() at time zone 'Asia/Manila')::date,'other','Analytics Hour Area','custom');
  perform pg_temp.assert_true((select sum((x->>'total')::int) from jsonb_array_elements(a->'time_buckets')x)=24 and jsonb_array_length(a->'time_buckets')=6,'TEST 36 FAILED: 24 hours must occupy six exclusive buckets');
  perform pg_temp.assert_true((select sum((x->>'total')::int) from jsonb_array_elements(a->'time_buckets')x)=24,'TEST 37 FAILED: Asia/Manila local hours interpreted incorrectly');
  perform pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(a->'weekdays') with ordinality x(v,n) join jsonb_array_elements(a->'weekdays') with ordinality y(v,n) on y.n=x.n+1 where (x.v->>'weekday_number')::int>(y.v->>'weekday_number')::int),'TEST 38 FAILED: weekday order');
  perform pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(a->'monthly') with ordinality x(v,n) join jsonb_array_elements(a->'monthly') with ordinality y(v,n) on y.n=x.n+1 where x.v->>'month'>y.v->>'month'),'TEST 39 FAILED: month order');
  b:=public.person_analytics('resident',rm,null,null,'all');
  perform pg_temp.assert_true((select sum((x->>'total')::int) from jsonb_array_elements(b->'categories')x)=(b#>>'{summary,distinct_linked_matters}')::int,'TEST 40 FAILED: category distinct matters');
  perform pg_temp.assert_true((select round(sum((x->>'percentage')::numeric),1) from jsonb_array_elements(b->'categories')x)=100.0,'TEST 41 FAILED: category denominator');
  perform pg_temp.assert_true((select sum((x->>'total')::int) from jsonb_array_elements(b->'locations')x)=(b#>>'{summary,distinct_linked_matters}')::int,'TEST 42 FAILED: area distinct matters');
  perform pg_temp.assert_true((select area_label from public.analytics_person_matters('external',ext_a) where matter_id='f0620000-0000-4000-8000-000000000404' and reference=ref_cmp_blank)='Not recorded','TEST 43 FAILED: blank location was not given a documented fallback');

  -- 44-50 identity grouping and dispute normalization.
  a:=public.barangay_safety_analytics(null,null,null,null,'all');
  perform pg_temp.assert_true(jsonb_path_exists(a,format('$.repeat_people[*] ? (@.person_id == "%s")',rm)::jsonpath),'TEST 44 FAILED: repeat grouping not keyed by kind+UUID');
  perform pg_temp.assert_true((select count(*) from jsonb_array_elements(a->'repeat_people')x where x->>'display_name'='Analytics Test Resident A')=2,'TEST 45 FAILED: same-name resident UUIDs were not kept distinct');
  perform pg_temp.assert_true((select count(*) from public.analytics_person_matters('external',(select id from analytics_test_ids where k='external_a')))>0 and (select count(*) from public.analytics_person_matters('external',(select id from analytics_test_ids where k='external_b')))>0,'TEST 46 FAILED: same-name external UUIDs were not kept distinct');
  perform pg_temp.assert_true((select (x->>'qualifying_matters')::int from jsonb_array_elements(a->'repeat_people')x where x->>'person_id'=rm::text)=2,'TEST 47 FAILED: duplicate roles inflated distinct matters');
  d:=public.repeated_dispute_analytics(null,null,'all');
  perform pg_temp.assert_true(jsonb_path_exists(d,'$[*] ? (@.matter_count == 2)'),'TEST 48 FAILED: A-to-B and B-to-A pair not normalized');
  perform pg_temp.assert_true(jsonb_path_exists(d,'$[*] ? (@.matter_count == 2 && @.matter_references.size() == 2)'),'TEST 49 FAILED: complaint plus KP counted more than once');
  -- Positive control: both real references are reported for their explicitly linked
  -- person, so their absence from the dispute output is meaningful.
  perform pg_temp.assert_true((select count(distinct reference) from public.analytics_person_matters('external',ext_a) where reference in (ref_cmp_external,ref_cmp_blank))=2
    and strpos(d::text,ref_cmp_external)=0 and strpos(d::text,ref_cmp_blank)=0,'TEST 50 FAILED: same-name people without a repeated UUID-linked pair were merged');

  -- 57-59 active policy and read-only behavior (auth tests are separate).
  a:=public.barangay_safety_analytics(null,null,null,null,'all');
  perform pg_temp.assert_true((a#>>'{community_credit,enrolled_residents}')::int=6,'TEST 57 FAILED: active-policy enrollment distribution');
  perform pg_temp.assert_true(not ((a#>>'{community_credit,enrolled_residents}')::int=7),'TEST 58 FAILED: retired-policy enrollment included');
  perform pg_temp.assert_true((select count(*) from public.community_credit_events)=before_events and (select count(*) from public.community_credit_enrollments)=before_enrollments,'TEST 59 FAILED: analytics RPC wrote data');

  -- 60-62 display names: the external name must be the external person's own
  -- name, never '' and never the snapshot; resident names must be unchanged.
  a:=public.barangay_safety_analytics(null,null,null,null,'all');
  d:=public.repeated_dispute_analytics(null,null,'all');
  perform pg_temp.assert_true(exists(select 1 from jsonb_array_elements(a->'repeat_people')x
      where x->>'person_kind'='external' and x->>'person_id'=(select id::text from analytics_test_ids where k='external_c')
        and x->>'display_name'='Analytics Test Middle External Respondent Jr.' and (x->>'qualifying_matters')::int=3)
    and not exists(select 1 from jsonb_array_elements(a->'repeat_people')x where coalesce(btrim(x->>'display_name'),'')=''),
    'TEST 60 FAILED: external repeat-person display name is blank or wrong');
  perform pg_temp.assert_true(exists(select 1 from jsonb_array_elements(d)x where (x->>'matter_count')::int=3
        and array[x->>'person_a',x->>'person_b']@>array['Analytics Test External Complainant','Analytics Test Middle External Respondent Jr.']
        and x->>'person_a'<>x->>'person_b')
    and not exists(select 1 from jsonb_array_elements(d)x where coalesce(btrim(x->>'person_a'),'')='' or coalesce(btrim(x->>'person_b'),'')=''),
    'TEST 61 FAILED: external dispute-pair display names are blank or wrong');
  perform pg_temp.assert_true((select x->>'display_name' from jsonb_array_elements(a->'repeat_people')x where x->>'person_id'=rm::text)='Analytics Test Matter'
    and exists(select 1 from jsonb_array_elements(d)x where (x->>'matter_count')::int=2
        and x->>'person_a'='Analytics Test Resident A' and x->>'person_b'='Analytics Test Resident A'),
    'TEST 62 FAILED: resident display names changed');

  -- 63-70 input validation. An explicit NULL is rejected with the function's own
  -- message; omitted arguments still take their declared defaults.
  perform pg_temp.assert_true(pg_temp.rejects_with(format('select public.person_analytics(%L,%L::uuid,null,null,null)','resident',rm),'Invalid analytics request'),
    'TEST 63 FAILED: person_analytics accepted a NULL window');
  perform pg_temp.assert_true(pg_temp.rejects_with(format('select public.person_analytics(null,%L::uuid,null,null,%L)',rm,'all'),'Invalid analytics request'),
    'TEST 64 FAILED: person_analytics accepted a NULL person kind');
  perform pg_temp.assert_true(pg_temp.rejects_with('select public.barangay_safety_analytics(null,null,null,null,null)','Invalid analytics range'),
    'TEST 65 FAILED: barangay_safety_analytics accepted a NULL window');
  perform pg_temp.assert_true(pg_temp.rejects_with('select public.repeated_dispute_analytics(null,null,null)','Invalid analytics range'),
    'TEST 66 FAILED: repeated_dispute_analytics accepted a NULL window');
  perform pg_temp.assert_true(
    pg_temp.rejects_with(format('select public.person_analytics(%L,%L::uuid,%L::date,%L::date,%L)','resident',rm,'2026-02-10','2026-02-01','custom'),'Invalid analytics request')
    and pg_temp.rejects_with('select public.barangay_safety_analytics(''2026-02-10''::date,''2026-02-01''::date,null,null,''custom'')','Invalid analytics range')
    and pg_temp.rejects_with('select public.repeated_dispute_analytics(''2026-02-10''::date,''2026-02-01''::date,''custom'')','Invalid analytics range'),
    'TEST 67 FAILED: a custom range ending before it starts was accepted');
  perform pg_temp.assert_true(
    pg_temp.rejects_with(format('select public.person_analytics(%L,%L::uuid,null,null,%L)','resident',rm,'custom'),'Invalid analytics request')
    and pg_temp.rejects_with('select public.barangay_safety_analytics(null,null,null,null,''custom'')','Invalid analytics range')
    and pg_temp.rejects_with('select public.repeated_dispute_analytics(null,null,''custom'')','Invalid analytics range'),
    'TEST 68 FAILED: a custom range with no dates was accepted');
  perform pg_temp.assert_true(
    pg_temp.rejects_with(format('select public.person_analytics(%L,%L::uuid,null,null,%L)','tanod',rm,'all'),'Invalid analytics request')
    and pg_temp.rejects_with(format('select public.person_analytics(%L,%L::uuid,null,null,%L)','resident',rm,'last_7_days'),'Invalid analytics request')
    and pg_temp.rejects_with('select public.barangay_safety_analytics(null,null,null,null,''last_7_days'')','Invalid analytics range')
    and pg_temp.rejects_with('select public.repeated_dispute_analytics(null,null,''last_7_days'')','Invalid analytics range'),
    'TEST 69 FAILED: an unknown person kind or window was accepted');
  -- Positive controls: validation must not reject valid open-ended or one-day
  -- custom ranges, or calls that omit the defaulted window.
  perform pg_temp.assert_true(
    pg_temp.accepts(format('select public.person_analytics(%L,%L::uuid)','resident',rm))
    and pg_temp.accepts(format('select public.person_analytics(%L,%L::uuid,%L::date,null,%L)','external',ext_a,'2026-01-01','custom'))
    and pg_temp.accepts('select public.barangay_safety_analytics()')
    and pg_temp.accepts('select public.barangay_safety_analytics(null,''2026-02-01''::date,null,null,''custom'')')
    and pg_temp.accepts('select public.barangay_safety_analytics(''2026-02-01''::date,''2026-02-01''::date,null,null,''custom'')')
    and pg_temp.accepts('select public.repeated_dispute_analytics()')
    and pg_temp.accepts('select public.repeated_dispute_analytics(''2026-02-01''::date,''2026-02-01''::date,''custom'')'),
    'TEST 70 FAILED: validation rejected a valid request');
end;
$tests$;

-- 51-56 authorization. Each failure is explicit and the production predicate
-- remains unchanged. Insufficient EXECUTE and predicate rejection both pass.
reset role;
do $auth_tests$
declare actor uuid; rejected boolean; allowed boolean;
begin
  rejected:=false;
  perform pg_temp.set_actor(null,'anon');
  begin perform public.barangay_safety_analytics(null,null,null,null,'all'); exception when insufficient_privilege or raise_exception then rejected:=true; end;
  reset role; perform pg_temp.assert_true(rejected,'TEST 51 FAILED: anonymous was allowed');

  rejected:=false;
  reset role; select id into actor from analytics_test_ids where k='resident_login'; perform pg_temp.set_actor(actor);
  begin perform public.barangay_safety_analytics(null,null,null,null,'all'); exception when insufficient_privilege or raise_exception then rejected:=true; end;
  reset role; perform pg_temp.assert_true(rejected,'TEST 52 FAILED: resident was allowed');

  rejected:=false;
  reset role; select id into actor from analytics_test_ids where k='unlinked'; perform pg_temp.set_actor(actor);
  begin perform public.barangay_safety_analytics(null,null,null,null,'all'); exception when insufficient_privilege or raise_exception then rejected:=true; end;
  reset role; perform pg_temp.assert_true(rejected,'TEST 53 FAILED: unlinked official was allowed');

  rejected:=false;
  reset role; select id into actor from analytics_test_ids where k='archived'; perform pg_temp.set_actor(actor);
  begin perform public.barangay_safety_analytics(null,null,null,null,'all'); exception when insufficient_privilege or raise_exception then rejected:=true; end;
  reset role; perform pg_temp.assert_true(rejected,'TEST 54 FAILED: archived official was allowed');

  allowed:=true;
  reset role; select id into actor from analytics_test_ids where k='official'; perform pg_temp.set_actor(actor);
  begin perform public.barangay_safety_analytics(null,null,null,null,'all'); exception when others then allowed:=false; end;
  reset role; perform pg_temp.assert_true(allowed,'TEST 55 FAILED: active linked Official was rejected');

  rejected:=false;
  reset role; select id into actor from analytics_test_ids where k='tanod'; perform pg_temp.set_actor(actor);
  begin perform public.barangay_safety_analytics(null,null,null,null,'all'); exception when insufficient_privilege or raise_exception then rejected:=true; end;
  reset role; perform pg_temp.assert_true(rejected,'TEST 56 FAILED: Tanod was allowed broad analytics');
end;
$auth_tests$;

-- 71-89 records-administration authorization. Every probe runs as the real
-- caller (pg_temp.as_actor). Rejections must be SQLSTATE 42501 specifically.
reset role;
do $authz_tests$
declare
  sec uuid:=(select id from analytics_test_ids where k='official');
  pun uuid:=(select id from analytics_test_ids where k='punong');
  tre uuid:=(select id from analytics_test_ids where k='treasurer');
  kag uuid:=(select id from analytics_test_ids where k='kagawad');
  kpo uuid:=(select id from analytics_test_ids where k='kagawad_po');
  skc uuid:=(select id from analytics_test_ids where k='sk_chair');
  arc uuid:=(select id from analytics_test_ids where k='archived');
  unl uuid:=(select id from analytics_test_ids where k='unlinked');
  nur uuid:=(select id from analytics_test_ids where k='nurse');
  res uuid:=(select id from analytics_test_ids where k='resident_login');
  tan uuid:=(select id from analytics_test_ids where k='tanod');
  rm uuid:=(select id from analytics_test_ids where k='resident_matter');
  ext_a uuid:=(select id from analytics_test_ids where k='external_a');
  ext_c uuid:=(select id from analytics_test_ids where k='external_c');
  ext_d uuid:=(select id from analytics_test_ids where k='external_d');
  q_bsa text:='select public.barangay_safety_analytics(null,null,null,null,''all'')';
  q_rda text:='select public.repeated_dispute_analytics(null,null,''all'')';
  q_pa text;
  q_apm text;
  windows text[]:=array['all','last_30_days','last_90_days','last_12_months','previous_12_months','custom'];
  categories text[]:=array[null,'other','disturbance'];
  areas text[]:=array[null,'Analytics Area'];
  restricted uuid[];
  r jsonb; s jsonb; base jsonb; actor uuid; w text; c text; ar text; p uuid; ok boolean;
  k text; label text;
begin
  q_pa:=format('select public.person_analytics(%L,%L::uuid,null,null,%L)','external',ext_c,'all');
  q_apm:=format('select to_jsonb(count(*)) from public.analytics_person_matters(%L,%L::uuid)','external',ext_c);
  restricted:=array[tre,kag,kpo,skc];

  -- 71-72 the two records administrators keep full access.
  base:=pg_temp.as_actor(sec,'authenticated',q_bsa);
  s:=pg_temp.as_actor(sec,'authenticated',q_rda);
  r:=pg_temp.as_actor(sec,'authenticated',q_pa);
  perform pg_temp.assert_true(base->>'state'='00000' and jsonb_typeof(base#>'{data,repeat_people}')='array'
      and (base#>>'{data,repeat_people_restricted}')::boolean=false
      and jsonb_path_exists(base->'data',format('$.repeat_people[*] ? (@.person_id == "%s")',rm)::jsonpath)
      and s->>'state'='00000' and jsonb_path_exists(s->'data','$[*] ? (@.matter_count == 2)')
      and r->>'state'='00000' and strpos(r->>'data','ANALYTICS-SECRET-LOCATION')>0
      and not jsonb_path_exists(r->'data','$.locations[*] ? (@.area_label == "Restricted")'),
    'TEST 71 FAILED: Barangay Secretary lost records-administrator analytics');
  s:=pg_temp.as_actor(pun,'authenticated',q_bsa);
  perform pg_temp.assert_true(s->>'state'='00000' and s->'data'=base->'data'
      and (pg_temp.as_actor(pun,'authenticated',q_rda))->>'state'='00000'
      and strpos((pg_temp.as_actor(pun,'authenticated',q_pa))->>'data','ANALYTICS-SECRET-LOCATION')>0,
    'TEST 72 FAILED: Punong Barangay lost records-administrator analytics');

  -- 73-79 every other active, linked official.
  foreach actor in array restricted loop
    label:=case actor when tre then 'Treasurer' when kag then 'Kagawad' when kpo then 'peace-and-order Kagawad' else 'SK Chairperson' end;
    r:=pg_temp.as_actor(actor,'authenticated',q_bsa);
    perform pg_temp.assert_true(r->>'state'='00000' and jsonb_typeof(r#>'{data,repeat_people}')='null'
        and (r#>>'{data,repeat_people_restricted}')::boolean=true,
      format('TEST 73 FAILED: %s received repeat_people, or no explicit restricted flag',label));
    perform pg_temp.assert_true((r->'data')-'repeat_people'-'repeat_people_restricted'=(base->'data')-'repeat_people'-'repeat_people_restricted',
      format('TEST 74 FAILED: %s general safety statistics differ from an administrator''s',label));
    perform pg_temp.assert_true((pg_temp.as_actor(actor,'authenticated',q_rda))->>'state'='42501',
      format('TEST 75 FAILED: %s was not refused repeated_dispute_analytics with 42501',label));
    -- 76 complaint location masked in every field, every window, both parties.
    foreach p in array array[ext_c,ext_d] loop
      foreach w in array windows loop
        r:=pg_temp.as_actor(actor,'authenticated',format('select public.person_analytics(%L,%L::uuid,%L::date,%L::date,%L)',
          'external',p,case when w='custom' then '2000-01-01' end,case when w='custom' then (now() at time zone 'Asia/Manila')::date::text end,w));
        perform pg_temp.assert_true(r->>'state'='00000' and strpos(r->>'data','ANALYTICS-SECRET-LOCATION')=0,
          format('TEST 76 FAILED: complaint location reached %s (window %s)',label,w));
      end loop;
    end loop;
    r:=pg_temp.as_actor(actor,'authenticated',q_pa);
    s:=pg_temp.as_actor(sec,'authenticated',q_pa);
    perform pg_temp.assert_true(jsonb_path_exists(r->'data','$.locations[*] ? (@.area_label == "Restricted" && @.total == 3)')
        and not jsonb_path_exists(r->'data','$.contributing_matters[*] ? (@.kind == "complaint" && @.area != "Restricted")'),
      format('TEST 77 FAILED: %s complaint locations are not shown as Restricted',label));
    -- Masking changes the label only: every count, key and reference is unchanged.
    perform pg_temp.assert_true(r#>'{data,summary}'=s#>'{data,summary}' and r#>'{data,roles}'=s#>'{data,roles}'
        and r#>'{data,categories}'=s#>'{data,categories}'
        and (select jsonb_agg(x-'area' order by x->>'matter_key') from jsonb_array_elements(r#>'{data,contributing_matters}')x)
           =(select jsonb_agg(x-'area' order by x->>'matter_key') from jsonb_array_elements(s#>'{data,contributing_matters}')x),
      format('TEST 78 FAILED: masking changed %s counts or matters, not only the location label',label));
    -- 79 no parameter combination reveals the restricted list.
    ok:=true;
    foreach w in array windows loop foreach c in array categories loop foreach ar in array areas loop
      r:=pg_temp.as_actor(actor,'authenticated',format('select public.barangay_safety_analytics(%L::date,%L::date,%L,%L,%L)',
        case when w='custom' then '2000-01-01' end,case when w='custom' then (now() at time zone 'Asia/Manila')::date::text end,c,ar,w));
      ok:=ok and r->>'state'='00000' and jsonb_typeof(r#>'{data,repeat_people}')='null' and (r#>>'{data,repeat_people_restricted}')::boolean=true;
    end loop; end loop; end loop;
    perform pg_temp.assert_true(ok,format('TEST 79 FAILED: a filter combination revealed repeat_people to %s',label));
  end loop;

  -- 80-85 callers who must be refused every analytics reader with 42501.
  foreach k in array array['archived','unlinked','nurse','resident','tanod','anon'] loop
    actor:=case k when 'archived' then arc when 'unlinked' then unl when 'nurse' then nur when 'resident' then res when 'tanod' then tan end;
    ok:=(pg_temp.as_actor(actor,case when k='anon' then 'anon' else 'authenticated' end,q_bsa))->>'state'='42501'
    and (pg_temp.as_actor(actor,case when k='anon' then 'anon' else 'authenticated' end,q_rda))->>'state'='42501'
    and (pg_temp.as_actor(actor,case when k='anon' then 'anon' else 'authenticated' end,q_pa))->>'state'='42501';
    perform pg_temp.assert_true(ok,format('TEST %s FAILED: %s was not refused every analytics reader with 42501',
      case k when 'archived' then 80 when 'unlinked' then 81 when 'nurse' then 82 when 'resident' then 83 when 'tanod' then 84 else 85 end,k));
  end loop;

  -- 86 the internal helper is not an RPC for anybody, administrators included.
  ok:=true;
  foreach actor in array array[sec,pun,tre,kag,res] loop
    ok:=ok and (pg_temp.as_actor(actor,'authenticated',q_apm))->>'state'='42501';
  end loop;
  perform pg_temp.assert_true(ok and (pg_temp.as_actor(null,'anon',q_apm))->>'state'='42501',
    'TEST 86 FAILED: analytics_person_matters was directly executable');

  -- 87 direct reads cannot route around the functions to the same data.
  perform pg_temp.assert_true(
    (pg_temp.as_actor(kpo,'authenticated','select to_jsonb(count(*)) from public.complaint_parties'))->>'state'='42501'
    and (pg_temp.as_actor(kpo,'authenticated',format('select to_jsonb(count(*)) from public.complaints where id=%L::uuid','f0620000-0000-4000-8000-000000000405')))->'data'='0'::jsonb
    and (pg_temp.as_actor(tre,'authenticated','select to_jsonb(count(*)) from public.complaint_parties'))->>'state'='42501',
    'TEST 87 FAILED: a non-administrator read complaint locations or parties directly');

  -- 88 crafted dispute calls are refused for every non-administrator, whatever the range.
  ok:=true;
  foreach actor in array restricted loop foreach w in array windows loop
    ok:=ok and (pg_temp.as_actor(actor,'authenticated',format('select public.repeated_dispute_analytics(%L::date,%L::date,%L)',
      case when w='custom' then '2000-01-01' end,case when w='custom' then '2000-12-31' end,w)))->>'state'='42501';
  end loop; end loop;
  perform pg_temp.assert_true(ok,'TEST 88 FAILED: a crafted repeated_dispute_analytics call was not refused');

  -- 89 administrators see the complaint location that is masked for others
  -- (positive control: TESTS 76-77 cannot pass because the marker never existed).
  perform pg_temp.assert_true(
    strpos((pg_temp.as_actor(sec,'authenticated',format('select public.person_analytics(%L,%L::uuid,null,null,%L)','external',ext_d,'all')))->>'data','ANALYTICS-SECRET-LOCATION')>0
    and strpos((pg_temp.as_actor(pun,'authenticated',q_pa))->>'data','ANALYTICS-SECRET-LOCATION')>0
    and (select count(*) from public.complaints where location_note='ANALYTICS-SECRET-LOCATION')=3,
    'TEST 89 FAILED: the masked location marker is not visible to records administrators');
end;
$authz_tests$;

reset role;
select 'PASS: all 89 migration-062 behavioral contracts passed; transaction will now roll back.' as result;
rollback;
