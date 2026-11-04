-- Migration 066 behavioral acceptance harness.
-- Run ONLY in a disposable, schema-only test database after 001-063, 065 and
-- 066 (064 optional). Everything runs in one transaction and ROLLS BACK.
--
-- Every assertion is recorded in t066_results rather than raised one at a
-- time, so a run reports EVERY failing contract. The final block raises if any
-- failed. 066_build_test_runner.mjs builds a NEGATIVE CONTROL from this file
-- that first restores the 061/062 function bodies (the rollback contingency),
-- so the disclosure assertions can be seen to fail against the old code.
begin;
set local timezone='UTC';

create temp table t066_results(test int primary key,ok boolean not null,label text not null);
create function pg_temp.check(p_test int,p_ok boolean,p_label text)
returns void language plpgsql as $$
begin
  insert into t066_results values(p_test,coalesce(p_ok,false),p_label)
    on conflict(test) do update set ok=t066_results.ok and excluded.ok;
end; $$;

create function pg_temp.set_actor(p_id uuid,p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',coalesce(p_id::text,''),true);
  perform set_config('request.jwt.claims',case when p_id is null then '{}' else
    jsonb_build_object('sub',p_id,'role',p_role)::text end,true);
  execute format('set local role %I',p_role);
end; $$;

-- One statement AS a real caller. The role switch sits OUTSIDE the inner
-- exception block, so a refused call cannot roll the switch back and leave the
-- next probe running as the previous caller (the 062 lesson).
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
  perform set_config('request.jwt.claims','',true);
  perform set_config('request.jwt.claim.sub','',true);
  return jsonb_build_object('state',v_state,'data',v_result);
end; $$;

create temp table t066_ids(k text primary key,id uuid not null);
insert into t066_ids values
 ('sec','f0660000-0000-4000-8000-000000000001'),('pun','f0660000-0000-4000-8000-000000000002'),
 ('tre','f0660000-0000-4000-8000-000000000003'),('kag','f0660000-0000-4000-8000-000000000004'),
 ('kpo','f0660000-0000-4000-8000-000000000005'),('skc','f0660000-0000-4000-8000-000000000006'),
 ('arc','f0660000-0000-4000-8000-000000000007'),('unl','f0660000-0000-4000-8000-000000000008'),
 ('res','f0660000-0000-4000-8000-000000000009'),('nur','f0660000-0000-4000-8000-00000000000a'),
 ('tan','f0660000-0000-4000-8000-00000000000b'),
 ('r_direct','f0660000-0000-4000-8000-000000000101'),('r_linked','f0660000-0000-4000-8000-000000000102'),
 ('r_old','f0660000-0000-4000-8000-000000000103'),('r_new','f0660000-0000-4000-8000-000000000104'),
 ('r_plain','f0660000-0000-4000-8000-000000000105'),
 ('ext_hist','f0660000-0000-4000-8000-000000000201'),('ext_corr','f0660000-0000-4000-8000-000000000202'),
 ('ext_same_name','f0660000-0000-4000-8000-000000000203');

do $precondition$
begin
  if exists(select 1 from public.barangay_officials where archived_at is null
            and position in ('Punong Barangay','Barangay Secretary','Barangay Treasurer')) then
    raise exception 'SETUP PRECONDITION FAILED: a powered position already has an active holder; run only on a disposable schema-only database';
  end if;
  if to_regprocedure('public.person_linked_records(text,uuid,boolean)') is null then
    raise exception 'SETUP PRECONDITION FAILED: migration 066 is not applied';
  end if;
end $precondition$;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',k||'@p066-test.invalid','',now(),'{}','{}',now(),now()
from t066_ids where k in ('sec','pun','tre','kag','kpo','skc','arc','unl','res','nur','tan') on conflict(id) do nothing;
insert into public.profiles(id,full_name,role)
select id,'P066 '||k,case k when 'res' then 'resident' when 'nur' then 'nurse' when 'tan' then 'tanod' else 'official' end
from t066_ids where k in ('sec','pun','tre','kag','kpo','skc','arc','unl','res','nur','tan')
on conflict(id) do update set full_name=excluded.full_name,role=excluded.role;

insert into public.barangay_officials(id,full_name,position,committee,display_order,created_by,archived_at,archived_by)
select ('f0660000-0000-4000-8000-0000000000'||lpad(n::text,2,'0'))::uuid,'P066 '||k,pos,committee,960000+n,
  (select id from t066_ids where k='sec'),case when k='arc' then now() end,case when k='arc' then (select id from t066_ids where k='sec') end
from (values(11,'sec','Barangay Secretary',null),(12,'pun','Punong Barangay',null),(13,'tre','Barangay Treasurer',null),
            (14,'kag','Kagawad','Health'),(15,'kpo','Kagawad','Peace and Order and Appropriation'),(16,'skc','SK Chairperson',null),
            (17,'arc','Kagawad',null))v(n,k,pos,committee);
insert into public.official_account_links(official_id,profile_id,linked_by)
select ('f0660000-0000-4000-8000-0000000000'||lpad(n::text,2,'0'))::uuid,(select id from t066_ids where k=v.k),'migration-066 behavioral test'
from (values(11,'sec'),(12,'pun'),(13,'tre'),(14,'kag'),(15,'kpo'),(16,'skc'),(17,'arc'))v(n,k);

insert into public.barangay_residents(id,first_name,last_name,purok,resident_status)
select id,'P066',initcap(replace(k,'_',' ')),'P066 Area','active' from t066_ids where k like 'r\_%';
-- ext_same_name carries the SAME name as r_linked's verified external identity
-- and is never linked: it must never reach r_linked's history (no name matching).
insert into public.external_persons(id,first_name,last_name,recorded_barangay,created_by,updated_by)
select id,'P066','Historical Name','Other Barangay',(select id from t066_ids where k='sec'),(select id from t066_ids where k='sec')
from t066_ids where k in ('ext_hist','ext_same_name');
insert into public.external_persons(id,first_name,last_name,recorded_barangay,created_by,updated_by)
values((select id from t066_ids where k='ext_corr'),'P066','Corrected Identity','Other Barangay',(select id from t066_ids where k='sec'),(select id from t066_ids where k='sec'));
insert into public.external_person_resident_links(external_person_id,resident_id,verified_by,note) values
 ((select id from t066_ids where k='ext_hist'),(select id from t066_ids where k='r_linked'),(select id from t066_ids where k='sec'),'P066 verified link'),
 ((select id from t066_ids where k='ext_corr'),(select id from t066_ids where k='r_old'),(select id from t066_ids where k='sec'),'P066 link to be corrected');

-- Incidents. Friday 21:30 Manila is 13:30 UTC.
create temp table t066_inc(k text primary key,id uuid not null,reference text);
insert into t066_inc values
 ('i1',gen_random_uuid(),null),('i2',gen_random_uuid(),null),('i4',gen_random_uuid(),null),('i5',gen_random_uuid(),null),
 ('i6',gen_random_uuid(),null),('i7',gen_random_uuid(),null),('i8',gen_random_uuid(),null),('i9',gen_random_uuid(),null);
insert into public.incidents(id,reference,incident_type,occurred_at,narrative,location_text,area_note,source,status,recorded_by)
select i.id,'INC-P066-'||i.k,v.t,now()-v.age,'P066 synthetic incident',v.loc,v.area,'official_report',v.status,(select id from t066_ids where k='sec')
from t066_inc i join (values
  ('i1','disturbance',interval '10 days','P066 Text A','P066 Area Note A','resolved'),
  ('i2','threat',interval '11 days','P066 Text Only B','   ','recorded'),
  ('i4','other',interval '400 days','P066 Historical Place',null,'closed'),
  ('i5','disturbance',interval '12 days','P066 Shared Place',null,'recorded'),
  ('i6','other',interval '13 days','P066 Corrected Place',null,'recorded'),
  ('i7','threat',interval '14 days','P066 Same Name Place',null,'recorded'),
  ('i8','disturbance',interval '15 days','P066 Other KP Place',null,'referred'),
  ('i9','other',interval '16 days','P066 Linked Direct Place',null,'recorded'))v(k,t,age,loc,area,status) on v.k=i.k;
update t066_inc f set reference=i.reference from public.incidents i where i.id=f.id;

insert into public.incident_parties(incident_id,resident_id,external_person_id,role,name_snapshot,created_by,updated_by)
select (select id from t066_inc where k=v.i),(select id from t066_ids where k=v.r),(select id from t066_ids where k=v.e),v.role,'P066 snapshot',
  (select id from t066_ids where k='sec'),(select id from t066_ids where k='sec')
from (values
  ('i1','r_direct',null,'respondent'),
  ('i2','r_direct',null,'victim'),('i2','r_direct',null,'witness'),          -- two roles, one record
  ('i8','r_direct',null,'witness'),
  ('i4',null,'ext_hist','respondent'),                                        -- historical external identity
  ('i5','r_linked',null,'victim'),('i5',null,'ext_hist','victim'),           -- same person, both identities
  ('i9','r_linked',null,'reporting_party'),
  ('i6',null,'ext_corr','respondent'),                                        -- follows the corrected link
  ('i7',null,'ext_same_name','respondent'))v(i,r,e,role);                    -- same name, never linked
insert into public.blotter_entries(entry_reference,incident_id,summary,recorded_by)
select 'BLT-P066-1',(select id from t066_inc where k='i1'),'P066 blotter',(select id from t066_ids where k='sec');

-- Complaints. C1's category and location are UNIQUE MARKERS, so a non-disclosure
-- assertion cannot pass merely because it searched for a value never stored.
create temp table t066_cmp(k text primary key,id uuid not null,reference text);
insert into t066_cmp values('c1','f0660000-0000-4000-8000-000000000401',null),('c2','f0660000-0000-4000-8000-000000000402',null),
                           ('c3','f0660000-0000-4000-8000-000000000403',null);
insert into public.complaints(id,reference,intake_channel,category,narrative,status,location_note,encoded_by,created_at)
select c.id,'CMP-P066-'||c.k,'walk_in',v.cat,'P066 synthetic complaint','received',v.loc,(select id from t066_ids where k='sec'),now()-v.age
from t066_cmp c join (values('c1','family_dispute','P066-SECRET-COMPLAINT-LOCATION',interval '9 days'),
                             ('c2','boundary_dispute','P066 C2 Place',interval '8 days'),
                             ('c3','unpaid_debt','P066 C3 Place',interval '420 days'))v(k,cat,loc,age) on v.k=c.k;
update t066_cmp f set reference=c.reference from public.complaints c where c.id=f.id;
insert into public.complaint_parties(complaint_id,party_role,full_name_snapshot,resident_id,external_person_id) values
 ((select id from t066_cmp where k='c1'),'respondent','P066 snapshot',(select id from t066_ids where k='r_direct'),null),
 ((select id from t066_cmp where k='c2'),'complainant','P066 snapshot',(select id from t066_ids where k='r_plain'),null),
 ((select id from t066_cmp where k='c3'),'complainant','P066 snapshot',null,(select id from t066_ids where k='ext_hist'));
insert into public.complaint_screenings(id,complaint_id,checklist_version,answers,prepared_by,confirmed_outcome,confirmed_by,confirmed_at)
select ('f0660000-0000-4000-8000-00000000041'||n)::uuid,(select id from t066_cmp where k=c),'v1','{}',(select id from t066_ids where k='sec'),
  'proceed_to_kp_process',(select id from t066_ids where k='pun'),now()
from (values(1,'c1'),(2,'c2'))v(n,c);
insert into public.kp_cases(id,reference,complaint_id,screening_id,status,opened_by)
select ('f0660000-0000-4000-8000-00000000042'||n)::uuid,'KP-P066-'||n,(select id from t066_cmp where k=c),
  ('f0660000-0000-4000-8000-00000000041'||n)::uuid,'open',(select id from t066_ids where k='pun')
from (values(1,'c1'),(2,'c2'))v(n,c);
-- trg_stamp_kp_case_reference replaces any supplied KP reference; capture the real ones.
create temp table t066_kp as select k.id,k.reference from public.kp_cases k
 where k.id in ('f0660000-0000-4000-8000-000000000421','f0660000-0000-4000-8000-000000000422');
-- i1 -> C1 (r_direct is a party to both: ONE matter). i8 -> C2 (r_direct is
-- not a party to C2: i8 stays its own matter).
insert into public.incident_case_links(incident_id,case_id,linked_by) values
 ((select id from t066_inc where k='i1'),'f0660000-0000-4000-8000-000000000421',(select id from t066_ids where k='sec')),
 ((select id from t066_inc where k='i8'),'f0660000-0000-4000-8000-000000000422',(select id from t066_ids where k='sec'));

do $setup_check$
begin
  if exists(select 1 from t066_inc where coalesce(btrim(reference),'')='') or exists(select 1 from t066_cmp where coalesce(btrim(reference),'')='')
     or (select count(distinct reference) from t066_inc)<>8 or (select count(distinct reference) from t066_cmp)<>3
     or (select count(distinct reference) from t066_kp where coalesce(btrim(reference),'')<>'')<>2
  then raise exception 'SETUP FAILED: a fixture has no unique database-generated reference'; end if;
end $setup_check$;

reset role;

do $tests$
declare
  sec uuid:=(select id from t066_ids where k='sec'); pun uuid:=(select id from t066_ids where k='pun');
  tre uuid:=(select id from t066_ids where k='tre'); kag uuid:=(select id from t066_ids where k='kag');
  kpo uuid:=(select id from t066_ids where k='kpo'); skc uuid:=(select id from t066_ids where k='skc');
  arc uuid:=(select id from t066_ids where k='arc'); unl uuid:=(select id from t066_ids where k='unl');
  res uuid:=(select id from t066_ids where k='res'); nur uuid:=(select id from t066_ids where k='nur');
  tan uuid:=(select id from t066_ids where k='tan');
  rd uuid:=(select id from t066_ids where k='r_direct'); rl uuid:=(select id from t066_ids where k='r_linked');
  r_old uuid:=(select id from t066_ids where k='r_old'); r_new uuid:=(select id from t066_ids where k='r_new');
  ext_hist uuid:=(select id from t066_ids where k='ext_hist'); ext_corr uuid:=(select id from t066_ids where k='ext_corr');
  ref_c1 text:=(select reference from t066_cmp where k='c1'); ref_c2 text:=(select reference from t066_cmp where k='c2');
  ref_c3 text:=(select reference from t066_cmp where k='c3');
  ref_i7 text:=(select reference from t066_inc where k='i7');
  ref_kp1 text:=(select reference from t066_kp where id='f0660000-0000-4000-8000-000000000421');
  ref_kp2 text:=(select reference from t066_kp where id='f0660000-0000-4000-8000-000000000422');
  windows text[]:=array['all','last_30_days','last_90_days','last_12_months','previous_12_months','custom'];
  ordinary uuid[]; actor uuid; w text; h jsonb; a jsonb; r jsonb; ok boolean; label text; who text;
  parties_before text; links_before text; history_before bigint; rows_before text;
  q_h_rd text; q_a_rd text;
begin
  ordinary:=array[tre,kag,kpo,skc];
  q_h_rd:=format('select public.person_history(%L,%L::uuid)','resident',rd);
  q_a_rd:=format('select public.person_analytics(%L,%L::uuid,null,null,%L)','resident',rd,'all');
  parties_before:=(select md5(string_agg(to_jsonb(p)::text,'|' order by p.id)) from public.incident_parties p);
  rows_before:=(select concat_ws('|',(select count(*) from public.complaints),(select count(*) from public.complaint_parties),
    (select count(*) from public.incidents),(select count(*) from public.incident_parties),
    (select count(*) from public.community_credit_events),(select count(*) from public.community_credit_enrollments)));

  -- ── 1-6 records administrators: full complaint detail, correct counts ───
  foreach actor in array array[sec,pun] loop
    label:=case actor when sec then 'Secretary' else 'Punong Barangay' end;
    h:=(pg_temp.as_actor(actor,'authenticated',q_h_rd))->'data';
    perform pg_temp.check(1,h is not null and jsonb_path_exists(h,'$.complaints[*] ? (@.reference == $r && @.category == "family_dispute")',jsonb_build_object('r',ref_c1))
      and (h->>'complaints_restricted')::boolean=false,format('%s reads complaint C1 with its category',label));
    perform pg_temp.check(2,jsonb_path_exists(h,'$.incidents[*] ? (@.complaint_reference == $r && @.kp_reference == $k)',jsonb_build_object('r',ref_c1,'k',ref_kp1)),
      format('%s reads the KP and complaint reference on incident i1',label));
    perform pg_temp.check(3,(h#>>'{counts,incident_records}')::int=3 and (h#>>'{counts,complaint_records}')::int=1
      and (h#>>'{counts,distinct_matters}')::int=3,format('%s counts: 3 incidents, 1 complaint, 3 distinct matters (i1+C1 one matter; i8 separate)',label));
    a:=(pg_temp.as_actor(actor,'authenticated',q_a_rd))->'data';
    perform pg_temp.check(4,(a#>>'{summary,incident_records}')::int=3 and (a#>>'{summary,complaint_records}')::int=1
      and (a#>>'{summary,distinct_matters}')::int=3 and (a#>>'{summary,distinct_linked_matters}')::int=4
      and (a#>>'{summary,complaint_kp_matters}')::int=1,format('%s analytics: record counts keep their 062 meaning; distinct_matters de-duplicates',label));
    perform pg_temp.check(5,strpos(a::text,'P066-SECRET-COMPLAINT-LOCATION')>0 and (a#>>'{coverage,complaint_records_included}')::boolean,
      format('%s sees the complaint location (positive control for 9-12)',label));
    perform pg_temp.check(6,jsonb_array_length(h->'timeline')=4,format('%s timeline: 3 incidents once each + 1 complaint',label));
  end loop;

  -- ── 7-14 every other active official: complaints are not returned at all ─
  foreach actor in array ordinary loop
    label:=case actor when tre then 'Treasurer' when kag then 'Kagawad' when kpo then 'peace-and-order Kagawad' else 'SK Chairperson' end;
    h:=(pg_temp.as_actor(actor,'authenticated',q_h_rd))->'data';
    perform pg_temp.check(7,h is not null and jsonb_array_length(h->'complaints')=0 and (h->>'complaints_restricted')::boolean,
      format('%s receives no complaint record and an explicit restricted flag',label));
    perform pg_temp.check(8,not jsonb_path_exists(h,'$.incidents[*] ? (@.kp_reference != null || @.complaint_reference != null)'),
      format('%s receives no KP or complaint reference on incident rows',label));
    perform pg_temp.check(9,strpos(h::text,ref_c1)=0 and strpos(h::text,ref_c2)=0 and strpos(h::text,'family_dispute')=0
      and strpos(h::text,ref_kp1)=0 and strpos(h::text,ref_kp2)=0 and strpos(h::text,'P066-SECRET-COMPLAINT-LOCATION')=0,
      format('%s: no complaint reference, category, KP reference or location anywhere in person_history',label));
    perform pg_temp.check(10,(h#>>'{counts,complaint_records}') is null and (h#>>'{counts,incident_records}')::int=3
      and (h#>>'{counts,distinct_matters}')::int=3 and not jsonb_path_exists(h,'$.timeline[*] ? (@.kind == "complaint")')
      and jsonb_array_length(h->'timeline')=3,
      format('%s: counts and timeline cover incidents only, so no difference reveals a complaint',label));
    foreach w in array windows loop
      a:=(pg_temp.as_actor(actor,'authenticated',format('select public.person_analytics(%L,%L::uuid,%L::date,%L::date,%L)','resident',rd,
        case when w='custom' then '2000-01-01' end,case when w='custom' then (now() at time zone 'Asia/Manila')::date::text end,w)))->'data';
      perform pg_temp.check(11,a is not null and strpos(a::text,ref_c1)=0 and strpos(a::text,'family_dispute')=0
        and strpos(a::text,ref_kp1)=0 and strpos(a::text,ref_kp2)=0 and strpos(a::text,'P066-SECRET-COMPLAINT-LOCATION')=0
        and not jsonb_path_exists(a,'$.contributing_matters[*] ? (@.kind == "complaint")')
        and not jsonb_path_exists(a,'$.contributing_matters[*].related_records[*]'),
        format('%s: no complaint material in person_analytics (window %s)',label,w));
    end loop;
    a:=(pg_temp.as_actor(actor,'authenticated',q_a_rd))->'data';
    perform pg_temp.check(12,(a#>>'{summary,complaint_kp_matters}') is null and (a#>>'{summary,complaint_records}') is null
      and (a#>>'{summary,incident_records}')::int=3 and (a#>>'{summary,distinct_matters}')::int=3
      and not (a#>>'{coverage,complaint_records_included}')::boolean,
      format('%s: complaint counts are NULL, not 0, and distinct matters cover incidents only',label));
    -- External-person view too: C3 belongs to ext_hist directly.
    r:=pg_temp.as_actor(actor,'authenticated',format('select public.person_history(%L,%L::uuid)','external',ext_hist));
    perform pg_temp.check(13,r->>'state'='00000' and strpos((r->'data')::text,ref_c3)=0 and jsonb_array_length(r#>'{data,complaints}')=0,
      format('%s: an external person''s complaints are withheld too',label));
    -- Direct table reads cannot route around the functions.
    perform pg_temp.check(14,(pg_temp.as_actor(actor,'authenticated','select to_jsonb(count(*)) from public.complaint_parties'))->>'state'='42501'
      and (pg_temp.as_actor(actor,'authenticated','select to_jsonb(count(*)) from public.incident_case_links'))->>'state'='42501'
      and (pg_temp.as_actor(actor,'authenticated','select to_jsonb(count(*)) from public.external_person_resident_links'))->>'state'='42501',
      format('%s cannot read complaint parties, KP links or identity links directly',label));
  end loop;

  -- ── 15-16 callers refused outright, and private helpers ───────────────
  foreach who in array array['arc','unl','res','nur','tan','anon'] loop
    actor:=case who when 'arc' then arc when 'unl' then unl when 'res' then res when 'nur' then nur when 'tan' then tan end;
    perform pg_temp.check(15,(pg_temp.as_actor(actor,case when who='anon' then 'anon' else 'authenticated' end,q_h_rd))->>'state'='42501'
      and (pg_temp.as_actor(actor,case when who='anon' then 'anon' else 'authenticated' end,q_a_rd))->>'state'='42501',
      format('%s is refused person_history and person_analytics with 42501',who));
  end loop;
  foreach actor in array array[sec,pun,kag,res] loop
    perform pg_temp.check(16,(pg_temp.as_actor(actor,'authenticated',format('select to_jsonb(count(*)) from public.person_linked_records(%L,%L::uuid,true)','resident',rd)))->>'state'='42501'
      and (pg_temp.as_actor(actor,'authenticated',format('select to_jsonb(count(*)) from public.person_history_identities(%L,%L::uuid)','resident',rd)))->>'state'='42501',
      'the two 066 helpers are not callable by any client, administrators included');
  end loop;
  perform pg_temp.check(16,(pg_temp.as_actor(null,'anon',format('select to_jsonb(count(*)) from public.person_linked_records(%L,%L::uuid,true)','resident',rd)))->>'state'='42501',
    'anon cannot call the helper');

  -- ── 17-18 grants and function properties ──────────────────────────────
  perform pg_temp.check(17,
    has_function_privilege('authenticated','public.person_history(text,uuid)','execute')
    and has_function_privilege('authenticated','public.person_analytics(text,uuid,date,date,text)','execute')
    and not has_function_privilege('anon','public.person_history(text,uuid)','execute')
    and not has_function_privilege('anon','public.person_analytics(text,uuid,date,date,text)','execute')
    and not exists(select 1 from pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
                    where p.oid in ('public.person_history(text,uuid)'::regprocedure,'public.person_analytics(text,uuid,date,date,text)'::regprocedure,
                                    'public.person_linked_records(text,uuid,boolean)'::regprocedure,'public.person_history_identities(text,uuid)'::regprocedure)
                      and x.grantee=0)
    and not has_function_privilege('authenticated','public.person_linked_records(text,uuid,boolean)','execute')
    and not has_function_privilege('service_role','public.person_linked_records(text,uuid,boolean)','execute'),
    'EXECUTE: authenticated on the two RPCs only; no PUBLIC; helpers granted to no client');
  perform pg_temp.check(18,(select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_proc p
     where p.oid in ('public.person_history(text,uuid)'::regprocedure,'public.person_analytics(text,uuid,date,date,text)'::regprocedure,
                     'public.person_linked_records(text,uuid,boolean)'::regprocedure,'public.person_history_identities(text,uuid)'::regprocedure)),
    'all four are SECURITY DEFINER with an empty search_path');

  -- ── 19-23 verified identity links ─────────────────────────────────────
  h:=(pg_temp.as_actor(sec,'authenticated',format('select public.person_history(%L,%L::uuid)','resident',rl)))->'data';
  perform pg_temp.check(19,jsonb_path_exists(h,'$.incidents[*] ? (@.reference == $r && @.via_identity_kind == "external")',jsonb_build_object('r',(select reference from t066_inc where k='i4')))
    and jsonb_path_exists(h,'$.identity.verified_external_identities[*] ? (@.id == $e)',jsonb_build_object('e',ext_hist)),
    'a verified external identity''s historical incident reaches the resident''s history');
  perform pg_temp.check(20,strpos(h::text,ref_i7)=0 and not jsonb_path_exists(h,'$.identity.verified_external_identities[*] ? (@.id == $e)',
      jsonb_build_object('e',(select id from t066_ids where k='ext_same_name'))),
    'a same-name external person who is NOT linked never reaches the history (no name matching)');
  perform pg_temp.check(21,(h#>>'{counts,incident_records}')::int=3 and (h#>>'{counts,distinct_matters}')::int=4
      and (select count(*) from jsonb_array_elements(h->'timeline') t where t->>'kind'='incident')=3,
    'i5 (resident AND external identity on one incident) counts once; i4, i5, i9 = 3 incidents; + C3 = 4 matters');
  perform pg_temp.check(22,jsonb_path_exists(h,'$.complaints[*] ? (@.reference == $r)',jsonb_build_object('r',ref_c3)),
    'an administrator sees the verified external identity''s complaint');
  h:=(pg_temp.as_actor(sec,'authenticated',format('select public.person_history(%L,%L::uuid)','external',ext_hist)))->'data';
  perform pg_temp.check(23,(h#>>'{counts,incident_records}')::int=2 and strpos(h::text,(select reference from t066_inc where k='i9'))=0,
    'an external person''s own history is unchanged: only its own records, not the resident''s direct ones');

  -- ── 24-27 identity correction ─────────────────────────────────────────
  links_before:=(select md5(string_agg(to_jsonb(l)::text,'|' order by l.external_person_id)) from public.external_person_resident_links l);
  history_before:=(select count(*) from public.external_person_resident_link_history);
  perform pg_temp.check(24,strpos(((pg_temp.as_actor(sec,'authenticated',format('select public.person_history(%L,%L::uuid)','resident',r_old)))->'data')::text,
      (select reference from t066_inc where k='i6'))>0,'before correction the record follows the old link');
  perform pg_temp.check(25,(pg_temp.as_actor(kag,'authenticated',format('select to_jsonb(1) from (select public.correct_external_person_resident_link(%L::uuid,%L::uuid,%L)) s',
      ext_corr,r_new,'P066 kagawad attempt')))->>'state'='42501','an ordinary official cannot correct an identity link');
  r:=pg_temp.as_actor(sec,'authenticated',format('select to_jsonb(1) from (select public.correct_external_person_resident_link(%L::uuid,%L::uuid,%L)) s',
      ext_corr,r_new,'P066 harness correction'));
  perform pg_temp.check(26,r->>'state'='00000'
      and strpos(((pg_temp.as_actor(sec,'authenticated',format('select public.person_history(%L,%L::uuid)','resident',r_new)))->'data')::text,(select reference from t066_inc where k='i6'))>0
      and strpos(((pg_temp.as_actor(sec,'authenticated',format('select public.person_history(%L,%L::uuid)','resident',r_old)))->'data')::text,(select reference from t066_inc where k='i6'))=0,
    'after correction the record follows the corrected link and leaves the old resident');
  perform pg_temp.check(27,(select count(*) from public.external_person_resident_link_history)=history_before+1
      and exists(select 1 from public.external_person_resident_link_history where external_person_id=ext_corr and previous_resident_id=r_old and new_resident_id=r_new),
    'the correction audit trail gained exactly one row');

  -- ── 28-29 incident location ───────────────────────────────────────────
  h:=(pg_temp.as_actor(kag,'authenticated',q_h_rd))->'data';
  perform pg_temp.check(28,jsonb_path_exists(h,'$.incidents[*] ? (@.reference == $r && @.location == "P066 Area Note A" && @.location_source == "area_note" && @.location_text == "P066 Text A" && @.area_note == "P066 Area Note A")',
      jsonb_build_object('r',(select reference from t066_inc where k='i1'))),
    'an area note is the location, labelled as such, with both stored fields returned unchanged');
  perform pg_temp.check(29,jsonb_path_exists(h,'$.incidents[*] ? (@.reference == $r && @.location == "P066 Text Only B" && @.location_source == "location_text")',
      jsonb_build_object('r',(select reference from t066_inc where k='i2'))),
    'a blank area note falls back to the location text, labelled as such');

  -- ── 30-32 neutral analytics, no Community Credit ──────────────────────
  a:=(pg_temp.as_actor(sec,'authenticated',q_a_rd))->'data';
  perform pg_temp.check(30,not (a ? 'historical_review') and not (a ? 'community_credit_periods')
      and strpos(a::text,'requires_review')=0 and strpos(a::text,'threshold')=0 and strpos(lower(a::text),'repeated')=0
      and strpos(lower(a::text),'risk')=0 and strpos(lower(a::text),'danger')=0,
    'no review flag, threshold, credit-period split or judgment wording');
  perform pg_temp.check(31,jsonb_array_length(a->'indicators')=2 and a#>>'{indicators,0,key}'='respondent_or_subject_records_last_12_months'
      and a#>>'{indicators,1,key}'='period_change','indicators keep two positions with neutral keys');
  perform pg_temp.check(32,(select concat_ws('|',(select count(*) from public.complaints),(select count(*) from public.complaint_parties),
      (select count(*) from public.incidents),(select count(*) from public.incident_parties),
      (select count(*) from public.community_credit_events),(select count(*) from public.community_credit_enrollments)))=rows_before
      and (select md5(string_agg(to_jsonb(p)::text,'|' order by p.id)) from public.incident_parties p)=parties_before
      and not exists(select 1 from pg_proc where oid in ('public.person_history(text,uuid)'::regprocedure,'public.person_analytics(text,uuid,date,date,text)'::regprocedure)
                      and prosrc ilike '%community_credit%'),
    'reads changed no record, party row, credit event or enrollment; neither RPC reads Community Credit');

  -- ── 33 deduplication is explicit only ─────────────────────────────────
  a:=(pg_temp.as_actor(sec,'authenticated',q_a_rd))->'data';
  perform pg_temp.check(33,jsonb_path_exists(a,'$.contributing_matters[*] ? (@.kind == "incident" && @.reference == $r && @.distinct_matter_key like_regex "^incident:")',
      jsonb_build_object('r',(select reference from t066_inc where k='i8')))
    and jsonb_path_exists(a,'$.contributing_matters[*] ? (@.kind == "incident" && @.reference == $r && @.distinct_matter_key like_regex "^complaint:")',
      jsonb_build_object('r',(select reference from t066_inc where k='i1'))),
    'i1 merges with C1 (both his, explicit KP link); i8 does not merge with C2 (not his)');

  -- ── 34 replacement for 062 TESTS 9-12, 22-25 and 27 ───────────────────
  -- The descriptive comparison still counts only respondent/subject records
  -- (victim, witness and reporting-party roles never contribute), its
  -- contributing list matches its count, and for an ordinary official it
  -- covers incidents only. r_direct: i1 respondent + C1 respondent in the last
  -- 12 months; i2 (victim, witness) and i8 (witness) excluded.
  a:=(pg_temp.as_actor(sec,'authenticated',q_a_rd))->'data';
  h:=(pg_temp.as_actor(kag,'authenticated',q_a_rd))->'data';
  perform pg_temp.check(34,(a#>>'{comparison,current_period_qualifying_matters}')::int=2
      and (a#>>'{indicators,0,matter_count}')::int=jsonb_array_length(a#>'{indicators,0,contributing_matters}')
      and not jsonb_path_exists(a,'$.indicators[0].contributing_matters[*] ? (@.role != "respondent" && @.role != "subject")')
      and (h#>>'{comparison,current_period_qualifying_matters}')::int=1
      and not jsonb_path_exists(h,'$.indicators[*].contributing_matters[*] ? (@.kind == "complaint")'),
    'comparison counts respondent/subject records only; complaints only for records staff');
end;
$tests$;

reset role;
do $report$
declare failed text;
begin
  select string_agg(format('TEST %s FAILED: %s',test,label),E'\n' order by test) into failed from t066_results where not ok;
  if current_setting('t066.mode',true)='negctrl' then
    raise notice 'NEGATIVE CONTROL failing tests: %',coalesce((select string_agg(test::text,',' order by test) from t066_results where not ok),'none');
  elsif failed is not null then
    raise exception E'%',failed;
  else
    raise notice 'PASS: all % migration-066 contracts passed; transaction will now roll back.',(select count(*) from t066_results);
  end if;
end $report$;
rollback;
