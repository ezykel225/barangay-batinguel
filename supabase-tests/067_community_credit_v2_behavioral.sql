-- Migration 067 behavioral acceptance harness.
-- Run ONLY in a disposable, schema-only test database after 001-063, 065, 066
-- and 067 (064 optional). Everything runs in one transaction and ROLLS BACK.
-- Synthetic fixtures only.
--
-- Every assertion is recorded in t067_results rather than raised one at a
-- time, so a run reports EVERY failing contract. 067_build_test_runner.mjs
-- builds a NEGATIVE CONTROL that first restores the replaced 059/060 function
-- bodies (from the rollback contingency) inside this transaction.
-- Concurrency is NOT tested here (one session cannot race itself); see
-- 067_concurrency_runner.mjs.
begin;
set local timezone='UTC';

create temp table t067_results(test int primary key,ok boolean not null,label text not null);
create function pg_temp.check(p_test int,p_ok boolean,p_label text)
returns void language plpgsql as $$
begin
  insert into t067_results values(p_test,coalesce(p_ok,false),p_label)
    on conflict(test) do update set ok=t067_results.ok and excluded.ok;
end; $$;

create function pg_temp.set_actor(p_id uuid,p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',coalesce(p_id::text,''),true);
  perform set_config('request.jwt.claims',case when p_id is null then '{}' else
    jsonb_build_object('sub',p_id,'role',p_role)::text end,true);
  execute format('set local role %I',p_role);
end; $$;

-- One statement AS a real caller; the role switch sits OUTSIDE the inner
-- exception block. A refused call rolls back its own effects, exactly as a
-- failed API request would.
create function pg_temp.as_actor(p_id uuid,p_role text,p_sql text)
returns jsonb language plpgsql as $$
declare v_result jsonb; v_state text:='00000'; v_msg text;
begin
  perform pg_temp.set_actor(p_id,p_role);
  begin
    execute p_sql into v_result;
  exception when others then
    v_state:=sqlstate; v_result:=null; v_msg:=sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims','',true);
  perform set_config('request.jwt.claim.sub','',true);
  return jsonb_build_object('state',v_state,'data',v_result,'message',v_msg);
end; $$;
create function pg_temp.q(p_id uuid,p_sql text) returns jsonb language sql as $$ select pg_temp.as_actor(p_id,'authenticated',p_sql) $$;
create function pg_temp.ok(j jsonb) returns boolean language sql as $$ select j->>'state'='00000' $$;
create function pg_temp.refused(j jsonb,p_state text default 'P0001') returns boolean language sql as $$ select j->>'state'=p_state $$;

create temp table t067_ids(k text primary key,id uuid not null);
insert into t067_ids values
 ('sec','f0670000-0000-4000-8000-000000000001'),('pun','f0670000-0000-4000-8000-000000000002'),
 ('tre','f0670000-0000-4000-8000-000000000003'),('kag','f0670000-0000-4000-8000-000000000004'),
 ('kpo','f0670000-0000-4000-8000-000000000005'),('res','f0670000-0000-4000-8000-000000000009'),
 ('res2','f0670000-0000-4000-8000-000000000010'),('nur','f0670000-0000-4000-8000-00000000000a'),
 ('tan','f0670000-0000-4000-8000-00000000000b'),
 ('r_self','f0670000-0000-4000-8000-000000000101'),('r_other','f0670000-0000-4000-8000-000000000102'),
 ('r_plain','f0670000-0000-4000-8000-000000000103'),('r_inactive','f0670000-0000-4000-8000-000000000104'),
 ('r_later','f0670000-0000-4000-8000-000000000105');

do $precondition$
begin
  if exists(select 1 from public.barangay_officials where archived_at is null
            and position in ('Punong Barangay','Barangay Secretary','Barangay Treasurer')) then
    raise exception 'SETUP PRECONDITION FAILED: a powered position already has an active holder; run only on a disposable schema-only database';
  end if;
  if exists(select 1 from public.community_credit_policies) then
    raise exception 'SETUP PRECONDITION FAILED: Community Credit policies already exist; run only on a disposable schema-only database';
  end if;
  if to_regprocedure('public.award_community_credit_participation(uuid,uuid,uuid)') is null then
    raise exception 'SETUP PRECONDITION FAILED: migration 067 is not applied';
  end if;
end $precondition$;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',k||'@p067-test.invalid','',now(),'{}','{}',now(),now()
from t067_ids where k in ('sec','pun','tre','kag','kpo','res','res2','nur','tan') on conflict(id) do nothing;
insert into public.profiles(id,full_name,role)
select id,'P067 '||k,case k when 'res' then 'resident' when 'res2' then 'resident' when 'nur' then 'nurse' when 'tan' then 'tanod' else 'official' end
from t067_ids where k in ('sec','pun','tre','kag','kpo','res','res2','nur','tan')
on conflict(id) do update set full_name=excluded.full_name,role=excluded.role;
insert into public.barangay_officials(id,full_name,position,committee,display_order,created_by)
select ('f0670000-0000-4000-8000-0000000000'||lpad(n::text,2,'0'))::uuid,'P067 '||k,pos,committee,970000+n,(select id from t067_ids where k='sec')
from (values(11,'sec','Barangay Secretary',null),(12,'pun','Punong Barangay',null),(13,'tre','Barangay Treasurer',null),
            (14,'kag','Kagawad','Health'),(15,'kpo','Kagawad','Peace and Order and Appropriation'))v(n,k,pos,committee);
insert into public.official_account_links(official_id,profile_id,linked_by)
select ('f0670000-0000-4000-8000-0000000000'||lpad(n::text,2,'0'))::uuid,(select id from t067_ids where k=v.k),'migration-067 behavioral test'
from (values(11,'sec'),(12,'pun'),(13,'tre'),(14,'kag'),(15,'kpo'))v(n,k);
insert into public.barangay_residents(id,first_name,last_name,purok,resident_status,profile_id) values
 ((select id from t067_ids where k='r_self'),'P067','Self','P067 Area','active',(select id from t067_ids where k='res')),
 ((select id from t067_ids where k='r_other'),'P067','Other','P067 Area','active',(select id from t067_ids where k='res2')),
 ((select id from t067_ids where k='r_plain'),'P067','Plain','P067 Area','active',null),
 ((select id from t067_ids where k='r_inactive'),'P067','Inactive','P067 Area','inactive',null);

create temp table t067_v(k text primary key,v text);
create function pg_temp.v(p text) returns text language sql as $$ select v from t067_v where k=p $$;
create function pg_temp.u(p text) returns uuid language sql as $$ select coalesce((select id from t067_ids where k=p),(select v::uuid from t067_v where k=p)) $$;
create function pg_temp.put(p text,p_v text) returns void language sql as $$ insert into t067_v values(p,p_v) on conflict(k) do update set v=excluded.v $$;

-- Fingerprints: the V1 rows as stored, in the column set 059/060 created.
create function pg_temp.fp_v1(p_policy uuid) returns text language sql as $$
  select md5(coalesce((select string_agg(concat_ws('|',id,resident_id,policy_id,started_at,starting_score,enrollment_source,created_at,created_by),',' order by id)
    from public.community_credit_enrollments where policy_id=p_policy and enrollment_source<>'policy_transition'),'')||'#'||
    coalesce((select string_agg(concat_ws('|',id,resident_id,policy_id,rule_id,event_kind,rule_code_snapshot,points_delta_snapshot,source_type,verified_by,verified_at,note,reverses_event_id),',' order by id)
    from public.community_credit_events where policy_id=p_policy),'')||'#'||
    coalesce((select string_agg(concat_ws('|',id,rule_code,category,source_domain,points_delta,active),',' order by id)
    from public.community_credit_rules where policy_id=p_policy),''))
$$;
create function pg_temp.fp_all() returns text language sql as $$
  select md5(coalesce((select string_agg(to_jsonb(p)::text,',' order by id) from public.community_credit_policies p),'')||
    coalesce((select string_agg(to_jsonb(e)::text,',' order by id) from public.community_credit_enrollments e),'')||
    coalesce((select string_agg(to_jsonb(e)::text,',' order by id) from public.community_credit_events e),'')||
    coalesce((select string_agg(to_jsonb(t)::text,',' order by id) from public.community_credit_transitions t),''))
$$;

do $tests$
declare
  sec uuid:=pg_temp.u('sec'); pun uuid:=pg_temp.u('pun'); tre uuid:=pg_temp.u('tre'); kag uuid:=pg_temp.u('kag');
  kpo uuid:=pg_temp.u('kpo'); res uuid:=pg_temp.u('res'); res2 uuid:=pg_temp.u('res2'); nur uuid:=pg_temp.u('nur'); tan uuid:=pg_temp.u('tan');
  r_self uuid:=pg_temp.u('r_self'); r_other uuid:=pg_temp.u('r_other'); r_plain uuid:=pg_temp.u('r_plain'); r_inactive uuid:=pg_temp.u('r_inactive');
  a jsonb; b jsonb; c jsonb; d jsonb; e jsonb; f jsonb; g jsonb; h jsonb; i int; n int; t text; t2 text;
  v1 uuid; v1b uuid; v2 uuid; rule_pos uuid; rule_neg uuid; rid uuid; tr uuid; tr2 uuid;
  act1 uuid; act_future uuid; u record; ev1 uuid; ev1b uuid; evo uuid; req uuid; x uuid; rec record;
  rules jsonb:='{}'::jsonb;
begin
  -- ── TEST 1. Before any policy, the profile says "not configured", never 0.
  a:=pg_temp.q(sec,format('select public.community_credit_profile(%L)',r_self));
  perform pg_temp.check(1,pg_temp.ok(a) and a#>>'{data,status}'='not_configured' and a#>'{data,gauge}' ? 'value'
    and jsonb_typeof(a#>'{data,gauge,value}')='null','no policy: status not_configured and a null gauge value');

  -- V1 fixtures through the V1 functions (byte-unchanged by 067).
  a:=pg_temp.q(sec,'select to_jsonb(public.save_community_credit_policy(null,''P067 V1'',''Legacy'',100,0,100))');
  v1:=(a->>'data')::uuid;
  b:=pg_temp.q(sec,format('select public.activate_community_credit_policy(%L)',v1));
  a:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_rule(null,%L,''V1_POS'',''V1 positive'','''',''positive'',''community_activity'',5,false))',v1));
  rule_pos:=(a->>'data')::uuid;
  a:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_rule(null,%L,''V1_NEG'',''V1 negative'','''',''negative'',''incident_outcome'',-10,false))',v1));
  rule_neg:=(a->>'data')::uuid;
  perform pg_temp.q(sec,format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',rule_pos));
  perform pg_temp.q(sec,format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',rule_neg));
  -- V1 has no event-recording function; fixture events are written directly (trusted SQL).
  insert into public.community_credit_events(resident_id,policy_id,rule_id,event_kind,rule_code_snapshot,rule_title_snapshot,points_delta_snapshot,source_type,verified_by,verified_at)
  values(r_self,v1,rule_pos,'positive','-','-',1,'community_activity',sec,now()),(r_self,v1,rule_neg,'negative','-','-',-1,'incident_outcome',sec,now()),
        (r_other,v1,rule_pos,'positive','-','-',1,'community_activity',sec,now());
  t:=pg_temp.fp_v1(v1);

  -- ── TEST 2. V1 behaves as before: 100/0/100 only, activation enrolls at 100, V1 score formula.
  a:=pg_temp.q(sec,format('select public.community_credit_profile(%L)',r_self));
  b:=pg_temp.q(sec,'select to_jsonb(public.save_community_credit_policy(null,''P067 bad'','''',80,0,100))');
  c:=pg_temp.q(sec,'select to_jsonb(public.save_community_credit_policy(null,''P067 V1 draft 2'','''',100,0,100))');
  v1b:=(c->>'data')::uuid;
  d:=pg_temp.q(sec,format('select public.activate_community_credit_policy(%L)',v1b));
  perform pg_temp.check(2,pg_temp.ok(a) and (a#>>'{data,current_score}')::int=95 and a#>>'{data,policy_model}'='legacy_v1'
      and a#>>'{data,status}'='enrolled' and (a#>>'{data,gauge,value}')::int=95 and (a#>>'{data,negative_event_count}')::int=1
      and pg_temp.refused(b) and pg_temp.ok(c) and pg_temp.refused(d)
      and (select bool_and(starting_score=100 and enrollment_source='active_resident_batch') from public.community_credit_enrollments where policy_id=v1)
      and (select count(*) from public.community_credit_enrollments where policy_id=v1)=(select count(*) from public.barangay_residents where resident_status='active'),
    'V1: 100/0/100 only, enrollment at 100, score 95, one active policy');

  -- ── TEST 3. Individual scores: the resident themself and records administrators ONLY.
  a:=pg_temp.q(sec,format('select public.community_credit_profile(%L)',r_self));
  b:=pg_temp.q(pun,format('select public.community_credit_profile(%L)',r_self));
  c:=pg_temp.q(res,format('select public.community_credit_profile(%L)',r_self));
  d:=pg_temp.q(res,'select public.my_community_credit_profile()');
  e:=pg_temp.q(res,format('select public.community_credit_profile(%L)',r_other));
  perform pg_temp.check(3,pg_temp.ok(a) and pg_temp.ok(b) and pg_temp.ok(c) and pg_temp.ok(d) and (d#>>'{data,profile,current_score}')::int=95
      and pg_temp.refused(e,'42501')
      and pg_temp.refused(pg_temp.q(tre,format('select public.community_credit_profile(%L)',r_self)),'42501')
      and pg_temp.refused(pg_temp.q(kag,format('select public.community_credit_profile(%L)',r_self)),'42501')
      and pg_temp.refused(pg_temp.q(kpo,format('select public.community_credit_profile(%L)',r_self)),'42501')
      and pg_temp.refused(pg_temp.q(nur,format('select public.community_credit_profile(%L)',r_self)),'42501')
      and pg_temp.refused(pg_temp.q(tan,format('select public.community_credit_profile(%L)',r_self)),'42501')
      and pg_temp.refused(pg_temp.as_actor(null,'anon',format('select public.community_credit_profile(%L)',r_self)),'42501')
      and pg_temp.refused(pg_temp.q(kag,format('select public.community_credit_policy_history(%L)',r_self)),'42501')
      and pg_temp.ok(pg_temp.q(kag,'select to_jsonb(count(*)) from public.community_credit_resident_directory()')),
    'individual score: self and Secretary/Punong only; ordinary officials, nurse, Tanod and anon refused; directory unchanged');

  -- ── TEST 4. V2 policy: prepared by one administrator, approved by the other.
  a:=pg_temp.q(sec,'select to_jsonb(public.save_community_credit_v2_policy(null,''P067 Participation Points'',''Prototype''))');
  v2:=(a->>'data')::uuid;
  b:=pg_temp.q(tre,'select to_jsonb(public.save_community_credit_v2_policy(null,''x'',''x''))');
  c:=pg_temp.q(sec,format('select public.approve_community_credit_v2_policy(%L)',v2));
  d:=pg_temp.q(kag,format('select public.approve_community_credit_v2_policy(%L)',v2));
  e:=pg_temp.q(pun,format('select public.approve_community_credit_v2_policy(%L)',v2));
  f:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_v2_policy(%L,''changed'',''changed''))',v2));
  g:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_policy(%L,''P067 Participation Points'',''x'',100,0,100))',v2));
  h:=pg_temp.q(pun,format('select public.activate_community_credit_policy(%L)',v2));
  perform pg_temp.check(4,pg_temp.ok(a) and pg_temp.refused(b,'42501') and pg_temp.refused(c) and pg_temp.refused(d,'42501') and pg_temp.ok(e)
      and pg_temp.refused(f) and not pg_temp.ok(g) and not pg_temp.ok(h)
      and exists(select 1 from public.community_credit_policies where id=v2 and policy_model='participation_v2' and status='draft'
        and base_score=0 and minimum_score=0 and maximum_score=100 and prepared_by=sec and approved_by=pun),
    'V2 policy: 0/0/100 draft, self-approval refused, approved by the other, then immutable; V1 paths cannot edit or activate it');

  -- ── TEST 5. V2 rules: only earned community-activity rules, two-person approval, immutable once approved.
  a:=pg_temp.q(sec,'select jsonb_agg(to_jsonb(x)) from public.community_credit_v2_prototype_rules() x');
  for rec in select * from jsonb_to_recordset(a->'data') as y(rule_code text,title text,points int,annual_points_cap int,evidence_requirement text) loop
    b:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_v2_rule(null,%L,%L,%L,'''',%s,%s,%L))',v2,rec.rule_code,rec.title,rec.points,rec.annual_points_cap,rec.evidence_requirement));
    rules:=rules||jsonb_build_object(rec.rule_code,b->>'data');
  end loop;
  c:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_v2_rule(null,%L,''BAD_CAP'',''x'','''',5,22,''sheet''))',v2));
  d:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_v2_rule(null,%L,''BAD_ZERO'',''x'','''',0,10,''sheet''))',v2));
  e:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_rule(null,%L,''V2_NEG'',''x'','''',''negative'',''incident_outcome'',-5,false))',v2));
  f:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_rule(null,%L,''V2_POS_KP'',''x'','''',''positive'',''kp_outcome'',5,false))',v2));
  g:=pg_temp.q(sec,format('select public.approve_community_credit_v2_rule(%L)',rules->>'CLEANUP_DRIVE'));
  h:=pg_temp.q(sec,format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',rules->>'CLEANUP_DRIVE'));
  n:=0;
  for t2 in select jsonb_object_keys(rules) loop
    if pg_temp.ok(pg_temp.q(pun,format('select public.approve_community_credit_v2_rule(%L)',rules->>t2))) then n:=n+1; end if;
    perform pg_temp.q(sec,format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',rules->>t2));
  end loop;
  perform pg_temp.check(5,jsonb_array_length(a->'data')=5 and (select count(*) from jsonb_object_keys(rules))=5 and n=5
      and pg_temp.refused(c,'23514') and not pg_temp.ok(d) and pg_temp.refused(e) and pg_temp.refused(f) and pg_temp.refused(g) and pg_temp.refused(h)
      and pg_temp.refused(pg_temp.q(kag,'select jsonb_agg(to_jsonb(x)) from public.community_credit_v2_prototype_rules() x'),'42501')
      and (select count(*) from public.community_credit_rules where policy_id=v2 and active and approved_by=pun and prepared_by=sec
           and category='positive' and source_domain='community_activity' and annual_points_cap % points_delta=0)=5
      and (select string_agg(rule_code||':'||points_delta||'/'||annual_points_cap,',' order by rule_code) from public.community_credit_rules where policy_id=v2)
        ='CLEANUP_DRIVE:5/20,COMMUNITY_PROGRAM:5/20,COMMUNITY_SERVICE_TERM:10/10,DRRM_TRAINING:10/20,VOLUNTEER_SERVICE:5/30',
    'V2 rules: five prototype rules, caps are multiples, no negative/KP/incident rule, self-approval and unapproved enabling refused');

  -- ── TEST 6. An approved rule is immutable through every path; an editor becomes the preparer.
  a:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_v2_rule(%L,%L,''CLEANUP_DRIVE'',''x'','''',10,20,''sheet''))',rules->>'CLEANUP_DRIVE',v2));
  perform pg_temp.q(sec,format('select to_jsonb(public.set_community_credit_rule_active(%L,false))',rules->>'CLEANUP_DRIVE'));
  b:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_rule(%L,%L,''CLEANUP_DRIVE'',''x'','''',''positive'',''community_activity'',50,false))',rules->>'CLEANUP_DRIVE',v2));
  c:=pg_temp.q(sec,format('select to_jsonb(public.set_community_credit_rule_active(%L,true))',rules->>'CLEANUP_DRIVE'));
  d:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_v2_rule(null,%L,''EXTRA_RULE'',''Extra'','''',5,10,''sheet''))',v2));
  rid:=(d->>'data')::uuid;
  e:=pg_temp.q(pun,format('select to_jsonb(public.save_community_credit_v2_rule(%L,%L,''EXTRA_RULE'',''Extra edited'','''',5,10,''sheet''))',rid,v2));
  f:=pg_temp.q(pun,format('select public.approve_community_credit_v2_rule(%L)',rid));
  g:=pg_temp.q(sec,format('select public.approve_community_credit_v2_rule(%L)',rid));
  perform pg_temp.check(6,pg_temp.refused(a) and pg_temp.refused(b) and pg_temp.ok(c)
      and (select points_delta from public.community_credit_rules where id=(rules->>'CLEANUP_DRIVE')::uuid)=5
      and pg_temp.ok(e) and pg_temp.refused(f) and pg_temp.ok(g)
      and exists(select 1 from public.community_credit_rules where id=rid and prepared_by=pun and approved_by=sec and not active),
    'approved rule cannot be edited by V2 or V1 save; the last editor becomes the preparer and cannot approve');
  perform pg_temp.put('extra_rule',rid::text);

  -- ── TEST 7. Vacancy fails closed: with the Punong Barangay unlinked, nothing can be approved.
  delete from public.official_account_links where profile_id=pun;
  a:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_v2_rule(null,%L,''VACANCY_RULE'',''x'','''',5,10,''sheet''))',v2));
  b:=pg_temp.q(sec,format('select public.approve_community_credit_v2_rule(%L)',a->>'data'));
  c:=pg_temp.q(pun,format('select public.approve_community_credit_v2_rule(%L)',a->>'data'));
  d:=pg_temp.q(pun,format('select public.community_credit_profile(%L)',r_self));
  insert into public.official_account_links(official_id,profile_id,linked_by) values('f0670000-0000-4000-8000-000000000012',pun,'migration-067 behavioral test');
  perform pg_temp.check(7,pg_temp.ok(a) and pg_temp.refused(b) and pg_temp.refused(c,'42501') and pg_temp.refused(d,'42501'),
    'vacant Punong Barangay: the Secretary cannot self-approve and the unlinked account has no power');

  -- ── TEST 8. Transition preflight is read-only and reports the V1 punitive configuration.
  t2:=pg_temp.fp_all();
  a:=pg_temp.q(sec,'select public.community_credit_transition_preflight()');
  perform pg_temp.check(8,pg_temp.ok(a) and t2=pg_temp.fp_all() and a#>>'{data,active_policy,policy_model}'='legacy_v1'
      and (a#>>'{data,active_policy,punitive_rules}')::int=1 and (a#>>'{data,active_policy,punitive_events}')::int=1
      and jsonb_path_exists(a->'data',format('$.participation_drafts[*] ? (@.id == "%s" && @.approved == true && @.enabled_rules == 5)',v2)::jsonpath)
      and pg_temp.refused(pg_temp.q(kag,'select public.community_credit_transition_preflight()'),'42501'),
    'preflight: read-only, admin-only, reports punitive V1 rules/events and the approved V2 draft');

  -- ── TEST 9. Prepare and approve are two people; wrong confirmation and an injected failure change nothing.
  a:=pg_temp.q(sec,format('select public.prepare_community_credit_transition(%L,''P067 move to the participation measure'')',v2));
  tr:=(a#>>'{data,transition_id}')::uuid;
  b:=pg_temp.q(pun,format('select public.prepare_community_credit_transition(%L,''second prepare attempt'')',v2));
  c:=pg_temp.q(sec,format('select public.approve_community_credit_transition(%L,''ACTIVATE PARTICIPATION POINTS'')',tr));
  d:=pg_temp.q(pun,format('select public.approve_community_credit_transition(%L,''activate'')',tr));
  e:=pg_temp.q(kag,format('select public.approve_community_credit_transition(%L,''ACTIVATE PARTICIPATION POINTS'')',tr));
  t2:=pg_temp.fp_all();
  create function public.t067_injected_failure() returns trigger language plpgsql as $f$
  begin if new.enrollment_source='policy_transition' then raise exception 'INJECTED FAILURE'; end if; return new; end; $f$;
  create trigger t067_injected_failure before insert on public.community_credit_enrollments for each row execute function public.t067_injected_failure();
  f:=pg_temp.q(pun,format('select public.approve_community_credit_transition(%L,''ACTIVATE PARTICIPATION POINTS'')',tr));
  drop trigger t067_injected_failure on public.community_credit_enrollments; drop function public.t067_injected_failure();
  perform pg_temp.check(9,pg_temp.ok(a) and pg_temp.refused(b) and pg_temp.refused(c) and pg_temp.refused(d) and pg_temp.refused(e,'42501')
      and f->>'message' like '%INJECTED FAILURE%' and t2=pg_temp.fp_all()
      and (select status from public.community_credit_policies where id=v1)='active' and (select status from public.community_credit_policies where id=v2)='draft'
      and (select status from public.community_credit_transitions where id=tr)='prepared',
    'transition: second prepare, self-approval, wrong confirmation and ordinary officials refused; a mid-way failure leaves V1, V2 and the transition unchanged');

  -- ── TEST 10. Approved transition: V1 retired untouched, V2 active, active residents at 0.
  a:=pg_temp.q(pun,format('select public.approve_community_credit_transition(%L,''ACTIVATE PARTICIPATION POINTS'')',tr));
  b:=pg_temp.q(pun,format('select public.approve_community_credit_transition(%L,''ACTIVATE PARTICIPATION POINTS'')',tr));
  perform pg_temp.check(10,pg_temp.ok(a) and pg_temp.refused(b) and t=pg_temp.fp_v1(v1)
      and (select status from public.community_credit_policies where id=v1)='retired' and (select status from public.community_credit_policies where id=v2)='active'
      and (select count(*) from public.community_credit_enrollments where policy_id=v2)=(select count(*) from public.barangay_residents where resident_status='active')
      and (select bool_and(starting_score=0 and enrollment_source='policy_transition') from public.community_credit_enrollments where policy_id=v2)
      and not exists(select 1 from public.community_credit_enrollments where policy_id=v2 and resident_id=r_inactive)
      and not exists(select 1 from public.community_credit_events where policy_id=v2)
      and exists(select 1 from public.community_credit_transitions where id=tr and status='completed' and prepared_by=sec and approved_by=pun),
    'approved transition retires V1 byte-unchanged, activates V2, enrolls active residents at 0, awards nothing');
  -- Backdate V2 enrollments (fixture-only, trusted SQL) so the fixed past dates below are eligible
  -- whatever day the harness runs; the eligibility rule itself is unchanged.
  update public.community_credit_enrollments set started_at='2024-01-01 00:00+08' where policy_id=v2;

  -- ── TEST 11. V2 profile and gauge contract: score 0 is distinct from not enrolled; V1 history kept.
  a:=pg_temp.q(res,'select public.my_community_credit_profile()');
  b:=pg_temp.q(sec,format('select public.community_credit_profile(%L)',r_inactive));
  c:=pg_temp.q(res,'select public.my_community_credit_policy_history()');
  perform pg_temp.check(11,pg_temp.ok(a) and a#>>'{data,profile,status}'='enrolled' and a#>>'{data,profile,policy_model}'='participation_v2'
      and (a#>>'{data,profile,gauge,value}')::int=0 and (a#>>'{data,profile,points_recorded}')::int=0 and a#>>'{data,profile,milestone,code}'='none'
      and (a#>>'{data,profile,has_previous_policies}')::boolean and a#>>'{data,profile,transition_notice}' like '%not a penalty%'
      and not (a->'data'->'profile' ? 'negative_event_count') and jsonb_array_length(a#>'{data,profile,gauge,milestones}')=6
      and pg_temp.ok(b) and b#>>'{data,status}'='not_enrolled' and jsonb_typeof(b#>'{data,gauge,value}')='null'
      and pg_temp.ok(c) and jsonb_array_length(c#>'{data,policies}')=1 and (c#>>'{data,policies,0,final_score}')::int=95
      and c#>>'{data,policies,0,label}'='Previous policy (retired)',
    'V2 gauge: enrolled 0 with milestone none; not-enrolled returns a null value; V1 record kept as Previous policy (retired) at 95');

  -- ── TEST 12. Activities: administrators only, approved enabled rules only, immutable.
  a:=pg_temp.q(kag,format('select public.create_community_credit_activity(%L,%L,''x'',now(),null,null,''sheet'')',gen_random_uuid(),rules->>'CLEANUP_DRIVE'));
  b:=pg_temp.q(sec,format('select public.create_community_credit_activity(%L,%L,''Purok clean-up'',''2026-06-01 09:00+08'',null,''Purok 2'',''Attendance sheet No. 12'')',gen_random_uuid(),rules->>'CLEANUP_DRIVE'));
  act1:=(b#>>'{data,activity_id}')::uuid;
  c:=pg_temp.q(sec,format('select public.create_community_credit_activity(%L,%L,''x'',now(),null,null,''sheet'')',gen_random_uuid(),pg_temp.v('extra_rule')));
  d:=pg_temp.q(sec,format('select public.create_community_credit_activity(%L,%L,''Future drill'',now()+interval ''1 day'',null,null,''sheet'')',gen_random_uuid(),rules->>'DRRM_TRAINING'));
  act_future:=(d#>>'{data,activity_id}')::uuid;
  e:=pg_temp.q(sec,format('select public.verify_community_credit_participation(%L,%L,%L,''in_person'',null)',gen_random_uuid(),act_future,r_self));
  begin update public.community_credit_activities set title='changed' where id=act1; n:=1; exception when others then n:=0; end;
  perform pg_temp.check(12,pg_temp.refused(a,'42501') and pg_temp.ok(b) and b#>>'{data,reference}' ~ '^ACT-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{6}$'
      and pg_temp.refused(c) and pg_temp.ok(d) and pg_temp.refused(e) and n=0,
    'activities: admin-only, need an enabled approved rule, future ones cannot be verified yet, immutable');

  -- ── TEST 13. Verification by stable resident id; duplicates and ineligible residents refused.
  a:=pg_temp.q(sec,format('select public.verify_community_credit_participation(%L,%L,%L,''in_person'',''present'')',gen_random_uuid(),act1,r_self));
  b:=pg_temp.q(sec,format('select public.verify_community_credit_participation(%L,%L,%L,''in_person'',null)',gen_random_uuid(),act1,r_self));
  c:=pg_temp.q(sec,format('select public.verify_community_credit_participation(%L,%L,%L,''in_person'',null)',gen_random_uuid(),act1,r_inactive));
  d:=pg_temp.q(sec,format('select public.verify_community_credit_participation(%L,%L,%L,''by_name'',null)',gen_random_uuid(),act1,r_plain));
  e:=pg_temp.q(pun,format('select public.verify_community_credit_participation(%L,%L,%L,''accessible_alternative'',''seated registration desk'')',gen_random_uuid(),act1,r_plain));
  f:=pg_temp.q(tre,format('select public.verify_community_credit_participation(%L,%L,%L,''in_person'',null)',gen_random_uuid(),act1,r_other));
  perform pg_temp.check(13,pg_temp.ok(a) and pg_temp.refused(b) and pg_temp.refused(c) and pg_temp.refused(d) and pg_temp.ok(e) and pg_temp.refused(f,'42501')
      and exists(select 1 from public.community_credit_participations where activity_id=act1 and resident_id=r_plain and participation_mode='accessible_alternative' and verified_by=pun),
    'verification: once per resident and activity, active residents only, explicit mode, accessible alternative supported, admin-only');

  -- ── TEST 14. Awards and idempotency.
  req:=gen_random_uuid();
  a:=pg_temp.q(sec,format('select public.award_community_credit_participation(%L,%L,%L)',req,act1,r_self));
  ev1:=(a#>>'{data,event_id}')::uuid;
  b:=pg_temp.q(sec,format('select public.award_community_credit_participation(%L,%L,%L)',req,act1,r_self));
  c:=pg_temp.q(sec,format('select public.award_community_credit_participation(%L,%L,%L)',req,act1,r_plain));
  d:=pg_temp.q(pun,format('select public.award_community_credit_participation(%L,%L,%L)',req,act1,r_self));
  e:=pg_temp.q(sec,format('select public.award_community_credit_participation(%L,%L,%L)',gen_random_uuid(),act1,r_self));
  f:=pg_temp.q(sec,format('select public.award_community_credit_participation(%L,%L,%L)',gen_random_uuid(),act1,r_other));
  perform pg_temp.check(14,pg_temp.ok(a) and a#>>'{data,state}'='awarded' and (a#>>'{data,points}')::int=5 and not (a#>>'{data,replayed}')::boolean
      and pg_temp.ok(b) and (b#>>'{data,replayed}')::boolean and b#>>'{data,event_id}'=ev1::text
      and pg_temp.refused(c) and pg_temp.refused(d) and pg_temp.refused(e) and pg_temp.refused(f)
      and (select count(*) from public.community_credit_events where policy_id=v2)=1
      and exists(select 1 from public.community_credit_events where id=ev1 and points_delta_snapshot=5 and event_kind='positive' and rule_code_snapshot='CLEANUP_DRIVE'
                 and source_reference_snapshot=(select reference from public.community_credit_activities where id=act1)),
    'awards: replay returns the same event, a reused id with a different payload or actor is refused, no duplicate award, verify first');


  -- ── TEST 15. Annual caps on the Manila calendar year of the start date; lifetime accumulates.
  n:=0;
  for i in 1..6 loop
    a:=pg_temp.q(sec,format('select public.create_community_credit_activity(%L,%L,%L,%L::timestamptz,null,null,''sheet'')',gen_random_uuid(),rules->>'CLEANUP_DRIVE',
      'Clean-up 2025 #'||i,case when i=6 then '2025-12-31 23:30+08' else '2025-0'||i||'-10 09:00+08' end));
    x:=(a#>>'{data,activity_id}')::uuid; perform pg_temp.put('c25_'||i,x::text);
    perform pg_temp.q(sec,format('select public.verify_community_credit_participation(%L,%L,%L,''in_person'',null)',gen_random_uuid(),x,r_self));
    b:=pg_temp.q(sec,format('select public.award_community_credit_participation(%L,%L,%L)',gen_random_uuid(),x,r_self));
    if b#>>'{data,state}'='awarded' then n:=n+1; end if;
    if i=6 then c:=b; end if;
  end loop;
  a:=pg_temp.q(sec,format('select public.create_community_credit_activity(%L,%L,''New year clean-up'',''2026-01-01 00:10+08'',null,null,''sheet'')',gen_random_uuid(),rules->>'CLEANUP_DRIVE'));
  x:=(a#>>'{data,activity_id}')::uuid;
  perform pg_temp.q(sec,format('select public.verify_community_credit_participation(%L,%L,%L,''in_person'',null)',gen_random_uuid(),x,r_self));
  d:=pg_temp.q(sec,format('select public.award_community_credit_participation(%L,%L,%L)',gen_random_uuid(),x,r_self));
  e:=pg_temp.q(res,'select public.my_community_credit_profile()');
  select coalesce(sum(e2.points_delta_snapshot),0)::int as used into u from public.community_credit_events e2 join public.community_credit_activities a2 on a2.id=e2.participation_activity_id
    where e2.resident_id=r_self and e2.rule_id=(rules->>'CLEANUP_DRIVE')::uuid and a2.cap_year=extract(year from now() at time zone 'Asia/Manila')::int;
  perform pg_temp.check(15,n=4 and c#>>'{data,state}'='capped' and (c#>>'{data,points}')::int=0 and (c#>>'{data,cap_year}')::int=2025
      and a#>>'{data,activity_date}'='2026-01-01' and (a#>>'{data,cap_year}')::int=2026 and d#>>'{data,state}'='awarded'
      and (select count(*) from public.community_credit_participations where resident_id=r_self and state='capped')=2
      and (e#>>'{data,profile,points_recorded}')::int=30
      and (select sum(e2.points_delta_snapshot) from public.community_credit_events e2 join public.community_credit_activities a2 on a2.id=e2.participation_activity_id
           where e2.resident_id=r_self and e2.rule_id=(rules->>'CLEANUP_DRIVE')::uuid and a2.cap_year=2026)=10
      and (e#>>'{data,profile,this_year,year}')::int=extract(year from now() at time zone 'Asia/Manila')::int
      and jsonb_path_exists(e#>'{data,profile,this_year}',format('$.by_rule[*] ? (@.rule_code == "CLEANUP_DRIVE" && @.used == %s && @.remaining == %s)',
            u.used,20-u.used)::jsonpath)
      and jsonb_array_length(e#>'{data,profile,participations_without_points}')=2,
    'cap: 4 of 6 in 2025 (31 Dec 23:30 Manila counts in 2025), 1 Jan 00:10 Manila counts in 2026; capped participation kept without points; lifetime 30');

  -- ── TEST 16. Accumulation past 100 keeps a truthful ledger and displays 100.
  for rec in select * from (values('CLEANUP_DRIVE',4),('VOLUNTEER_SERVICE',6),('DRRM_TRAINING',2),('COMMUNITY_PROGRAM',4),('COMMUNITY_SERVICE_TERM',1),('DRRM_TRAINING',1)) v(code,cnt) loop
    for i in 1..rec.cnt loop
      a:=pg_temp.q(sec,format('select public.create_community_credit_activity(%L,%L,%L,%L::timestamptz,null,null,''sheet'')',gen_random_uuid(),rules->>rec.code,
        rec.code||' '||i,case when rec.cnt=1 and rec.code='DRRM_TRAINING' then '2026-02-02 09:00+08' else '2025-05-'||lpad(i::text,2,'0')||' 09:00+08' end));
      x:=(a#>>'{data,activity_id}')::uuid;
      perform pg_temp.q(pun,format('select public.verify_community_credit_participation(%L,%L,%L,''in_person'',null)',gen_random_uuid(),x,r_other));
      perform pg_temp.q(pun,format('select public.award_community_credit_participation(%L,%L,%L)',gen_random_uuid(),x,r_other));
    end loop;
  end loop;
  a:=pg_temp.q(res2,'select public.my_community_credit_profile()');
  perform pg_temp.check(16,(a#>>'{data,profile,points_recorded}')::int=110 and (a#>>'{data,profile,current_score}')::int=100
      and (a#>>'{data,profile,gauge,value}')::int=100 and (a#>>'{data,profile,at_maximum}')::boolean
      and a#>>'{data,profile,milestone,code}'='outstanding_service' and jsonb_array_length(a#>'{data,profile,ledger}')=18,
    'past 100: 110 recorded, gauge 100, at_maximum, top milestone, all 18 awards kept');

  -- ── TEST 17. Reversal: reasoned, independent, once; reversal cannot be reversed; re-award is explicit.
  a:=pg_temp.q(sec,format('select public.reverse_community_credit_award(%L,%L,''recorded for the wrong resident'')',gen_random_uuid(),ev1));
  b:=pg_temp.q(pun,format('select public.reverse_community_credit_award(%L,%L,'' '')',gen_random_uuid(),ev1));
  req:=gen_random_uuid();
  c:=pg_temp.q(pun,format('select public.reverse_community_credit_award(%L,%L,''Attendance sheet did not list this resident'')',req,ev1));
  d:=pg_temp.q(pun,format('select public.reverse_community_credit_award(%L,%L,''Attendance sheet did not list this resident'')',req,ev1));
  e:=pg_temp.q(pun,format('select public.reverse_community_credit_award(%L,%L,''again'')',gen_random_uuid(),ev1));
  f:=pg_temp.q(sec,format('select public.reverse_community_credit_award(%L,%L,''reverse the reversal'')',gen_random_uuid(),(c#>>'{data,reversal_event_id}')));
  g:=pg_temp.q(sec,format('select public.award_community_credit_participation(%L,%L,%L)',gen_random_uuid(),act1,r_self));
  h:=pg_temp.q(pun,format('select public.reaward_community_credit_participation(%L,%L,%L,''sheet found'')',gen_random_uuid(),act1,r_self));
  b:=b||jsonb_build_object('r1',pg_temp.q(sec,format('select public.reaward_community_credit_participation(%L,%L,%L,'' '')',gen_random_uuid(),act1,r_self)));
  x:=gen_random_uuid();
  e:=e||jsonb_build_object('ra',pg_temp.q(sec,format('select public.reaward_community_credit_participation(%L,%L,%L,''Second sheet page lists the resident'')',x,act1,r_self)));
  ev1b:=(e#>>'{ra,data,event_id}')::uuid;
  perform pg_temp.check(17,pg_temp.refused(a) and pg_temp.refused(b) and pg_temp.ok(c) and (c#>>'{data,points}')::int=-5
      and pg_temp.ok(d) and (d#>>'{data,replayed}')::boolean and pg_temp.refused(e) and pg_temp.refused(f) and pg_temp.refused(g) and pg_temp.refused(h)
      and pg_temp.refused(b->'r1') and pg_temp.ok(e->'ra') and ev1b is not null
      and exists(select 1 from public.community_credit_events where reverses_event_id=ev1 and event_kind='correction' and points_delta_snapshot=-5
                 and reason='Attendance sheet did not list this resident' and verified_by=pun)
      and exists(select 1 from public.community_credit_events where id=ev1b and reaward_of_event_id=ev1 and points_delta_snapshot=5 and verified_by=sec)
      and (select count(*) from public.community_credit_events where reverses_event_id=ev1)=1,
    'reversal needs a different admin and a reason, happens once, cannot be reversed; re-award needs the explicit workflow and a third-party admin');

  -- ── TEST 18. A reversal frees annual-cap room; a capped participation can then be awarded.
  select e2.id into evo from public.community_credit_events e2 where e2.participation_activity_id=pg_temp.u('c25_1') and e2.resident_id=r_self and e2.event_kind='positive';
  a:=pg_temp.q(pun,format('select public.reverse_community_credit_award(%L,%L,''Duplicate sheet entry'')',gen_random_uuid(),evo));
  b:=pg_temp.q(sec,format('select public.award_community_credit_participation(%L,%L,%L)',gen_random_uuid(),pg_temp.u('c25_5'),r_self));
  c:=pg_temp.q(sec,format('select public.award_community_credit_participation(%L,%L,%L)',gen_random_uuid(),pg_temp.u('c25_6'),r_self));
  perform pg_temp.check(18,pg_temp.ok(a) and b#>>'{data,state}'='awarded' and c#>>'{data,state}'='capped'
      and (select sum(e2.points_delta_snapshot) from public.community_credit_events e2 join public.community_credit_activities a2 on a2.id=e2.participation_activity_id
           where e2.resident_id=r_self and e2.rule_id=(rules->>'CLEANUP_DRIVE')::uuid and a2.cap_year=2025)=20,
    'cap room freed by a reversal is used by the next award, still never above 20 in 2025');

  -- ── TEST 19. Resident correction requests.
  req:=gen_random_uuid();
  a:=pg_temp.q(res,format('select public.submit_community_credit_correction_request(%L,''award_correction'',%L,null,''The re-award date looks wrong to me.'')',req,ev1b));
  b:=pg_temp.q(res,format('select public.submit_community_credit_correction_request(%L,''award_correction'',%L,null,''The re-award date looks wrong to me.'')',req,ev1b));
  c:=pg_temp.q(res,format('select public.submit_community_credit_correction_request(%L,''award_correction'',%L,null,''Not mine but trying anyway.'')',gen_random_uuid(),
       (select id from public.community_credit_events where resident_id=r_other and policy_id=v2 limit 1)));
  d:=pg_temp.q(res,format('select public.submit_community_credit_correction_request(%L,''award_correction'',%L,null,''Second open request on one award.'')',gen_random_uuid(),ev1b));
  e:=pg_temp.q(res,format('select public.submit_community_credit_correction_request(%L,''missing_activity'',null,%L,''I attended but no points were recorded.'')',gen_random_uuid(),
       (select reference from public.community_credit_activities where id=act1)));
  f:=pg_temp.q(kag,'select public.community_credit_correction_requests_admin(null)');
  g:=pg_temp.q(res2,'select public.my_community_credit_correction_requests()');
  h:=pg_temp.q(sec,'select public.community_credit_correction_requests_admin(''submitted'')');
  perform pg_temp.check(19,pg_temp.ok(a) and pg_temp.ok(b) and (b#>>'{data,replayed}')::boolean and pg_temp.refused(c) and not pg_temp.ok(d) and pg_temp.ok(e)
      and pg_temp.refused(f,'42501') and pg_temp.ok(g) and jsonb_array_length(g->'data')=0 and jsonb_array_length(h->'data')=2
      and pg_temp.refused(pg_temp.q(res,'select public.community_credit_correction_requests_admin(null)'),'42501')
      and exists(select 1 from public.community_credit_correction_requests where request_kind='missing_activity' and activity_id=act1),
    'correction requests: own records only, idempotent, one open per award, private to the resident and records administrators');

  -- ── TEST 20. Resolution is reasoned, independent of the award recorder, and changes no points.
  x:=(a#>>'{data,correction_request_id}')::uuid;
  n:=(select sum(points_delta_snapshot) from public.community_credit_events where resident_id=r_self and policy_id=v2);
  a:=pg_temp.q(sec,format('select public.resolve_community_credit_correction_request(%L,''approved'',''checked the sheet'')',x));
  b:=pg_temp.q(pun,format('select public.resolve_community_credit_correction_request(%L,''approved'','' '')',x));
  c:=pg_temp.q(pun,format('select public.resolve_community_credit_correction_request(%L,''approved'',''Checked against sheet No. 12'')',x));
  d:=pg_temp.q(sec,format('select public.resolve_community_credit_correction_request(%L,''declined'',''again'')',x));
  e:=pg_temp.q(res,'select public.my_community_credit_correction_requests()');
  perform pg_temp.check(20,pg_temp.refused(a) and pg_temp.refused(b) and pg_temp.ok(c) and not (c#>>'{data,points_changed}')::boolean and pg_temp.refused(d)
      and n=(select sum(points_delta_snapshot) from public.community_credit_events where resident_id=r_self and policy_id=v2)
      and jsonb_path_exists(e->'data','$[*] ? (@.status == "approved" && @.resolution_reason == "Checked against sheet No. 12")'),
    'resolution: not by the award recorder, needs a reason, once only, no automatic points change, visible to the resident');

  -- ── TEST 21. Records are immutable and private.
  begin update public.community_credit_events set note='x' where id=ev1; n:=1; exception when others then n:=0; end;
  i:=n;
  begin update public.community_credit_participations set state='verified',active_award_event_id=null where activity_id=act1 and resident_id=r_self; n:=1; exception when others then n:=0; end;
  i:=i+n;
  begin delete from public.community_credit_participations where activity_id=act1 and resident_id=r_plain; n:=1; exception when others then n:=0; end;
  i:=i+n;
  begin update public.community_credit_correction_requests set message='rewritten message text' where id=x; n:=1; exception when others then n:=0; end;
  i:=i+n;
  begin insert into public.community_credit_events(resident_id,policy_id,rule_id,event_kind,rule_code_snapshot,rule_title_snapshot,points_delta_snapshot,source_type,verified_by,verified_at,participation_activity_id,participation_resident_id)
    values(r_plain,v2,(rules->>'CLEANUP_DRIVE')::uuid,'positive','-','-',1,'community_activity',sec,now(),act1,r_plain); n:=1; exception when others then n:=0; end;
  i:=i+n;
  begin update public.community_credit_transitions set note='rewritten transition note' where id=tr; n:=1; exception when others then n:=0; end;
  i:=i+n;
  perform pg_temp.check(21,i=0
      and pg_temp.refused(pg_temp.q(sec,'select to_jsonb(count(*)) from public.community_credit_participations'),'42501')
      and pg_temp.refused(pg_temp.q(res,'select to_jsonb(count(*)) from public.community_credit_correction_requests'),'42501')
      and pg_temp.refused(pg_temp.as_actor(null,'anon','select to_jsonb(count(*)) from public.community_credit_activities'),'42501')
      and pg_temp.refused(pg_temp.q(pun,'select to_jsonb(count(*)) from public.community_credit_requests'),'42501'),
    'ledger, participations, corrections, transitions immutable outside the workflow even for trusted SQL; no client table privilege');

  -- ── TEST 22. New and reactivated residents enroll in V2 at 0.
  -- Guarded, so the negative control (060's V1-only enrollment raises here) records a failure instead of aborting.
  begin insert into public.barangay_residents(id,first_name,last_name,purok,resident_status) values(pg_temp.u('r_later'),'P067','Later','P067 Area','active');
  exception when others then null; end;
  begin update public.barangay_residents set resident_status='active' where id=r_inactive; exception when others then null; end;
  perform pg_temp.check(22,exists(select 1 from public.community_credit_enrollments where resident_id=pg_temp.u('r_later') and policy_id=v2 and starting_score=0 and enrollment_source='resident_created')
      and exists(select 1 from public.community_credit_enrollments where resident_id=r_inactive and policy_id=v2 and starting_score=0 and enrollment_source='resident_reactivated'),
    'resident creation and reactivation enroll in the active participation policy at 0');

  -- ── TEST 23. Aggregate: ordinary officials see milestone buckets with small counts suppressed.
  a:=pg_temp.q(kag,'select public.community_credit_aggregate()');
  perform pg_temp.check(23,pg_temp.ok(a) and (a#>>'{data,available}')::boolean and jsonb_array_length(a#>'{data,buckets}')=6
      and not jsonb_path_exists(a->'data','$.buckets[*] ? (@.residents >= 1 && @.residents <= 2)')
      and (select count(*) from jsonb_array_elements(a#>'{data,buckets}') b2 where (b2->>'suppressed')::boolean) <> 1
      and position(r_self::text in a::text)=0 and position('P067 Self' in a::text)=0
      and pg_temp.refused(pg_temp.q(res,'select public.community_credit_aggregate()'),'42501')
      and pg_temp.refused(pg_temp.as_actor(null,'anon','select public.community_credit_aggregate()'),'42501'),
    'aggregate: buckets only, no 1-2 counts, never exactly one suppressed bucket, no identities; residents and anon refused');

  -- ── TEST 24. V1 functions cannot change V2 state or add punitive rules to it.
  a:=pg_temp.q(sec,format('select to_jsonb(public.retire_community_credit_policy(%L))',v2));
  b:=pg_temp.q(sec,format('select public.activate_community_credit_policy(%L)',v1b));
  c:=pg_temp.q(sec,format('select to_jsonb(public.save_community_credit_rule(null,%L,''LATE_NEG'',''x'','''',''negative'',''incident_outcome'',-5,false))',v2));
  begin insert into public.community_credit_rules(policy_id,rule_code,title,category,source_domain,points_delta,created_by,updated_by)
    values(v2,'TRUSTED_NEG','x','negative','incident_outcome',-5,sec,sec); n:=1; exception when others then n:=0; end;
  perform pg_temp.check(24,pg_temp.refused(a) and pg_temp.refused(b) and pg_temp.refused(c) and n=0
      and (select status from public.community_credit_policies where id=v2)='active',
    'V1 retire/activate cannot bypass the two-person transition; no punitive rule can be added to V2, even in trusted SQL');

  -- ── TEST 25. 062 compatibility (when 062 is installed): its credit block still computes for V2.
  if to_regprocedure('public.barangay_safety_analytics(date,date,text,text,text)') is not null then
    a:=pg_temp.q(sec,'select public.barangay_safety_analytics(null,null,null,null,''all'')');
    perform pg_temp.check(25,pg_temp.ok(a) and (a#>>'{data,community_credit,configured}')::boolean
        and a#>'{data,community_credit,starting_score_distribution}'=jsonb_build_array(jsonb_build_object('score',0,'residents',
          (select count(*) from public.community_credit_enrollments where policy_id=v2))),
      '062 analytics still works: V2 starting scores all 0');
  else
    perform pg_temp.check(25,true,'062 not installed in this database: compatibility not applicable');
  end if;

  -- ── TEST 26. Emergency restore: two people; V1 back with its score; V2 kept read-only.
  n:=(select count(*) from public.community_credit_events where policy_id=v2);
  a:=pg_temp.q(pun,format('select public.prepare_community_credit_transition(%L,''P067 emergency restore rehearsal'')',v1));
  tr2:=(a#>>'{data,transition_id}')::uuid;
  b:=pg_temp.q(pun,format('select public.approve_community_credit_transition(%L,''RESTORE PREVIOUS POLICY'')',tr2));
  c:=pg_temp.q(sec,format('select public.approve_community_credit_transition(%L,''RESTORE PREVIOUS POLICY'')',tr2));
  d:=pg_temp.q(res,'select public.my_community_credit_profile()');
  e:=pg_temp.q(sec,format('select public.award_community_credit_participation(%L,%L,%L)',gen_random_uuid(),pg_temp.u('c25_6'),r_self));
  f:=pg_temp.q(pun,format('select public.reverse_community_credit_award(%L,%L,''after restore'')',gen_random_uuid(),ev1b));
  g:=pg_temp.q(res,'select public.my_community_credit_policy_history()');
  perform pg_temp.check(26,pg_temp.ok(a) and a#>>'{data,transition_kind}'='emergency_restore_previous_policy' and pg_temp.refused(b) and pg_temp.ok(c)
      and (select status from public.community_credit_policies where id=v1)='active' and (select status from public.community_credit_policies where id=v2)='retired'
      and (d#>>'{data,profile,current_score}')::int=95 and d#>>'{data,profile,policy_model}'='legacy_v1' and t=pg_temp.fp_v1(v1)
      and exists(select 1 from public.community_credit_enrollments where policy_id=v1 and resident_id=pg_temp.u('r_later') and starting_score=100 and enrollment_source='policy_transition')
      and pg_temp.refused(e) and pg_temp.refused(f) and n=(select count(*) from public.community_credit_events where policy_id=v2)
      and jsonb_path_exists(g#>'{data,policies}',format('$[*] ? (@.policy_id == "%s" && @.points_total == 30)',v2)::jsonpath),
    'restore: self-approval refused; V1 active with score 95 and its rows unchanged; V2 retired, frozen and kept as history');

  -- ── TEST 27. Security catalog: SECURITY DEFINER, empty search_path, no PUBLIC/anon EXECUTE, private helpers.
  perform pg_temp.check(27,
    (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'] and not has_function_privilege('anon',p.oid,'execute')
       and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.grantee=0))
     from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in (
      'community_credit_v2_prototype_rules','save_community_credit_v2_policy','approve_community_credit_v2_policy','save_community_credit_v2_rule',
      'approve_community_credit_v2_rule','create_community_credit_activity','community_credit_activities_list','verify_community_credit_participation',
      'award_community_credit_participation','reverse_community_credit_award','reaward_community_credit_participation','submit_community_credit_correction_request',
      'my_community_credit_correction_requests','community_credit_correction_requests_admin','resolve_community_credit_correction_request',
      'community_credit_policy_history','my_community_credit_policy_history','community_credit_aggregate','community_credit_transition_preflight',
      'prepare_community_credit_transition','approve_community_credit_transition','cancel_community_credit_transition','community_credit_record_award',
      'community_credit_check_participant','community_credit_request_claim','community_credit_request_finish','community_credit_v2_writer',
      'community_credit_profile','community_credit_may_view_resident','community_credit_guard_event','community_credit_enroll_resident'))
    and (select bool_and(not has_function_privilege('authenticated',p.oid,'execute')) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in (
      'community_credit_record_award','community_credit_check_participant','community_credit_request_claim','community_credit_request_finish',
      'community_credit_v2_writer','community_credit_v2_writer_on','community_credit_activity_reference','community_credit_milestone',
      'community_credit_milestones','community_credit_correction_json','community_credit_enroll_resident','community_credit_guard_event'))
    and (select bool_and(c.relrowsecurity and not has_table_privilege('authenticated',c.oid,'select,insert,update,delete')
        and not has_table_privilege('anon',c.oid,'select,insert,update,delete'))
      from pg_class c where c.relnamespace='public'::regnamespace and c.relname like 'community\_credit\_%' and c.relkind='r'),
    'catalog: definer functions with empty search_path, no PUBLIC or anon EXECUTE, internal helpers private, every credit table RLS with no client privilege');

  -- ── TEST 28. Audit entries carry the caller's identity and no resident name.
  perform pg_temp.check(28,(select count(*) from public.activity_log where entity_type in ('community_credit_activity','community_credit_award','community_credit_correction','community_credit_transition'))>0
      and not exists(select 1 from public.activity_log where entity_type like 'community_credit%' and (subject like '%P067%' or actor_id is null)),
    'audit rows are stamped with the official and name no resident');
end;
$tests$;

reset role;
do $report$
declare failed text;
begin
  select string_agg(format('TEST %s FAILED: %s',test,label),E'\n' order by test) into failed from t067_results where not ok;
  if current_setting('t067.mode',true)='negctrl' then
    raise notice 'NEGATIVE CONTROL failing tests: %',coalesce((select string_agg(test::text,',' order by test) from t067_results where not ok),'none');
  elsif failed is not null then
    raise exception E'%',failed;
  else
    raise notice 'PASS: all % migration-067 contracts passed; transaction will now roll back.',(select count(*) from t067_results);
  end if;
end $report$;
rollback;
