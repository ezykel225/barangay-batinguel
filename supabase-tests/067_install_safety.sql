-- Migration 067 INSTALL-SAFETY check. Proves that INSTALLING 067 changes no
-- existing Community Credit row, no score and no active policy, and creates
-- no V2 policy, enrollment, award or transition.
--
-- Run ONLY in a disposable, schema-only test database that has 001-066 (064
-- optional) and does NOT have 067. Do not run this file directly: the
-- APPLY marker line below is replaced with 067's body by 067_build_test_runner.mjs
-- (output 067-install.sql). Everything runs in one transaction and ROLLS BACK.
begin;
set local timezone='UTC';

do $precondition$
begin
  if to_regprocedure('public.award_community_credit_participation(uuid,uuid,uuid)') is not null then
    raise exception 'SETUP PRECONDITION FAILED: 067 is already applied; this check must run before it';
  end if;
  if exists(select 1 from public.community_credit_policies) or exists(select 1 from public.barangay_officials where archived_at is null
      and position in ('Punong Barangay','Barangay Secretary','Barangay Treasurer')) then
    raise exception 'SETUP PRECONDITION FAILED: run only on a disposable schema-only database';
  end if;
end $precondition$;

create function pg_temp.as_sec(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub','f0671000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims','{"sub":"f0671000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  perform set_config('request.jwt.claims','',true); perform set_config('request.jwt.claim.sub','',true);
  return v;
end; $$;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('f0671000-0000-4000-8000-000000000001','authenticated','authenticated','sec@p067i-test.invalid','',now(),'{}','{}',now(),now());
insert into public.profiles(id,full_name,role) values('f0671000-0000-4000-8000-000000000001','P067I sec','official');
insert into public.barangay_officials(id,full_name,position,display_order,created_by)
values('f0671000-0000-4000-8000-000000000011','P067I sec','Barangay Secretary',971011,'f0671000-0000-4000-8000-000000000001');
insert into public.official_account_links(official_id,profile_id,linked_by)
values('f0671000-0000-4000-8000-000000000011','f0671000-0000-4000-8000-000000000001','migration-067 install test');
insert into public.barangay_residents(id,first_name,last_name,purok,resident_status)
select ('f0671000-0000-4000-8000-0000000001'||lpad(n::text,2,'0'))::uuid,'P067I','R'||n,'P067I Area',case when n=4 then 'inactive' else 'active' end
from generate_series(1,4) n;

-- Two V1 policies through the V1 functions: P1 used then retired, P2 active.
create temp table t067i(k text primary key,id uuid);
do $fixtures$
declare p1 uuid; p2 uuid; pos uuid; neg uuid; pos2 uuid; sec uuid:='f0671000-0000-4000-8000-000000000001';
begin
  p1:=(pg_temp.as_sec('select to_jsonb(public.save_community_credit_policy(null,''P067I one'','''',100,0,100))')#>>'{}')::uuid;
  perform pg_temp.as_sec(format('select public.activate_community_credit_policy(%L)',p1));
  pos:=(pg_temp.as_sec(format('select to_jsonb(public.save_community_credit_rule(null,%L,''I_POS'',''pos'','''',''positive'',''community_activity'',5,false))',p1))#>>'{}')::uuid;
  neg:=(pg_temp.as_sec(format('select to_jsonb(public.save_community_credit_rule(null,%L,''I_NEG'',''neg'','''',''negative'',''incident_outcome'',-20,false))',p1))#>>'{}')::uuid;
  perform pg_temp.as_sec(format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',pos));
  perform pg_temp.as_sec(format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',neg));
  insert into public.community_credit_events(resident_id,policy_id,rule_id,event_kind,rule_code_snapshot,rule_title_snapshot,points_delta_snapshot,source_type,verified_by,verified_at)
  select r,p1,x,'positive','-','-',1,'community_activity',sec,now() from (values
    ('f0671000-0000-4000-8000-000000000101'::uuid,pos),('f0671000-0000-4000-8000-000000000101'::uuid,neg),('f0671000-0000-4000-8000-000000000102'::uuid,neg)) v(r,x);
  perform pg_temp.as_sec(format('select to_jsonb(public.retire_community_credit_policy(%L))',p1));
  p2:=(pg_temp.as_sec('select to_jsonb(public.save_community_credit_policy(null,''P067I two'','''',100,0,100))')#>>'{}')::uuid;
  perform pg_temp.as_sec(format('select public.activate_community_credit_policy(%L)',p2));
  pos2:=(pg_temp.as_sec(format('select to_jsonb(public.save_community_credit_rule(null,%L,''I_POS2'',''pos'','''',''positive'',''community_activity'',5,false))',p2))#>>'{}')::uuid;
  perform pg_temp.as_sec(format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',pos2));
  neg:=(pg_temp.as_sec(format('select to_jsonb(public.save_community_credit_rule(null,%L,''I_NEG2'',''neg'','''',''negative'',''kp_outcome'',-15,false))',p2))#>>'{}')::uuid;
  perform pg_temp.as_sec(format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',neg));
  insert into public.community_credit_events(resident_id,policy_id,rule_id,event_kind,rule_code_snapshot,rule_title_snapshot,points_delta_snapshot,source_type,verified_by,verified_at)
  values('f0671000-0000-4000-8000-000000000103',p2,pos2,'positive','-','-',1,'community_activity',sec,now()),
        ('f0671000-0000-4000-8000-000000000101',p2,neg,'negative','-','-',-1,'kp_outcome',sec,now());
  insert into t067i values('p1',p1),('p2',p2);
end $fixtures$;

create temp table t067i_before as
  select 'policy' kind,id,to_jsonb(p) row from public.community_credit_policies p
  union all select 'rule',id,to_jsonb(r) from public.community_credit_rules r
  union all select 'enrollment',id,to_jsonb(e) from public.community_credit_enrollments e
  union all select 'event',id,to_jsonb(v) from public.community_credit_events v;
create temp table t067i_profile_before as
  select r.id,pg_temp.as_sec(format('select public.community_credit_profile(%L)',r.id)) profile
  from public.barangay_residents r where r.first_name='P067I';
create temp table t067i_counts as select (select count(*) from public.activity_log) activity_log_rows;

-- @@APPLY_067@@

do $check$
declare v_bad int; v_prof int; v_new int; v_active uuid;
begin
  select count(*) into v_bad from (
    select b.kind,b.id from t067i_before b left join (
      select 'policy' kind,id,to_jsonb(p)-array['policy_model','prepared_by','approved_by','approved_at'] row from public.community_credit_policies p
      union all select 'rule',id,to_jsonb(r)-array['annual_points_cap','evidence_requirement','prepared_by','approved_by','approved_at'] from public.community_credit_rules r
      union all select 'enrollment',id,to_jsonb(e) from public.community_credit_enrollments e
      union all select 'event',id,to_jsonb(v)-array['participation_activity_id','participation_resident_id','reason','reaward_of_event_id','request_id'] from public.community_credit_events v
    ) a on a.kind=b.kind and a.id=b.id where a.row is distinct from b.row) x;
  if v_bad<>0 then raise exception 'INSTALL CHECK FAILED: % existing rows changed',v_bad; end if;
  if (select count(*) from t067i_before)<>(select count(*) from public.community_credit_policies)+(select count(*) from public.community_credit_rules)
      +(select count(*) from public.community_credit_enrollments)+(select count(*) from public.community_credit_events) then
    raise exception 'INSTALL CHECK FAILED: rows were added or removed'; end if;
  if exists(select 1 from public.community_credit_policies where policy_model<>'legacy_v1' or prepared_by is not null or approved_by is not null) then
    raise exception 'INSTALL CHECK FAILED: a policy is not plain legacy_v1'; end if;
  select id into v_active from public.community_credit_policies where status='active';
  if v_active is distinct from (select id from t067i where k='p2') then raise exception 'INSTALL CHECK FAILED: the active policy changed'; end if;
  select (select count(*) from public.community_credit_activities)+(select count(*) from public.community_credit_participations)
    +(select count(*) from public.community_credit_transitions)+(select count(*) from public.community_credit_correction_requests)
    +(select count(*) from public.community_credit_requests)+(select count(*) from public.community_credit_cap_locks) into v_new;
  if v_new<>0 then raise exception 'INSTALL CHECK FAILED: % rows in the new tables',v_new; end if;
  select count(*) into v_prof from t067i_profile_before b
    where (pg_temp.as_sec(format('select public.community_credit_profile(%L)',b.id))-array['status','policy_model','has_previous_policies','gauge'])
      is distinct from b.profile
       or (pg_temp.as_sec(format('select public.community_credit_profile(%L)',b.id))->>'current_score') is distinct from (b.profile->>'current_score');
  if v_prof<>0 then raise exception 'INSTALL CHECK FAILED: % profiles changed beyond the added keys',v_prof; end if;
  if (select count(*) from public.activity_log)<>(select activity_log_rows from t067i_counts) then raise exception 'INSTALL CHECK FAILED: installing wrote audit rows'; end if;
  raise notice 'INSTALL PASS: % existing rows byte-identical, % profiles identical apart from added keys, active policy unchanged, no V2 row created; scores: %',
    (select count(*) from t067i_before),(select count(*) from t067i_profile_before),
    (select string_agg(coalesce(profile->>'current_score','n/a'),',' order by id) from t067i_profile_before);
end $check$;
rollback;
