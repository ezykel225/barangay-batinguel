-- Migration 064 behavioral acceptance harness. SYNTHETIC DATA ONLY.
--
-- DO NOT RUN THIS FILE DIRECTLY: its preamble marker is replaced by
-- 064_build_test_runner.mjs with the migration's own DO body (as pg_temp.m064_run),
-- the configuration exactly as shipped, and the assertion function. Run directly, it
-- fails at the first call with "function pg_temp.m064_run does not exist".
--
-- Run ONLY against the disposable local test database holding migrations 001-063
-- (062 included). Everything happens in ONE transaction that ends in ROLLBACK, and a
-- precondition refuses any database holding a non-synthetic Auth user, so no fixture
-- can persist and the harness cannot run against production data.
--
-- Fixtures: ids f0640000-..., emails @legacy-064-test.invalid, text "Legacy Test ...".
--
-- Acceptance:        node supabase-tests/064_build_test_runner.mjs           | psql ...
-- Negative control:  node supabase-tests/064_build_test_runner.mjs --negctrl | psql ...
--   (m064_run does nothing; every guard test and the two removal tests must report
--    NEGCTRL failures, while every preservation and regression test still passes.)
begin;

set local timezone = 'UTC';

-- @@064_TEST_PREAMBLE@@

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
-- The role switch sits outside the inner exception block (so a refusal cannot
-- leave the next probe running as this caller) and the identity is cleared after.
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

