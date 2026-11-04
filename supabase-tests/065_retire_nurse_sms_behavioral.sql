-- Migration 065 behavioral acceptance harness. SYNTHETIC DATA ONLY.
--
-- DO NOT RUN THIS FILE DIRECTLY: its preamble marker is replaced by
-- 065_build_test_runner.mjs with the migration's own DO body (pg_temp.m065_run), the
-- rollback contingency's own DO body (pg_temp.m065_rollback) and the assertion function.
-- Run directly, it fails at the first call with "function pg_temp.check does not exist".
--
-- Run ONLY against the disposable local test database holding migrations 001-063 and
-- NOT 065 (064 may or may not be present). Everything happens in ONE transaction that
-- ends in ROLLBACK, and a precondition refuses any database holding a non-synthetic
-- Auth user, so no fixture can persist and the harness cannot touch production data.
--
-- Fixtures: ids f0650000-..., emails @nurse-sms-065-test.invalid, text "Nurse065 ...".
--
-- Acceptance:        node supabase-tests/065_build_test_runner.mjs           | psql ...
-- Negative control:  node supabase-tests/065_build_test_runner.mjs --negctrl | psql ...
--   (m065_run does nothing: every guard test G1-G6, the definition tests A2/A5, the
--    nurse denials N1, N3, N4 and N6-N12, the service-role denials S1/S2 and the
--    rollback round trip R2-R3 must report NEGCTRL failures, while the baseline B, the
--    positive guard control G7, the attribute/privilege/history/idempotency tests
--    A1/A3/A4/H1/I1, the official tests O1-O8, the other-caller denials D1-D5 and the
--    rollback's own acknowledgement guard R1 still pass.
--    N2 and N5 also pass without 065, and that is correct: they ask for the nurse on
--    an ANNOUNCEMENT source, which 058 already refused. They stay in the suite as
--    regression guards that 065 does not open the announcement path, but they are not
--    evidence that the 065 fix is present. Observed on 2026-11-02.)
begin;

set local timezone = 'UTC';

-- @@065_TEST_PREAMBLE@@

create function pg_temp.clear_actor() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  reset role;
end; $$;

