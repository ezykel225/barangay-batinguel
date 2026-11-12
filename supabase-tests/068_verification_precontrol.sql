-- PREPARED ONLY: run on the approved disposable LEGACY clone before 068.
-- Same variables and synthetic manifest as the post-patch harness.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='30s';
\ir 068_verification_test_support.sql
select pg_temp.assert_true(md5(pg_get_functiondef('public.prevent_role_self_change()'::regprocedure))=:'legacy_guard_md5','reviewed legacy guard fingerprint');
select pg_temp.assert_true((select verification_status='pending' from public.profiles where id=:'target_id'),'pending target');
select pg_temp.assert_true((select verification_status='rejected' from public.profiles where id=:'resident_id'),'rejected resident');
select set_config('request.jwt.claims',jsonb_build_object('sub',:'ordinary_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'ordinary_id',false);
select pg_temp.assert_true(public.current_official_is_active(),'active ordinary official');
-- These MUST succeed on the documented legacy baseline, then fail after 068.
select pg_temp.expect_update(format('update public.profiles set verification_status=''verified'' where id=%L',:'target_id'),true,'legacy ordinary approval vulnerability');
select pg_temp.expect_update(format('update public.profiles set verification_status=''rejected'' where id=%L',:'target_id'),true,'legacy ordinary rejection vulnerability');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'resident_id','role','authenticated')::text,true) \gset
set local role authenticated;
select pg_temp.baseline_actor(:'resident_id',false);
select pg_temp.expect_update(format('update public.profiles set verification_notes=coalesce(verification_notes,'''')||''TEST_ONLY_CONTROL'' where id=%L',:'resident_id'),true,'legacy owner metadata vulnerability');
select pg_temp.expect_update(format('update public.profiles set system_id=''TEST_ONLY_CONTROL'' where id=%L',:'resident_id'),true,'legacy owner identifier vulnerability');
reset role;
rollback;
\ir 068_verification_cleanup_check.sql