-- Content fingerprint of every public table not excluded, plus auth.users, plus (when
-- the notification tables are excluded) their NON-reservation subsets.
create function pg_temp.fp(p_exclude text[]) returns jsonb language plpgsql as $$
declare v jsonb := '{}'; r regclass; f text;
begin
  for r in select c.oid::regclass from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r','p') and c.relname <> all(p_exclude) order by 1 loop
    execute format('select count(*)||'':''||coalesce(md5(string_agg(md5(t::text), '''' order by md5(t::text))), ''-'') from %s t', r) into f;
    v := v || jsonb_build_object(r::text, f);
  end loop;
  select count(*)||':'||coalesce(md5(string_agg(md5(t::text), '' order by md5(t::text))), '-') into f from auth.users t;
  v := v || jsonb_build_object('auth.users', f);
  if 'notifications' = any(p_exclude) then
    select count(*)||':'||coalesce(md5(string_agg(md5(t::text), '' order by md5(t::text))), '-') into f
      from public.notifications t where t.category <> 'reservation';
    v := v || jsonb_build_object('notifications(non-reservation)', f);
    select count(*)||':'||coalesce(md5(string_agg(md5(t::text), '' order by md5(t::text))), '-') into f
      from public.notification_reads t
     where exists (select 1 from public.notifications n where n.id = t.notification_id and n.category <> 'reservation');
    v := v || jsonb_build_object('notification_reads(non-reservation)', f);
  end if;
  return v;
end; $$;

create function pg_temp.fp_all() returns jsonb language sql as $$ select pg_temp.fp('{}'::text[]) $$;
create function pg_temp.fp_retained() returns jsonb language sql as $$
  select pg_temp.fp(array['reservations','medical_programs','health_events','medicine_stock','nurse_availability',
                          'waste_schedule','notifications','notification_reads']) $$;

-- A complete, VALID synthetic approval configuration whose expected counts are read
-- from the database at call time; a test overrides one key to break one gate.
create function pg_temp.cfg(p_over jsonb default '{}') returns jsonb language plpgsql as $$
declare v_notif uuid[] := array(select id from public.notifications where category = 'reservation');
begin
  return jsonb_build_object(
    'approved_by', 'Synthetic Test Approver (064 harness)',
    'retention_authorization', 'SYNTHETIC-RETENTION-AUTHORIZATION-064',
    'booking_resolution', 'SYNTHETIC-BOOKING-RESOLUTION-064',
    'export_manifest_sha256', md5('legacy-064-a') || md5('legacy-064-b'),
    'restore_rehearsal', 'SYNTHETIC-RESTORE-REHEARSAL-064',
    'counts_taken_on', to_char((now() at time zone 'Asia/Manila')::date, 'YYYY-MM-DD'),
    'expected_reservation_notification_reads', (select count(*) from public.notification_reads where notification_id = any(v_notif))::text,
    'expected_reservation_notifications', cardinality(v_notif)::text,
    'expected_reservations', (select count(*) from public.reservations)::text,
    'expected_medical_programs', (select count(*) from public.medical_programs)::text,
    'expected_health_events', (select count(*) from public.health_events)::text,
    'expected_medicine_stock', (select count(*) from public.medicine_stock)::text,
    'expected_nurse_availability', (select count(*) from public.nurse_availability)::text,
    'expected_waste_schedule', (select count(*) from public.waste_schedule)::text) || p_over;
end; $$;

-- A guard case: optional setup statements separated by @@NEXT@@ (rolled back with the attempt), a configuration
-- (shipped, or valid with overrides), one migration run. Returns the refusal message
-- (null if it was NOT refused) and whether every table is unchanged afterwards.
create function pg_temp.guard_case(p_setup text, p_cfg jsonb) returns jsonb language plpgsql as $$
declare v_before jsonb := pg_temp.fp_all(); v_msg text; v_cfg jsonb; v_stmt text;
begin
  begin
    perform pg_temp.clear_actor();
    v_cfg := coalesce(p_cfg, pg_temp.cfg());
    if p_setup is not null then
      foreach v_stmt in array string_to_array(p_setup, '@@NEXT@@') loop execute v_stmt; end loop;
    end if;
    if p_cfg is null then v_cfg := pg_temp.cfg(); end if;  -- recount after setup
    perform pg_temp.m064_run(v_cfg);
    raise exception using errcode = 'P0064', message = 'not refused';
  exception when others then
    v_msg := case when sqlstate = 'P0064' then null else sqlerrm end;
  end;
  perform pg_temp.clear_actor();
  return jsonb_build_object('message', v_msg, 'unchanged', pg_temp.fp_all() = v_before);
end; $$;

-- Retained-service probes, read-only, compared before and after the migration.
create function pg_temp.probe(p_ref text, p_sec uuid, p_res uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'track_right',   pg_temp.as_actor(null, 'anon', format('select to_jsonb(count(*)) from public.track_complaint(%L,%L)', lower(p_ref), '0917 555 0640')),
    'track_wrong',   pg_temp.as_actor(null, 'anon', format('select to_jsonb(count(*)) from public.track_complaint(%L,%L)', p_ref, '09990000000')),
    'case_search',   pg_temp.as_actor(p_sec, 'authenticated', 'select to_jsonb(count(*)) from public.search_case_residents(''Legacy Test Voter'')'),
    'people_search', pg_temp.as_actor(p_sec, 'authenticated', 'select to_jsonb(count(*)) from public.search_people(''Legacy Test'')'),
    'tanod',         pg_temp.as_actor(p_sec, 'authenticated', 'select to_jsonb(count(*)) from public.tanod_roster(true)'),
    'analytics',     pg_temp.as_actor(p_sec, 'authenticated', 'select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.barangay_safety_analytics() x') - 'data',
    'credit_admin',  pg_temp.as_actor(p_sec, 'authenticated', 'select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.community_credit_admin_state() x') - 'data',
    'credit_mine',   pg_temp.as_actor(p_res, 'authenticated', 'select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.my_community_credit_profile() x') - 'data',
    'docs_visible',  pg_temp.as_actor(p_sec, 'authenticated', 'select to_jsonb(count(*)) from public.document_requests')) $$;

-- Preconditions: a disposable database only, and 063 in place. ---------------------
do $precondition$
begin
  if exists (select 1 from auth.users where coalesce(email, '') not like '%.invalid') then
    raise exception 'SETUP PRECONDITION FAILED: a non-synthetic Auth user exists; run only on the disposable test database';
  end if;
  if exists (select 1 from public.barangay_officials where archived_at is null and position = 'Barangay Secretary') then
    raise exception 'SETUP PRECONDITION FAILED: the Barangay Secretary position already has an active holder';
  end if;
  if has_function_privilege('anon', 'public.get_reservation_slots(date)', 'EXECUTE') then
    raise exception 'SETUP PRECONDITION FAILED: migration 063 is not applied to this test database';
  end if;
end $precondition$;

-- Fixtures (written as the table owner, the maintenance path). ---------------------
create temp table t064(k text primary key, id uuid not null);
insert into t064 values
 ('resident','f0640000-0000-4000-8000-000000000001'), ('secretary','f0640000-0000-4000-8000-000000000002'),
 ('sec_official','f0640000-0000-4000-8000-000000000012'),
 ('res_past_approved','f0640000-0000-4000-8000-000000000101'), ('res_past_pending','f0640000-0000-4000-8000-000000000102'),
 ('res_future_cancelled','f0640000-0000-4000-8000-000000000103'), ('res_future_declined','f0640000-0000-4000-8000-000000000104'),
 ('res_notif','f0640000-0000-4000-8000-000000000111'), ('decoy_notif','f0640000-0000-4000-8000-000000000112'),
 ('health_a','f0640000-0000-4000-8000-000000000201'), ('health_b','f0640000-0000-4000-8000-000000000202'),
 ('program','f0640000-0000-4000-8000-000000000203'), ('medicine_a','f0640000-0000-4000-8000-000000000204'),
 ('medicine_b','f0640000-0000-4000-8000-000000000205'), ('nurse_slot','f0640000-0000-4000-8000-000000000206'),
 ('waste','f0640000-0000-4000-8000-000000000301'), ('registry','f0640000-0000-4000-8000-000000000401'),
 ('complaint','f0640000-0000-4000-8000-000000000501'), ('party','f0640000-0000-4000-8000-000000000502'),
 ('doc_request','f0640000-0000-4000-8000-000000000601'), ('sms','f0640000-0000-4000-8000-000000000701'),
 ('activity','f0640000-0000-4000-8000-000000000801');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select t.id,'authenticated','authenticated',t.k||'@legacy-064-test.invalid','',now(),'{}','{}',now(),now()
from t064 t where t.k in ('resident','secretary') on conflict(id) do nothing;
insert into public.profiles(id,full_name,role) values
 ((select t.id from t064 t where t.k='resident'),'Legacy Test Resident','resident'),
 ((select t.id from t064 t where t.k='secretary'),'Legacy Test Secretary','official')
on conflict(id) do update set full_name=excluded.full_name, role=excluded.role;
insert into public.barangay_officials(id,full_name,position,committee,contact_number,display_order,created_by,archived_at,archived_by)
values ((select t.id from t064 t where t.k='sec_official'),'Legacy Test Secretary','Barangay Secretary',null,null,906401,(select t.id from t064 t where t.k='secretary'),null,null);
insert into public.official_account_links(official_id,profile_id,linked_by)
values ((select t.id from t064 t where t.k='sec_official'),(select t.id from t064 t where t.k='secretary'),'migration-064 behavioral test');

-- Targets. The past pending booking makes notify_reservation write a reservation
-- notification; one more is written for the resident and marked read.
insert into public.reservations(id,full_name,purok,contact_number,residency_status,preferred_date,preferred_time,duration_hours,purpose,status,activity_type)
values
 ((select t.id from t064 t where t.k='res_past_approved'),'Legacy Test Booker A','Legacy Test Purok','09170000641','resident',(now() at time zone 'Asia/Manila')::date-400,'5:00 PM',1,'Legacy fixture','approved','Basketball'),
 ((select t.id from t064 t where t.k='res_past_pending'),'Legacy Test Booker B','Legacy Test Purok','09170000642','resident',(now() at time zone 'Asia/Manila')::date-10,'6:00 PM',1,'Legacy fixture','pending','Volleyball'),
 ((select t.id from t064 t where t.k='res_future_cancelled'),'Legacy Test Booker C','Legacy Test Purok','09170000643','resident',(now() at time zone 'Asia/Manila')::date+90,'5:00 PM',1,'Legacy fixture','cancelled','Basketball'),
 ((select t.id from t064 t where t.k='res_future_declined'),'Legacy Test Booker D','Legacy Test Purok','09170000644','resident',(now() at time zone 'Asia/Manila')::date+800,'6:00 PM',1,'Legacy fixture','declined','Basketball');
insert into public.notifications(id,audience,recipient_id,category,event,entity_type,entity_id,subject,link_tab,source_changed_at)
values ((select t.id from t064 t where t.k='res_notif'),'resident',(select t.id from t064 t where t.k='resident'),'reservation','approved','reservation',
        (select t.id from t064 t where t.k='res_past_approved'),'2025-01-01','reservations',now()),
       ((select t.id from t064 t where t.k='decoy_notif'),'resident',(select t.id from t064 t where t.k='resident'),'verification','verified','resident_account',
        (select t.id from t064 t where t.k='resident'),null,'settings',now());
insert into public.notification_reads(notification_id,user_id) values
 ((select t.id from t064 t where t.k='res_notif'),(select t.id from t064 t where t.k='resident')),
 ((select t.id from t064 t where t.k='decoy_notif'),(select t.id from t064 t where t.k='resident'));
insert into public.health_events(id,title) values
 ((select t.id from t064 t where t.k='health_a'),'Legacy Test Health Event A'), ((select t.id from t064 t where t.k='health_b'),'Legacy Test Health Event B');
insert into public.medical_programs(id,title,schedule_label,time_label) values ((select t.id from t064 t where t.k='program'),'Legacy Test Program','Mondays','8:00 AM');
insert into public.medicine_stock(id,name,status) values
 ((select t.id from t064 t where t.k='medicine_a'),'Legacy Test Medicine A','available'), ((select t.id from t064 t where t.k='medicine_b'),'Legacy Test Medicine B','low');
insert into public.nurse_availability(id,day_of_week,time_start,time_end,status) values ((select t.id from t064 t where t.k='nurse_slot'),'Monday','8:00 AM','5:00 PM','available');
insert into public.waste_schedule(id,purok,waste_type,day_of_week) values ((select t.id from t064 t where t.k='waste'),'Legacy Test Purok','Biodegradable','Monday');

-- Retained data that must survive untouched.
insert into public.residents_registry(id,full_name,purok) values ((select t.id from t064 t where t.k='registry'),'Legacy Test Voter','Legacy Test Purok');
insert into public.complaints(id,reference,intake_channel,category,narrative,status,location_note,encoded_by,created_at)
values ((select t.id from t064 t where t.k='complaint'),'CMP-064-FIXTURE','walk_in','other','Legacy-cleanup fixture complaint','received','Legacy Test Area',(select t.id from t064 t where t.k='secretary'),now());
insert into public.complaint_parties(id,complaint_id,party_role,full_name_snapshot,contact_number_snapshot)
values ((select t.id from t064 t where t.k='party'),(select t.id from t064 t where t.k='complaint'),'complainant','Legacy Test Complainant','0917-555-0640');
insert into public.document_requests(id,resident_id,document_type,full_name,purpose,status)
values ((select t.id from t064 t where t.k='doc_request'),(select t.id from t064 t where t.k='resident'),'Barangay Clearance','Legacy Test Resident','Legacy fixture','pending');
insert into public.sms_broadcasts(id,request_key,source_type,source_id,broadcast_kind,audience,message_text,preview_token,requested_by,dry_run)
values ((select t.id from t064 t where t.k='sms'),gen_random_uuid(),'announcement','f0640000-0000-4000-8000-0000000007aa','initial','{}','Legacy test SMS','legacy-064-token',(select t.id from t064 t where t.k='secretary'),true);
insert into public.sms_source_rules(source_type,source_id,audience,updated_by)
values ('event','f0640000-0000-4000-8000-0000000007bb','{}',(select t.id from t064 t where t.k='secretary'));
insert into public.activity_log(id,actor_id,actor_name,action,entity_type,entity_id,subject)
values ((select t.id from t064 t where t.k='activity'),(select t.id from t064 t where t.k='secretary'),'Legacy Test Secretary','approved','reservation',
        (select t.id from t064 t where t.k='res_past_approved'),'Legacy fixture reservation');

do $tests$
declare
  sec uuid := (select t.id from t064 t where t.k='secretary');
  res uuid := (select t.id from t064 t where t.k='resident');
  ref text := (select reference from public.complaints where id = (select t.id from t064 t where t.k='complaint'));
  health_a text := (select t.id::text from t064 t where t.k='health_a');
  program_id text := (select t.id::text from t064 t where t.k='program');
  g jsonb; before_ret jsonb; before_probe jsonb; after_probe jsonb; r jsonb; v_key text;
begin
  perform pg_temp.check(ref is not null
    and (select count(*) from public.notifications where category = 'reservation') >= 2
    and (select count(*) from public.reservations) >= 4 and (select count(*) from public.health_events) >= 2
    and (select count(*) from public.medical_programs) >= 1 and (select count(*) from public.medicine_stock) >= 2
    and (select count(*) from public.nurse_availability) >= 1 and (select count(*) from public.waste_schedule) >= 1,
    'SETUP FAILED: target fixtures are not all present');

  ---------------------------------------------------------------------------------
  -- G. Every gate refuses, and a refusal leaves EVERY table byte-identical.
  ---------------------------------------------------------------------------------
  g := pg_temp.guard_case(null, pg_temp.m064_shipped_cfg());
  perform pg_temp.check(g->>'message' ilike '%placeholder%' and (g->>'unchanged')::boolean,
    'TEST G1 FAILED: the migration as shipped did not refuse (placeholders) cleanly: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(null, pg_temp.cfg() - 'restore_rehearsal');
  perform pg_temp.check(g->>'message' ilike '%missing%restore_rehearsal%' and (g->>'unchanged')::boolean,
    'TEST G2 FAILED: a missing restore-rehearsal record was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(null, pg_temp.cfg('{"retention_authorization":"<<REQUIRED: retention reference>>"}'));
  perform pg_temp.check(g->>'message' ilike '%retention_authorization%placeholder%' and (g->>'unchanged')::boolean,
    'TEST G3 FAILED: a missing retention authorization was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(null, pg_temp.cfg('{"booking_resolution":"pending"}'));
  perform pg_temp.check(g->>'message' ilike '%booking_resolution%' and (g->>'unchanged')::boolean,
    'TEST G4 FAILED: an unattested booking resolution was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(null, pg_temp.cfg(jsonb_build_object('export_manifest_sha256', repeat('0', 64))));
  perform pg_temp.check(g->>'message' ilike '%SHA-256%' and (g->>'unchanged')::boolean,
    'TEST G5 FAILED: an incomplete backup manifest checksum was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(null, pg_temp.cfg(jsonb_build_object('counts_taken_on',
         to_char((now() at time zone 'Asia/Manila')::date - 5, 'YYYY-MM-DD'))));
  perform pg_temp.check(g->>'message' ilike '%within the last 2 days%' and (g->>'unchanged')::boolean,
    'TEST G6 FAILED: stale counts were not refused: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(null, pg_temp.cfg('{"expected_waste_schedule":"two"}'));
  perform pg_temp.check(g->>'message' ilike '%whole-number%' and (g->>'unchanged')::boolean,
    'TEST G7 FAILED: a non-numeric approved count was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(null, pg_temp.cfg(jsonb_build_object('expected_reservations', ((select count(*) from public.reservations) + 1)::text)));
  perform pg_temp.check(g->>'message' ilike '%count mismatch%reservations%' and (g->>'unchanged')::boolean,
    'TEST G8 FAILED: a reservation count mismatch was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(null, pg_temp.cfg('{"expected_reservation_notification_reads":"0"}'));
  perform pg_temp.check(g->>'message' ilike '%count mismatch%notification_reads%' and (g->>'unchanged')::boolean,
    'TEST G9 FAILED: a read-mark count mismatch was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(format($s$insert into public.reservations(full_name,purok,contact_number,residency_status,preferred_date,preferred_time,duration_hours,purpose,status,activity_type)
      values('Legacy Test Future Approved','Legacy Test Purok','09170000645','resident',%L,'5:00 PM',1,'Legacy fixture','approved','Basketball')$s$,
      (now() at time zone 'Asia/Manila')::date + 30), null);
  perform pg_temp.check(g->>'message' ilike '%future pending/approved%' and (g->>'unchanged')::boolean,
    'TEST G10 FAILED: an unresolved future APPROVED booking did not block deletion: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(format($s$insert into public.reservations(full_name,purok,contact_number,residency_status,preferred_date,preferred_time,duration_hours,purpose,status,activity_type)
      values('Legacy Test Future Pending','Legacy Test Purok','09170000646','resident',%L,'6:00 PM',1,'Legacy fixture','pending','Basketball')$s$,
      (now() at time zone 'Asia/Manila')::date + 801), null);
  perform pg_temp.check(g->>'message' ilike '%future pending/approved%' and (g->>'unchanged')::boolean,
    'TEST G11 FAILED: an unresolved future PENDING booking did not block deletion: '||coalesce(g->>'message','NOT REFUSED'));

  -- A booking dated TODAY is still a future commitment (Manila date boundary).
  g := pg_temp.guard_case(format($s$insert into public.reservations(full_name,purok,contact_number,residency_status,preferred_date,preferred_time,duration_hours,purpose,status,activity_type)
      values('Legacy Test Today','Legacy Test Purok','09170000647','resident',%L,'9:00 PM',1,'Legacy fixture','approved','Basketball')$s$,
      (now() at time zone 'Asia/Manila')::date), null);
  perform pg_temp.check(g->>'message' ilike '%future pending/approved%' and (g->>'unchanged')::boolean,
    'TEST G12 FAILED: a booking dated today did not block deletion: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(format($s$insert into public.sms_broadcasts(request_key,source_type,source_id,broadcast_kind,audience,message_text,preview_token,requested_by,dry_run)
      values(gen_random_uuid(),'health_event',%L,'initial','{}','Legacy test','legacy-064-health',%L,true)$s$, health_a, sec), null);
  perform pg_temp.check(g->>'message' ilike '%SMS%' and (g->>'unchanged')::boolean,
    'TEST G13 FAILED: an SMS broadcast using a health source did not block deletion: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case(format($s$insert into public.sms_source_rules(source_type,source_id,audience,updated_by)
      values('medical_program',%L,'{}',%L)$s$, program_id, sec), null);
  perform pg_temp.check(g->>'message' ilike '%SMS%' and (g->>'unchanged')::boolean,
    'TEST G14 FAILED: an SMS source rule using a medical program did not block deletion: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case($s$select set_config('request.jwt.claims','{"role":"authenticated"}',true)$s$, null);
  perform pg_temp.check(g->>'message' ilike '%SQL Editor%' and (g->>'unchanged')::boolean,
    'TEST G15 FAILED: an API caller was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  g := pg_temp.guard_case('grant execute on function public.get_reservation_slots(date) to anon', null);
  perform pg_temp.check(g->>'message' ilike '%063 is not applied%' and (g->>'unchanged')::boolean,
    'TEST G16 FAILED: running without migration 063 in place was not refused: '||coalesce(g->>'message','NOT REFUSED'));

  -- Atomicity: a failure AFTER seven of the eight deletes have run must undo them all.
  g := pg_temp.guard_case($s$
    create function public.zz_t064_fail() returns trigger language plpgsql as $f$
    begin raise exception 'deliberate mid-deletion failure'; end $f$@@NEXT@@
    create trigger zz_t064_fail before delete on public.waste_schedule for each row execute function public.zz_t064_fail()$s$, null);
  perform pg_temp.check(g->>'message' ilike '%deliberate mid-deletion failure%' and (g->>'unchanged')::boolean,
    'TEST G17 FAILED: a mid-deletion failure did not roll back the earlier deletions: '||coalesce(g->>'message','NOT REFUSED'));

  -- The post-delete fingerprint check catches collateral change to retained data.
  g := pg_temp.guard_case($s$
    create function public.zz_t064_collateral() returns trigger language plpgsql as $f$
    begin update public.residents_registry set purok = purok || ' (changed)' where full_name = 'Legacy Test Voter'; return old; end $f$@@NEXT@@
    create trigger zz_t064_collateral after delete on public.health_events for each row execute function public.zz_t064_collateral()$s$, null);
  perform pg_temp.check(g->>'message' ilike '%data outside the targets changed%residents_registry%' and (g->>'unchanged')::boolean,
    'TEST G18 FAILED: collateral change to retained data was not detected and rolled back: '||coalesce(g->>'message','NOT REFUSED'));

  ---------------------------------------------------------------------------------
  -- S. The authorized run: targets removed, everything else identical.
  ---------------------------------------------------------------------------------
  before_ret := pg_temp.fp_retained();
  before_probe := pg_temp.probe(ref, sec, res);
  perform pg_temp.check((before_probe#>>'{track_right,data}')::int = 1 and (before_probe#>>'{track_wrong,data}')::int = 0
    and (before_probe#>>'{case_search,data}')::int >= 1,
    'SETUP FAILED: retained-service probes did not see their fixtures before the run: '||before_probe::text);

  perform pg_temp.clear_actor();
  perform pg_temp.m064_run(pg_temp.cfg());

  perform pg_temp.check(not exists (select 1 from public.reservations) and not exists (select 1 from public.medical_programs)
    and not exists (select 1 from public.health_events) and not exists (select 1 from public.medicine_stock)
    and not exists (select 1 from public.nurse_availability) and not exists (select 1 from public.waste_schedule),
    'TEST S1 FAILED: a retired target table still holds rows');
  perform pg_temp.check(not exists (select 1 from public.notifications where category = 'reservation')
    and not exists (select 1 from public.notification_reads where notification_id = (select t.id from t064 t where t.k='res_notif')),
    'TEST S2 FAILED: reservation notifications or their read marks remain');
  perform pg_temp.check(exists (select 1 from public.notifications where id = (select t.id from t064 t where t.k='decoy_notif'))
    and exists (select 1 from public.notification_reads where notification_id = (select t.id from t064 t where t.k='decoy_notif'))
    and exists (select 1 from public.notifications where category = 'document_request' and entity_id = (select t.id from t064 t where t.k='doc_request')),
    'TEST S3 FAILED: an unrelated notification or read mark was removed');
  perform pg_temp.check(pg_temp.fp_retained() = before_ret,
    'TEST S4 FAILED: data outside the targets changed (fingerprint differs)');
  perform pg_temp.check(exists (select 1 from public.residents_registry where id = (select t.id from t064 t where t.k='registry'))
    and exists (select 1 from public.complaint_parties where id = (select t.id from t064 t where t.k='party'))
    and exists (select 1 from public.activity_log where id = (select t.id from t064 t where t.k='activity'))
    and exists (select 1 from public.sms_broadcasts where id = (select t.id from t064 t where t.k='sms'))
    and exists (select 1 from public.sms_source_rules where source_id = 'f0640000-0000-4000-8000-0000000007bb')
    and exists (select 1 from public.profiles where id = sec) and exists (select 1 from auth.users where id = res)
    and exists (select 1 from public.document_requests where id = (select t.id from t064 t where t.k='doc_request')),
    'TEST S5 FAILED: a named retained record was removed');
  perform pg_temp.check((select count(*) from pg_trigger where tgrelid = 'public.reservations'::regclass and not tgisinternal) = 4
    and exists (select 1 from pg_constraint where conname = 'reservations_no_overlapping_slots')
    and to_regclass('public.health_events') is not null and to_regclass('public.waste_schedule') is not null
    and to_regprocedure('public.normalize_reservation_reference(text)') is not null
    and to_regprocedure('public.sms_source_content(text,text)') is not null
    and not has_function_privilege('anon', 'public.get_reservation_slots(date)', 'EXECUTE'),
    'TEST S6 FAILED: structure or migration-063 privileges changed (064 must drop and grant nothing)');

  ---------------------------------------------------------------------------------
  -- R. Retained services behave exactly as before.
  ---------------------------------------------------------------------------------
  after_probe := pg_temp.probe(ref, sec, res);
  foreach v_key in array array['track_right','track_wrong','case_search','people_search','tanod','analytics','credit_admin','credit_mine','docs_visible'] loop
    perform pg_temp.check(after_probe->v_key = before_probe->v_key,
      format('TEST R1 FAILED: retained service %s changed: before %s after %s', v_key, before_probe->v_key, after_probe->v_key));
  end loop;
  perform pg_temp.check((after_probe#>>'{track_right,data}')::int = 1 and (after_probe#>>'{track_wrong,data}')::int = 0,
    'TEST R2 FAILED: public complaint tracking stopped working (or stopped requiring the contact)');
  foreach v_key in array array['people_search','tanod','analytics','credit_admin'] loop
    perform pg_temp.check(after_probe#>>array[v_key,'state'] = '00000',
      format('TEST R3 FAILED: %s is not operational for the Secretary: %s', v_key, after_probe->v_key));
  end loop;

  r := pg_temp.as_actor(sec, 'authenticated', format(
    'update public.document_requests set status=''approved'', reviewed_by=%L where id=%L returning to_jsonb(id)', sec, (select t.id from t064 t where t.k='doc_request')));
  perform pg_temp.check(r->>'state' = '00000' and r->>'data' is not null,
    'TEST R4 FAILED: the Secretary can no longer decide a document request: '||r::text);

  r := pg_temp.as_actor(sec, 'authenticated', format('select to_jsonb(true) from public.link_complaint_party(%L,''registry'',%L)',
    (select t.id from t064 t where t.k='party'), (select t.id from t064 t where t.k='registry')));
  perform pg_temp.check(r->>'state' = '00000'
    and (select registry_entry_id from public.complaint_parties where id = (select t.id from t064 t where t.k='party')) = (select t.id from t064 t where t.k='registry'),
    'TEST R5 FAILED: complaint person-linking to the voter registry broke: '||r::text);
end;
$tests$;

reset role;
select 'PASS: all migration-064 behavioral contracts passed (18 gate, 6 removal/preservation, 5 regression); transaction will now roll back.' as result;
rollback;
