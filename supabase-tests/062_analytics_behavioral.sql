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
 ('resident_a','f0620000-0000-4000-8000-000000000101'),
 ('resident_b','f0620000-0000-4000-8000-000000000102'),
 ('resident_five','f0620000-0000-4000-8000-000000000105'),
 ('resident_six','f0620000-0000-4000-8000-000000000106'),
 ('resident_outcomes','f0620000-0000-4000-8000-000000000107'),
 ('resident_matter','f0620000-0000-4000-8000-000000000108'),
 ('resident_roles','f0620000-0000-4000-8000-000000000109'),
 ('external_a','f0620000-0000-4000-8000-000000000201'),
 ('external_b','f0620000-0000-4000-8000-000000000202');

-- Supabase auth.users is populated first because profiles.id may reference it.
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',k||'@analytics-test.invalid','',now(),'{}','{}',now(),now()
from analytics_test_ids where k in ('official','resident_login','unlinked','archived','tanod')
on conflict(id) do nothing;

insert into public.profiles(id,full_name,role) values
 ((select id from analytics_test_ids where k='official'),'Analytics Test Active Official','official'),
 ((select id from analytics_test_ids where k='resident_login'),'Analytics Test Login Resident','resident'),
 ((select id from analytics_test_ids where k='unlinked'),'Analytics Test Unlinked Official','official'),
 ((select id from analytics_test_ids where k='archived'),'Analytics Test Archived Official','official'),
 ((select id from analytics_test_ids where k='tanod'),'Analytics Test Tanod','tanod')
on conflict(id) do update set full_name=excluded.full_name,role=excluded.role;

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
insert into public.official_account_links(official_id,profile_id,linked_by)
values
 ('f0620000-0000-4000-8000-000000000011',(select id from analytics_test_ids where k='official'),'migration-062 behavioral test'),
 ('f0620000-0000-4000-8000-000000000012',(select id from analytics_test_ids where k='archived'),'migration-062 behavioral test');

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
insert into public.complaint_screenings(id,complaint_id,checklist_version,answers,prepared_by,confirmed_outcome,confirmed_by,confirmed_at)
values('f0620000-0000-4000-8000-000000000411','f0620000-0000-4000-8000-000000000401','v1','{}',(select id from analytics_test_ids where k='official'),'proceed_to_kp_process',(select id from analytics_test_ids where k='official'),now());
insert into public.kp_cases(id,reference,complaint_id,screening_id,status,opened_by)
values('f0620000-0000-4000-8000-000000000421','KP-AN-001','f0620000-0000-4000-8000-000000000401','f0620000-0000-4000-8000-000000000411','open',(select id from analytics_test_ids where k='official'));
insert into public.incident_case_links(incident_id,case_id,linked_by)
select id,'f0620000-0000-4000-8000-000000000421',(select id from analytics_test_ids where k='official')
from analytics_fixture_incidents where fixture='windows' and n=1;

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
begin
  -- 1-6 matter identity and explicit relationships.
  a:=public.person_analytics('resident',rm,null,null,'all');
  perform pg_temp.assert_true((a#>>'{summary,incident_matters}')::int=1,'TEST 1 FAILED: incident alone must be one matter');
  perform pg_temp.assert_true((a#>>'{summary,incident_matters}')::int=1,'TEST 2 FAILED: linked blotter inflated incident matter');
  perform pg_temp.assert_true((a#>>'{summary,complaint_kp_matters}')::int=1,'TEST 3 FAILED: complaint must be one matter');
  perform pg_temp.assert_true((a#>>'{summary,complaint_kp_matters}')::int=1,'TEST 4 FAILED: KP inflated complaint matter');
  perform pg_temp.assert_true((a#>>'{summary,distinct_linked_matters}')::int=2 and jsonb_path_exists(a,'$.contributing_matters[*].related_records[*] ? (@.reference == "CMP-AN-001")'),'TEST 5 FAILED: linked incident/complaint must remain two related matter keys');
  perform pg_temp.assert_true(not jsonb_path_exists(a,'$.contributing_matters[*] ? (@.reference == "CMP-AN-EXTERNAL")'),'TEST 6 FAILED: similar text/name created implicit linkage');

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
  perform pg_temp.assert_true((a#>>'{community_credit_periods,post_enrollment_qualifying_matters}')::int=1 and not jsonb_path_exists(a,'$.historical_review.contributing_matters[*] ? (@.reference == "INC-AN-BOUNDARY")'),'TEST 35 FAILED: enrollment boundary must be post-enrollment');

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
  perform pg_temp.assert_true((select area_label from public.analytics_person_matters('external',(select id from analytics_test_ids where k='external_a')) where reference='CMP-AN-BLANK')='Not recorded','TEST 43 FAILED: blank location was not given a documented fallback');

  -- 44-50 identity grouping and dispute normalization.
  a:=public.barangay_safety_analytics(null,null,null,null,'all');
  perform pg_temp.assert_true(jsonb_path_exists(a,format('$.repeat_people[*] ? (@.person_id == "%s")',rm)::jsonpath),'TEST 44 FAILED: repeat grouping not keyed by kind+UUID');
  perform pg_temp.assert_true((select count(*) from jsonb_array_elements(a->'repeat_people')x where x->>'display_name'='Analytics Test Resident A')=2,'TEST 45 FAILED: same-name resident UUIDs were not kept distinct');
  perform pg_temp.assert_true((select count(*) from public.analytics_person_matters('external',(select id from analytics_test_ids where k='external_a')))>0 and (select count(*) from public.analytics_person_matters('external',(select id from analytics_test_ids where k='external_b')))>0,'TEST 46 FAILED: same-name external UUIDs were not kept distinct');
  perform pg_temp.assert_true((select (x->>'qualifying_matters')::int from jsonb_array_elements(a->'repeat_people')x where x->>'person_id'=rm::text)=2,'TEST 47 FAILED: duplicate roles inflated distinct matters');
  d:=public.repeated_dispute_analytics(null,null,'all');
  perform pg_temp.assert_true(jsonb_path_exists(d,'$[*] ? (@.matter_count == 2)'),'TEST 48 FAILED: A-to-B and B-to-A pair not normalized');
  perform pg_temp.assert_true(jsonb_path_exists(d,'$[*] ? (@.matter_count == 2 && @.matter_references.size() == 2)'),'TEST 49 FAILED: complaint plus KP counted more than once');
  perform pg_temp.assert_true(d::text not like '%CMP-AN-EXTERNAL%' and d::text not like '%CMP-AN-BLANK%','TEST 50 FAILED: same-name people without a repeated UUID-linked pair were merged');

  -- 57-59 active policy and read-only behavior (auth tests are separate).
  a:=public.barangay_safety_analytics(null,null,null,null,'all');
  perform pg_temp.assert_true((a#>>'{community_credit,enrolled_residents}')::int=6,'TEST 57 FAILED: active-policy enrollment distribution');
  perform pg_temp.assert_true(not ((a#>>'{community_credit,enrolled_residents}')::int=7),'TEST 58 FAILED: retired-policy enrollment included');
  perform pg_temp.assert_true((select count(*) from public.community_credit_events)=before_events and (select count(*) from public.community_credit_enrollments)=before_enrollments,'TEST 59 FAILED: analytics RPC wrote data');
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

reset role;
select 'PASS: all 59 migration-062 behavioral contracts passed; transaction will now roll back.' as result;
rollback;