create function pg_temp.set_actor(p_id uuid, p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_id::text, ''), true);
  perform set_config('request.jwt.claims', case when p_id is null then jsonb_build_object('role', p_role)::text
    else jsonb_build_object('sub', p_id, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
end; $$;

-- One statement AS the caller -> {"state": SQLSTATE or "00000", "data": result}.
-- The role switch sits outside the inner exception block (so a refusal cannot leave the
-- next probe running as this caller) and the identity is cleared afterwards.
create function pg_temp.as_actor(p_id uuid, p_role text, p_sql text) returns jsonb language plpgsql as $$
declare v_result jsonb; v_state text := '00000';
begin
  perform pg_temp.set_actor(p_id, p_role);
  begin
    execute p_sql into v_result;
  exception when others then
    v_state := sqlstate; v_result := null;
  end;
  perform pg_temp.clear_actor();
  return jsonb_build_object('state', v_state, 'data', v_result);
end; $$;

-- Runs one statement as the table owner and returns the error message, or null.
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  perform pg_temp.clear_actor();
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end; $$;

-- Everything about sms_may_manage that 065 must keep, plus a hash of its body.
create function pg_temp.fn_state() returns jsonb language sql as $$
  select jsonb_build_object('src', md5(p.prosrc), 'owner', p.proowner::regrole::text, 'secdef', p.prosecdef,
    'volatility', p.provolatile, 'config', p.proconfig, 'acl', coalesce(p.proacl::text, '<default>'),
    'language', l.lanname, 'returns', p.prorettype::regtype::text, 'args', pg_get_function_identity_arguments(p.oid))
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.oid = 'public.sms_may_manage(text,uuid)'::regprocedure $$;

-- R2 only: the body hash with CRLF normalised to LF, and nothing else normalised. A
-- database built from a Windows checkout stores 058's body with CRLF line endings; the
-- builder reads the rollback with LF, so the restored body differs from the original
-- by carriage returns alone. Every other character, and every attribute in
-- fn_state(), is still compared exactly.
create function pg_temp.fn_src_lf() returns text language sql as $$
  select md5(replace(p.prosrc, chr(13) || chr(10), chr(10)))
  from pg_proc p where p.oid = 'public.sms_may_manage(text,uuid)'::regprocedure $$;

-- Content fingerprint of the SMS history and the audit trail.
create function pg_temp.fp_sms() returns text language sql as $$
  select md5(coalesce(string_agg(x, ',' order by x), '')) from (
    select 'b:' || md5(t::text) x from public.sms_broadcasts t
    union all select 'r:' || md5(t::text) from public.sms_broadcast_recipients t
    union all select 's:' || md5(t::text) from public.sms_source_rules t
    union all select 'a:' || md5(t::text) from public.activity_log t) s $$;

-- The ten SMS functions that call sms_may_manage, and their ACLs.
create function pg_temp.callers_acl() returns text language sql as $$
  select string_agg(f || '=' || coalesce(p.proacl::text, '<default>'), ',' order by f)
  from unnest(array['public.sms_require_manager(text)','public.sms_audience_options(text)',
    'public.sms_preview(text,text,jsonb,jsonb)','public.sms_save_rule(text,text,jsonb)',
    'public.sms_prepare_broadcast(text,text,text,jsonb,text,uuid,boolean)','public.sms_broadcast_state(uuid)',
    'public.sms_source_history(text,text)','public.sms_send_context(uuid)','public.sms_claim_batch(uuid,uuid)',
    'public.sms_finish_attempt(uuid,uuid,text,text,text)']) f
  left join pg_proc p on p.oid = to_regprocedure(f) $$;

create function pg_temp.body_mentions_nurse() returns boolean language sql as $$
  select prosrc ~* 'nurse' from pg_proc where oid = 'public.sms_may_manage(text,uuid)'::regprocedure $$;

-- A guard case: optional setup statements separated by @@NEXT@@, then one migration run,
-- all inside a subtransaction that is always rolled back. Returns the refusal message
-- (null if it was NOT refused) and whether the function and the SMS history are unchanged.
create function pg_temp.guard_case(p_setup text) returns jsonb language plpgsql as $$
declare v_fn jsonb := pg_temp.fn_state(); v_sms text := pg_temp.fp_sms(); v_msg text; v_stmt text;
begin
  begin
    perform pg_temp.clear_actor();
    if p_setup is not null then
      foreach v_stmt in array string_to_array(p_setup, '@@NEXT@@') loop execute v_stmt; end loop;
    end if;
    perform pg_temp.m065_run();
    raise exception using errcode = 'P0065', message = 'not refused';
  exception when others then
    v_msg := case when sqlstate = 'P0065' then null else sqlerrm end;
  end;
  perform pg_temp.clear_actor();
  return jsonb_build_object('message', v_msg, 'unchanged', pg_temp.fn_state() = v_fn and pg_temp.fp_sms() = v_sms);
end; $$;

-- Preconditions: a disposable database, 063 in place, 065 not yet applied. ----------
do $precondition$
begin
  if exists (select 1 from auth.users where coalesce(email, '') not like '%.invalid') then
    raise exception 'SETUP PRECONDITION FAILED: a non-synthetic Auth user exists; run only on the disposable test database';
  end if;
  if has_function_privilege('anon', 'public.get_reservation_slots(date)', 'EXECUTE') then
    raise exception 'SETUP PRECONDITION FAILED: migration 063 is not applied to this test database';
  end if;
  if not pg_temp.body_mentions_nurse() then
    raise exception 'SETUP PRECONDITION FAILED: sms_may_manage is not the 058 definition (065 already applied?)';
  end if;
  if not pg_has_role(current_user, 'service_role', 'MEMBER') then
    raise exception 'SETUP PRECONDITION FAILED: % cannot SET ROLE service_role, so the worker RPCs cannot be exercised', current_user;
  end if;
end $precondition$;

-- Fixtures (written as the table owner, the maintenance path). -----------------------
create temp table t065(k text primary key, id uuid not null);
insert into t065 values
 ('official','f0650000-0000-4000-8000-000000000001'), ('nurse','f0650000-0000-4000-8000-000000000002'),
 ('resident','f0650000-0000-4000-8000-000000000003'), ('tanod','f0650000-0000-4000-8000-000000000004'),
 ('unlinked','f0650000-0000-4000-8000-000000000005'), ('archived','f0650000-0000-4000-8000-000000000006'),
 ('official_row','f0650000-0000-4000-8000-000000000011'), ('archived_row','f0650000-0000-4000-8000-000000000016'),
 ('resident_a','f0650000-0000-4000-8000-000000000021'), ('resident_b','f0650000-0000-4000-8000-000000000022'),
 ('announcement','f0650000-0000-4000-8000-000000000031'), ('health_event','f0650000-0000-4000-8000-000000000032'),
 ('program','f0650000-0000-4000-8000-000000000033'),
 ('nurse_broadcast','f0650000-0000-4000-8000-000000000041'), ('nurse_recipient','f0650000-0000-4000-8000-000000000042'),
 ('official_history','f0650000-0000-4000-8000-000000000043'), ('nurse_activity','f0650000-0000-4000-8000-000000000051');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select t.id,'authenticated','authenticated',t.k||'@nurse-sms-065-test.invalid','',now(),'{}','{}',now(),now()
from t065 t where t.k in ('official','nurse','resident','tanod','unlinked','archived') on conflict(id) do nothing;
insert into public.profiles(id,full_name,role) values
 ((select t.id from t065 t where t.k='official'),'Nurse065 Test Official','official'),
 ((select t.id from t065 t where t.k='nurse'),'Nurse065 Test Nurse','nurse'),
 ((select t.id from t065 t where t.k='resident'),'Nurse065 Test Resident','resident'),
 ((select t.id from t065 t where t.k='tanod'),'Nurse065 Test Tanod','tanod'),
 ((select t.id from t065 t where t.k='unlinked'),'Nurse065 Test Unlinked Official','official'),
 ((select t.id from t065 t where t.k='archived'),'Nurse065 Test Archived Official','official')
on conflict(id) do update set full_name=excluded.full_name, role=excluded.role;
insert into public.barangay_officials(id,full_name,position,committee,contact_number,display_order,created_by,archived_at,archived_by) values
 ((select t.id from t065 t where t.k='official_row'),'Nurse065 Test Official','Kagawad',null,null,906501,(select t.id from t065 t where t.k='official'),null,null),
 ((select t.id from t065 t where t.k='archived_row'),'Nurse065 Test Archived Official','Kagawad',null,null,906506,(select t.id from t065 t where t.k='official'),null,null);
update public.barangay_officials set archived_at = now() where id = (select t.id from t065 t where t.k='archived_row');
insert into public.official_account_links(official_id,profile_id,linked_by) values
 ((select t.id from t065 t where t.k='official_row'),(select t.id from t065 t where t.k='official'),'migration-065 behavioral test'),
 ((select t.id from t065 t where t.k='archived_row'),(select t.id from t065 t where t.k='archived'),'migration-065 behavioral test');

insert into public.barangay_residents(id,first_name,last_name,birth_date,mobile_number,purok,resident_status) values
 ((select t.id from t065 t where t.k='resident_a'),'Nurse065','Resident A','1950-01-01','09170000651','Nurse065 Purok','active'),
 ((select t.id from t065 t where t.k='resident_b'),'Nurse065','Resident B','1990-01-01','09170000652','Nurse065 Purok','active');

insert into public.announcements(id,title,description) values ((select t.id from t065 t where t.k='announcement'),'Nurse065 Test Announcement','Synthetic notice');
insert into public.health_events(id,title) values ((select t.id from t065 t where t.k='health_event'),'Nurse065 Test Health Event');
insert into public.medical_programs(id,title,schedule_label,time_label) values ((select t.id from t065 t where t.k='program'),'Nurse065 Test Program','Mondays','8:00 AM');

-- History that must survive 065 untouched: a nurse-created LIVE health broadcast that
-- has finished (no pending/attempting row, so it does not block the migration), the
-- nurse's audience rule, an official's dry-run broadcast and a nurse audit entry.
insert into public.sms_broadcasts(id,request_key,source_type,source_id,broadcast_kind,audience,message_text,preview_token,requested_by,dry_run) values
 ((select t.id from t065 t where t.k='nurse_broadcast'),gen_random_uuid(),'health_event',(select t.id::text from t065 t where t.k='health_event'),'initial',
  '{"type":"all_residents"}','Nurse065 historical health SMS','nurse065-token',(select t.id from t065 t where t.k='nurse'),false),
 ((select t.id from t065 t where t.k='official_history'),gen_random_uuid(),'announcement',(select t.id::text from t065 t where t.k='announcement'),'initial',
  '{"type":"all_residents"}','Nurse065 historical dry run','nurse065-dry-token',(select t.id from t065 t where t.k='official'),true);
insert into public.sms_broadcast_recipients(id,broadcast_id,resident_id,normalized_phone,status,reason,provider_message_id,attempted_at,completed_at) values
 ((select t.id from t065 t where t.k='nurse_recipient'),(select t.id from t065 t where t.k='nurse_broadcast'),(select t.id from t065 t where t.k='resident_a'),
  '639170000651','accepted',null,'nurse065-provider-id',now(),now());
insert into public.sms_source_rules(source_type,source_id,audience,updated_by)
values ('health_event',(select t.id::text from t065 t where t.k='health_event'),'{"type":"all_residents"}',(select t.id from t065 t where t.k='nurse'));
insert into public.activity_log(id,actor_id,actor_name,action,entity_type,entity_id,subject) values
 ((select t.id from t065 t where t.k='nurse_activity'),(select t.id from t065 t where t.k='nurse'),'Nurse065 Test Nurse','added','health_event',
  (select t.id from t065 t where t.k='health_event'),'Nurse065 historical entry');

do $tests$
declare
  off uuid := (select t.id from t065 t where t.k='official');
  nur uuid := (select t.id from t065 t where t.k='nurse');
  res uuid := (select t.id from t065 t where t.k='resident');
  tan uuid := (select t.id from t065 t where t.k='tanod');
  unl uuid := (select t.id from t065 t where t.k='unlinked');
  arc uuid := (select t.id from t065 t where t.k='archived');
  ann text := (select t.id::text from t065 t where t.k='announcement');
  hev text := (select t.id::text from t065 t where t.k='health_event');
  prg text := (select t.id::text from t065 t where t.k='program');
  nb uuid := (select t.id from t065 t where t.k='nurse_broadcast');
  nr uuid := (select t.id from t065 t where t.k='nurse_recipient');
  rb uuid := (select t.id from t065 t where t.k='resident_b');
  c_aud constant text := '{"type":"all_residents"}';
  c_draft constant text := '{"title":"Nurse065 draft","event_date":"2026-12-01","location":"Hall"}';
  r jsonb; g jsonb; msg text; v_who uuid; v_label text;
  baseline_official jsonb; before_fn jsonb; after_fn jsonb; before_src_lf text; before_sms text; before_callers text;
  tok text; bid uuid; batch jsonb;
  -- Probe SQL, as format() templates.
  q_options constant text := 'select public.sms_audience_options(%L)';
  q_preview_draft constant text := 'select public.sms_preview(%L,null,%L::jsonb,%L::jsonb)';
  q_preview_source constant text := 'select public.sms_preview(%L,%L,''{}''::jsonb,%L::jsonb)';
  q_save constant text := 'select to_jsonb(true) from public.sms_save_rule(%L,%L,%L::jsonb)';
  q_prepare constant text := 'select to_jsonb(public.sms_prepare_broadcast(%L,%L,''initial'',%L::jsonb,%L,gen_random_uuid(),%L::boolean))';
  q_state constant text := 'select public.sms_broadcast_state(%L::uuid)';
  q_history constant text := 'select public.sms_source_history(%L,%L)';
  q_context constant text := 'select to_jsonb(true) from public.sms_send_context(%L::uuid)';
  q_claim constant text := 'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.sms_claim_batch(%L::uuid,%L::uuid) x';
  q_finish constant text := 'select to_jsonb(true) from public.sms_finish_attempt(%L::uuid,%L::uuid,''accepted'',null,%L)';
begin
  perform pg_temp.check((select archived_at is not null from public.barangay_officials where id = (select t.id from t065 t where t.k='archived_row'))
    and (select count(*) from public.sms_broadcasts where id in (nb, (select t.id from t065 t where t.k='official_history'))) = 2,
    'SETUP FAILED: fixtures are not all present');

  ---------------------------------------------------------------------------------
  -- B. Baseline under 058: the hole is real and the official path works. If B1 fails,
  --    the denials below would prove nothing.
  ---------------------------------------------------------------------------------
  r := pg_temp.as_actor(nur, 'authenticated', format(q_preview_draft, 'health_event', c_draft, c_aud));
  perform pg_temp.check(r->>'state' = '00000',
    'TEST B1 FAILED (setup): under 058 a nurse should be able to preview a health SMS; state='||(r->>'state'));
  r := pg_temp.as_actor(off, 'authenticated', format(q_preview_source, 'announcement', ann, c_aud));
  perform pg_temp.check(r->>'state' = '00000' and r->'data' ? 'preview_token',
    'TEST B2 FAILED (setup): the linked official cannot preview an announcement SMS; state='||(r->>'state'));
  baseline_official := r->'data';

  ---------------------------------------------------------------------------------
  -- G. Every guard refuses, and a refusal leaves the function and the history unchanged.
  ---------------------------------------------------------------------------------
  g := pg_temp.guard_case(format(
    'insert into public.sms_broadcast_recipients(broadcast_id,resident_id,normalized_phone,status) values (%L,%L,''639170000652'',''pending'')', nb, rb));
  perform pg_temp.check(g->>'message' ilike '%pending or attempting%' and (g->>'unchanged')::boolean,
    'TEST G1 FAILED: a pending health-source recipient did not block 065: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(format(
    'insert into public.sms_broadcast_recipients(broadcast_id,resident_id,normalized_phone,status,attempted_at) values (%L,%L,''639170000652'',''attempting'',now())', nb, rb));
  perform pg_temp.check(g->>'message' ilike '%pending or attempting%' and (g->>'unchanged')::boolean,
    'TEST G2 FAILED: an attempting health-source recipient did not block 065: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(
    'create or replace function public.sms_may_manage(p_type text,p_actor uuid) returns boolean language sql stable security definer set search_path='''' as $x$ select p_type = ''announcement'' $x$');
  perform pg_temp.check(g->>'message' ilike '%unexpected definition%' and (g->>'unchanged')::boolean,
    'TEST G3 FAILED: an unexpected prior definition was overwritten: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case('alter function public.sms_may_manage(text,uuid) security invoker');
  perform pg_temp.check(g->>'message' ilike '%shape%' and (g->>'unchanged')::boolean,
    'TEST G4 FAILED: a changed security attribute was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case('grant execute on function public.get_reservation_slots(date) to anon');
  perform pg_temp.check(g->>'message' ilike '%063 is not applied%' and (g->>'unchanged')::boolean,
    'TEST G5 FAILED: a database without 063 was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case('select set_config(''request.jwt.claims'', ''{"role":"authenticated"}'', true)');
  perform pg_temp.check(g->>'message' ilike '%direct database connection%' and (g->>'unchanged')::boolean,
    'TEST G6 FAILED: an API caller was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  -- Positive control: finished live broadcasts and dry runs must NOT block it.
  g := pg_temp.guard_case(format(
    'insert into public.sms_broadcasts(id,request_key,source_type,source_id,broadcast_kind,audience,message_text,preview_token,requested_by,dry_run) values (''f0650000-0000-4000-8000-000000000044'',gen_random_uuid(),''medical_program'',%L,''initial'',%L::jsonb,''Nurse065 dry'',''t'',%L,true)'
    '@@NEXT@@insert into public.sms_broadcast_recipients(broadcast_id,resident_id,normalized_phone,status,reason,completed_at) values (''f0650000-0000-4000-8000-000000000044'',%L,''639170000652'',''dry_run'',''dry_run'',now())',
    prg, c_aud, nur, rb));
  perform pg_temp.check(g->>'message' is null,
    'TEST G7 FAILED: finished or dry-run health broadcasts wrongly blocked 065: '||coalesce(g->>'message','-'));

  ---------------------------------------------------------------------------------
  -- Apply 065.
  ---------------------------------------------------------------------------------
  before_fn := pg_temp.fn_state();
  before_src_lf := pg_temp.fn_src_lf();
  before_sms := pg_temp.fp_sms();
  before_callers := pg_temp.callers_acl();
  msg := pg_temp.try('select pg_temp.m065_run()');
  perform pg_temp.check(msg is null, 'TEST APPLY FAILED: 065 refused on a valid database: '||coalesce(msg,'-'));
  after_fn := pg_temp.fn_state();

  ---------------------------------------------------------------------------------
  -- A. The definition changed and nothing else about the function did.
  ---------------------------------------------------------------------------------
  perform pg_temp.check((after_fn - 'src') = (before_fn - 'src'),
    'TEST A1 FAILED: owner, SECURITY DEFINER, volatility, search_path, language, signature or ACL changed: '||(before_fn - 'src')::text||' -> '||(after_fn - 'src')::text);
  perform pg_temp.check(after_fn->>'src' <> before_fn->>'src' and not pg_temp.body_mentions_nurse(),
    'TEST A2 FAILED: sms_may_manage still carries the nurse branch');
  perform pg_temp.check(not has_function_privilege('anon','public.sms_may_manage(text,uuid)','EXECUTE')
    and not has_function_privilege('authenticated','public.sms_may_manage(text,uuid)','EXECUTE')
    and not has_function_privilege('service_role','public.sms_may_manage(text,uuid)','EXECUTE')
    and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     where p.oid = 'public.sms_may_manage(text,uuid)'::regprocedure and a.privilege_type = 'EXECUTE' and a.grantee = 0),
    'TEST A3 FAILED: sms_may_manage is directly executable by PUBLIC, a client role or service_role');
  perform pg_temp.check(pg_temp.callers_acl() = before_callers,
    'TEST A4 FAILED: a caller function''s privileges changed');
  perform pg_temp.check(public.sms_may_manage('announcement', off) and public.sms_may_manage('event', off)
    and not public.sms_may_manage('health_event', nur) and not public.sms_may_manage('medical_program', nur)
    and not public.sms_may_manage('announcement', nur) and not public.sms_may_manage('health_event', off),
    'TEST A5 FAILED: sms_may_manage answers are not official-announcement/event only');

  -- H. History untouched.
  perform pg_temp.check(pg_temp.fp_sms() = before_sms, 'TEST H1 FAILED: SMS history or the audit trail changed');

  -- I. Applying it again is safe and changes nothing.
  msg := pg_temp.try('select pg_temp.m065_run()');
  perform pg_temp.check(msg is null and pg_temp.fn_state() = after_fn and pg_temp.fp_sms() = before_sms,
    'TEST I1 FAILED: a second application failed or changed something: '||coalesce(msg,'-'));

  ---------------------------------------------------------------------------------
  -- N. The nurse is denied every SMS operation (42501, the function's own refusal).
  ---------------------------------------------------------------------------------
  for v_label, r in select * from (values
      ('N1 audience options (health)',        pg_temp.as_actor(nur,'authenticated',format(q_options,'health_event'))),
      ('N2 audience options (announcement)',  pg_temp.as_actor(nur,'authenticated',format(q_options,'announcement'))),
      ('N3 preview of a health draft',        pg_temp.as_actor(nur,'authenticated',format(q_preview_draft,'health_event',c_draft,c_aud))),
      ('N4 preview of a stored health event', pg_temp.as_actor(nur,'authenticated',format(q_preview_source,'health_event',hev,c_aud))),
      ('N5 preview of an announcement',       pg_temp.as_actor(nur,'authenticated',format(q_preview_source,'announcement',ann,c_aud))),
      ('N6 save an audience rule',            pg_temp.as_actor(nur,'authenticated',format(q_save,'health_event',hev,c_aud))),
      ('N7 prepare a dry run',                pg_temp.as_actor(nur,'authenticated',format(q_prepare,'health_event',hev,c_aud,'t',true))),
      ('N8 prepare a live broadcast',         pg_temp.as_actor(nur,'authenticated',format(q_prepare,'health_event',hev,c_aud,'t',false))),
      ('N9 read own broadcast state',         pg_temp.as_actor(nur,'authenticated',format(q_state,nb))),
      ('N10 read health SMS history',         pg_temp.as_actor(nur,'authenticated',format(q_history,'health_event',hev))),
      ('N11 send context (Edge gate)',        pg_temp.as_actor(nur,'authenticated',format(q_context,nb))),
      ('N12 medical program preview',         pg_temp.as_actor(nur,'authenticated',format(q_preview_source,'medical_program',prg,c_aud)))) v(l, x)
  loop
    perform pg_temp.check(r->>'state' = '42501', 'TEST '||v_label||' FAILED: the nurse was not refused (state '||(r->>'state')||')');
  end loop;

  ---------------------------------------------------------------------------------
  -- S. The worker RPCs, called with the service key exactly as the Edge Function does,
  --    refuse the nurse's broadcast and change nothing.
  ---------------------------------------------------------------------------------
  r := pg_temp.as_actor(null, 'service_role', format(q_claim, nb, nur));
  perform pg_temp.check(r->>'state' = '42501' and pg_temp.fp_sms() = before_sms,
    'TEST S1 FAILED: sms_claim_batch did not refuse the nurse broadcast (state '||(r->>'state')||')');
  r := pg_temp.as_actor(null, 'service_role', format(q_finish, nr, nur, 'nurse065-forged'));
  perform pg_temp.check(r->>'state' = '42501' and pg_temp.fp_sms() = before_sms,
    'TEST S2 FAILED: sms_finish_attempt did not refuse the nurse broadcast (state '||(r->>'state')||')');

  ---------------------------------------------------------------------------------
  -- O. A linked, active official keeps the whole announcement/event workflow.
  ---------------------------------------------------------------------------------
  r := pg_temp.as_actor(off, 'authenticated', format(q_options, 'announcement'));
  perform pg_temp.check(r->>'state' = '00000', 'TEST O1 FAILED: the official lost audience options (state '||(r->>'state')||')');
  r := pg_temp.as_actor(off, 'authenticated', format(q_preview_source, 'announcement', ann, c_aud));
  perform pg_temp.check(r->>'state' = '00000' and r->'data' = baseline_official,
    'TEST O2 FAILED: the official''s preview changed or was refused (state '||(r->>'state')||')');
  tok := r->'data'->>'preview_token';
  r := pg_temp.as_actor(off, 'authenticated', format(q_save, 'announcement', ann, c_aud));
  perform pg_temp.check(r->>'state' = '00000', 'TEST O3 FAILED: the official cannot save an announcement audience rule (state '||(r->>'state')||')');
  r := pg_temp.as_actor(off, 'authenticated', format(q_prepare, 'announcement', ann, c_aud, tok, true));
  perform pg_temp.check(r->>'state' = '00000', 'TEST O4 FAILED: the official cannot prepare a dry run (state '||(r->>'state')||')');
  r := pg_temp.as_actor(off, 'authenticated', format(q_prepare, 'announcement', ann, c_aud, tok, false));
  perform pg_temp.check(r->>'state' = '00000', 'TEST O5 FAILED: the official cannot prepare a live broadcast (state '||(r->>'state')||')');
  bid := (r->>'data')::uuid;
  r := pg_temp.as_actor(off, 'authenticated', format(q_context, bid));
  perform pg_temp.check(r->>'state' = '00000', 'TEST O5b FAILED: the official''s broadcast fails the send gate (state '||(r->>'state')||')');
  r := pg_temp.as_actor(null, 'service_role', format(q_claim, bid, off));
  batch := r->'data';
  perform pg_temp.check(r->>'state' = '00000' and jsonb_array_length(batch) >= 1,
    'TEST O6 FAILED: the worker cannot claim the official''s broadcast (state '||(r->>'state')||')');
  r := pg_temp.as_actor(null, 'service_role', format(q_finish, batch->0->>'recipient_id', off, 'nurse065-official-ok'));
  perform pg_temp.check(r->>'state' = '00000', 'TEST O6b FAILED: the worker cannot record the official''s outcome (state '||(r->>'state')||')');
  r := pg_temp.as_actor(off, 'authenticated', format(q_history, 'announcement', ann));
  perform pg_temp.check(r->>'state' = '00000' and jsonb_array_length(r->'data'->'broadcasts') >= 3,
    'TEST O7 FAILED: the official cannot read announcement SMS history (state '||(r->>'state')||')');
  r := pg_temp.as_actor(off, 'authenticated', format(q_preview_source, 'health_event', hev, c_aud));
  perform pg_temp.check(r->>'state' = '42501', 'TEST O8 FAILED: an official could manage a health source');

  ---------------------------------------------------------------------------------
  -- D. Residents, Tanod, unlinked and archived officials, and anonymous callers stay out.
  ---------------------------------------------------------------------------------
  for v_label, v_who in select * from (values ('D1 resident', res), ('D2 tanod', tan),
      ('D3 unlinked official', unl), ('D4 archived official', arc)) v(l, w)
  loop
    r := pg_temp.as_actor(v_who, 'authenticated', format(q_preview_source, 'announcement', ann, c_aud));
    perform pg_temp.check(r->>'state' = '42501', 'TEST '||v_label||' FAILED: preview not refused (state '||(r->>'state')||')');
    r := pg_temp.as_actor(v_who, 'authenticated', format(q_prepare, 'announcement', ann, c_aud, tok, true));
    perform pg_temp.check(r->>'state' = '42501', 'TEST '||v_label||' FAILED: prepare not refused (state '||(r->>'state')||')');
  end loop;
  r := pg_temp.as_actor(null, 'anon', format(q_preview_source, 'announcement', ann, c_aud));
  perform pg_temp.check(r->>'state' = '42501', 'TEST D5 FAILED: an anonymous caller reached sms_preview (state '||(r->>'state')||')');

  ---------------------------------------------------------------------------------
  -- R. The rollback contingency: refused without the acknowledgement; with it, it
  --    restores 058 exactly (reopening the nurse path); 065 then closes it again.
  ---------------------------------------------------------------------------------
  msg := pg_temp.try('select pg_temp.m065_rollback()');
  perform pg_temp.check(msg ilike '%acknowledgement%' and pg_temp.fn_state() = after_fn,
    'TEST R1 FAILED: the rollback ran without its acknowledgement: '||coalesce(msg,'NOT REFUSED'));
  perform set_config('barangay.m065_rollback_ack', 'I approve reopening the nurse SMS permission', true);
  msg := pg_temp.try('select pg_temp.m065_rollback()');
  perform set_config('barangay.m065_rollback_ack', '', true);
  r := pg_temp.as_actor(nur, 'authenticated', format(q_preview_draft, 'health_event', c_draft, c_aud));
  -- The body is compared after CRLF -> LF only (see fn_src_lf); owner, ACL, SECURITY
  -- DEFINER, volatility, search_path, language and signature are compared exactly.
  perform pg_temp.check(msg is null and (pg_temp.fn_state() - 'src') = (before_fn - 'src')
      and pg_temp.fn_src_lf() = before_src_lf and r->>'state' = '00000',
    'TEST R2 FAILED: the acknowledged rollback did not restore 058 exactly: '||coalesce(msg,'-'));
  msg := pg_temp.try('select pg_temp.m065_run()');
  r := pg_temp.as_actor(nur, 'authenticated', format(q_preview_draft, 'health_event', c_draft, c_aud));
  perform pg_temp.check(msg is null and pg_temp.fn_state() = after_fn and r->>'state' = '42501',
    'TEST R3 FAILED: re-applying 065 after a rollback did not close the nurse path again: '||coalesce(msg,'-'));

  raise notice 'PASS: migration 065 behavioral harness complete';
end
$tests$;

rollback;
